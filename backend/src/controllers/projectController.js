const mongoose = require('mongoose');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Comment = require('../models/Comment');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const { logActivity } = require('../utils/activityLogger');
const { createNotification } = require('../utils/notificationHelper');
const { getIO } = require('../sockets/socketHandler');

// @desc    Create new project
// @route   POST /api/projects
// @access  Private
const createProject = async (req, res, next) => {
  try {
    const { name, description, startDate, dueDate, priority, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Project name is required'
      });
    }

    const project = await Project.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      owner: req.user._id,
      members: [
        {
          user: req.user._id,
          role: 'Owner',
          joinedAt: new Date()
        }
      ],
      startDate: startDate || null,
      dueDate: dueDate || null,
      priority: priority || 'Medium',
      status: status || 'Active'
    });

    await logActivity({
      project: project._id,
      user: req.user,
      action: 'created_project',
      description: `${req.user.name} created project "${project.name}"`
    });

    const populatedProject = await Project.findById(project._id)
      .populate('owner', 'name email profileImage')
      .populate('members.user', 'name email profileImage');

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project: populatedProject
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all projects for current user (with progress & filters)
// @route   GET /api/projects
// @access  Private
const getProjects = async (req, res, next) => {
  try {
    const { status, priority, search } = req.query;
    const userId = req.user._id;

    const filter = {
      $or: [{ owner: userId }, { 'members.user': userId }]
    };

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (priority && priority !== 'all') {
      filter.priority = priority;
    }

    if (search && search.trim()) {
      filter.name = { $regex: search.trim(), $options: 'i' };
    }

    const projects = await Project.find(filter)
      .populate('owner', 'name email profileImage')
      .populate('members.user', 'name email profileImage')
      .sort({ updatedAt: -1 });

    // Calculate progress for each project based on tasks
    const projectListWithProgress = await Promise.all(
      projects.map(async (project) => {
        const totalTasks = await Task.countDocuments({ project: project._id });
        const completedTasks = await Task.countDocuments({
          project: project._id,
          status: 'Completed'
        });
        const progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

        return {
          ...project.toObject(),
          totalTasks,
          completedTasks,
          progress
        };
      })
    );

    res.json({
      success: true,
      count: projectListWithProgress.length,
      projects: projectListWithProgress
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single project by ID
// @route   GET /api/projects/:id
// @access  Private (Owner or Member)
const getProjectById = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('owner', 'name email profileImage')
      .populate('members.user', 'name email profileImage');

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const userIdStr = req.user._id.toString();
    const isOwner = project.owner._id.toString() === userIdStr;
    const memberObj = project.members.find(
      (m) => m.user && m.user._id.toString() === userIdStr
    );

    if (!isOwner && !memberObj) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not a member of this project'
      });
    }

    const totalTasks = await Task.countDocuments({ project: project._id });
    const completedTasks = await Task.countDocuments({
      project: project._id,
      status: 'Completed'
    });
    const progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    const currentUserRole = isOwner ? 'Owner' : memberObj.role;

    res.json({
      success: true,
      project: {
        ...project.toObject(),
        totalTasks,
        completedTasks,
        progress,
        currentUserRole
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update project
// @route   PUT /api/projects/:id
// @access  Private (Owner or Admin)
const updateProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const userIdStr = req.user._id.toString();
    const isOwner = project.owner.toString() === userIdStr;
    const memberObj = project.members.find(
      (m) => m.user.toString() === userIdStr
    );
    const isAdmin = memberObj && memberObj.role === 'Admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: Requires Project Owner or Admin role'
      });
    }

    const { name, description, startDate, dueDate, priority, status } = req.body;

    if (name) project.name = name.trim();
    if (description !== undefined) project.description = description.trim();
    if (startDate !== undefined) project.startDate = startDate || null;
    if (dueDate !== undefined) project.dueDate = dueDate || null;
    if (priority) project.priority = priority;
    if (status) project.status = status;

    await project.save();

    await logActivity({
      project: project._id,
      user: req.user,
      action: 'updated_project',
      description: `${req.user.name} updated project details for "${project.name}"`
    });

    const updated = await Project.findById(project._id)
      .populate('owner', 'name email profileImage')
      .populate('members.user', 'name email profileImage');

    const io = getIO();
    if (io) {
      io.to(`project_${project._id}`).emit('project_updated', updated);
    }

    res.json({
      success: true,
      message: 'Project updated successfully',
      project: updated
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete project
// @route   DELETE /api/projects/:id
// @access  Private (Owner only)
const deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: Only the Project Owner can delete this project'
      });
    }

    const projectId = project._id;
    const projectName = project.name;

    // Delete tasks, comments, activity logs for this project
    await Task.deleteMany({ project: projectId });
    await Comment.deleteMany({ project: projectId });
    await ActivityLog.deleteMany({ project: projectId });
    await Project.findByIdAndDelete(projectId);

    const io = getIO();
    if (io) {
      io.to(`project_${projectId}`).emit('project_deleted', {
        projectId,
        name: projectName
      });
    }

    res.json({
      success: true,
      message: `Project "${projectName}" deleted successfully`
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add / invite team member to project
// @route   POST /api/projects/:id/members
// @access  Private (Owner or Admin)
const addMember = async (req, res, next) => {
  try {
    const { email, userId, role } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const currentUserIdStr = req.user._id.toString();
    const isOwner = project.owner.toString() === currentUserIdStr;
    const memberObj = project.members.find(
      (m) => m.user.toString() === currentUserIdStr
    );
    const isAdmin = memberObj && memberObj.role === 'Admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: Requires Project Owner or Admin role'
      });
    }

    // Find the user to add
    let targetUser = null;
    if (userId) {
      targetUser = await User.findById(userId);
    } else if (email) {
      targetUser = await User.findOne({ email: email.toLowerCase().trim() });
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User with provided email or ID not found'
      });
    }

    const targetUserIdStr = targetUser._id.toString();

    // Check if already member
    const alreadyMember = project.members.some(
      (m) => m.user.toString() === targetUserIdStr
    );
    if (alreadyMember) {
      return res.status(400).json({
        success: false,
        message: `${targetUser.name} is already a member of this project`
      });
    }

    const memberRole = role === 'Admin' ? 'Admin' : 'Member';
    project.members.push({
      user: targetUser._id,
      role: memberRole,
      joinedAt: new Date()
    });

    await project.save();

    await logActivity({
      project: project._id,
      user: req.user,
      action: 'added_member',
      description: `${req.user.name} added ${targetUser.name} (${memberRole}) to the project`
    });

    // Notify the added user
    await createNotification({
      recipient: targetUser._id,
      project: project._id,
      type: 'project_invite',
      message: `You were added to project "${project.name}" as ${memberRole}`
    });

    const updated = await Project.findById(project._id)
      .populate('owner', 'name email profileImage')
      .populate('members.user', 'name email profileImage');

    const io = getIO();
    if (io) {
      io.to(`project_${project._id}`).emit('member_added', {
        project: updated,
        member: {
          user: {
            _id: targetUser._id,
            name: targetUser.name,
            email: targetUser.email,
            profileImage: targetUser.profileImage
          },
          role: memberRole
        }
      });
    }

    res.json({
      success: true,
      message: `Added ${targetUser.name} to the project`,
      members: updated.members
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove team member from project
// @route   DELETE /api/projects/:id/members/:userId
// @access  Private (Owner or Admin)
const removeMember = async (req, res, next) => {
  try {
    const { id: projectId, userId } = req.params;
    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const currentUserIdStr = req.user._id.toString();
    const isOwner = project.owner.toString() === currentUserIdStr;
    const memberObj = project.members.find(
      (m) => m.user.toString() === currentUserIdStr
    );
    const isAdmin = memberObj && memberObj.role === 'Admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: Requires Project Owner or Admin role'
      });
    }

    // Cannot remove project owner
    if (project.owner.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove the Project Owner'
      });
    }

    const memberToRemove = project.members.find(
      (m) => m.user.toString() === userId
    );
    if (!memberToRemove) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in this project'
      });
    }

    // Admins cannot remove other Admins or Owner
    if (!isOwner && memberToRemove.role === 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Admins cannot remove other Admins. Only Project Owner can.'
      });
    }

    project.members = project.members.filter(
      (m) => m.user.toString() !== userId
    );
    await project.save();

    const removedUser = await User.findById(userId).select('name');

    await logActivity({
      project: project._id,
      user: req.user,
      action: 'removed_member',
      description: `${req.user.name} removed ${removedUser ? removedUser.name : 'a member'} from the project`
    });

    await createNotification({
      recipient: userId,
      project: project._id,
      type: 'member_removed',
      message: `You were removed from project "${project.name}"`
    });

    const updated = await Project.findById(project._id)
      .populate('owner', 'name email profileImage')
      .populate('members.user', 'name email profileImage');

    const io = getIO();
    if (io) {
      io.to(`project_${project._id}`).emit('member_removed', {
        projectId: project._id,
        userId
      });
    }

    res.json({
      success: true,
      message: 'Member removed successfully',
      members: updated.members
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update team member role (Owner only)
// @route   PUT /api/projects/:id/members/:userId
// @access  Private (Owner only)
const updateMemberRole = async (req, res, next) => {
  try {
    const { id: projectId, userId } = req.params;
    const { role } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: Only Project Owner can change member roles'
      });
    }

    if (project.owner.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change the Project Owner role'
      });
    }

    const member = project.members.find((m) => m.user.toString() === userId);
    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in this project'
      });
    }

    if (!['Admin', 'Member'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be Admin or Member'
      });
    }

    member.role = role;
    await project.save();

    const targetUser = await User.findById(userId).select('name');

    await logActivity({
      project: project._id,
      user: req.user,
      action: 'updated_role',
      description: `${req.user.name} changed ${targetUser ? targetUser.name : 'user'}'s role to ${role}`
    });

    const updated = await Project.findById(project._id)
      .populate('owner', 'name email profileImage')
      .populate('members.user', 'name email profileImage');

    const io = getIO();
    if (io) {
      io.to(`project_${project._id}`).emit('member_updated', {
        projectId: project._id,
        userId,
        role
      });
    }

    res.json({
      success: true,
      message: 'Member role updated successfully',
      members: updated.members
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
  addMember,
  removeMember,
  updateMemberRole
};
