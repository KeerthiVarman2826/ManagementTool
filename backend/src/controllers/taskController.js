const mongoose = require('mongoose');
const Task = require('../models/Task');
const Project = require('../models/Project');
const Comment = require('../models/Comment');
const { logActivity } = require('../utils/activityLogger');
const { createNotification } = require('../utils/notificationHelper');
const { getIO } = require('../sockets/socketHandler');

// Helper to check user access to a project
const checkUserProjectAccess = async (projectId, userId) => {
  const project = await Project.findById(projectId);
  if (!project) return { authorized: false, reason: 'Project not found' };

  const userIdStr = userId.toString();
  const isOwner = project.owner.toString() === userIdStr;
  const member = project.members.find((m) => m.user.toString() === userIdStr);

  if (!isOwner && !member) {
    return { authorized: false, reason: 'Not a member of this project' };
  }

  return {
    authorized: true,
    project,
    role: isOwner ? 'Owner' : member.role
  };
};

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private
const createTask = async (req, res, next) => {
  try {
    const {
      title,
      description,
      project: projectId,
      assignedTo,
      priority,
      status,
      startDate,
      dueDate,
      labels
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Task title is required'
      });
    }

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'Project ID is required'
      });
    }

    const access = await checkUserProjectAccess(projectId, req.user._id);
    if (!access.authorized) {
      return res.status(403).json({
        success: false,
        message: access.reason
      });
    }

    // Determine card order in the column
    const taskStatus = status || 'To Do';
    const lastTask = await Task.findOne({
      project: projectId,
      status: taskStatus
    }).sort({ order: -1 });

    const order = lastTask ? lastTask.order + 1 : 0;

    let parsedLabels = [];
    if (Array.isArray(labels)) {
      parsedLabels = labels.map((l) => l.trim()).filter(Boolean);
    } else if (typeof labels === 'string' && labels.trim()) {
      parsedLabels = labels.split(',').map((l) => l.trim()).filter(Boolean);
    }

    const task = await Task.create({
      title: title.trim(),
      description: description ? description.trim() : '',
      project: projectId,
      assignedTo: assignedTo || null,
      createdBy: req.user._id,
      priority: priority || 'Medium',
      status: taskStatus,
      startDate: startDate || null,
      dueDate: dueDate || null,
      labels: parsedLabels,
      order
    });

    await logActivity({
      project: projectId,
      user: req.user,
      action: 'created_task',
      description: `${req.user.name} created task "${task.title}"`
    });

    // Notify assigned user if different from creator
    if (assignedTo && assignedTo.toString() !== req.user._id.toString()) {
      await createNotification({
        recipient: assignedTo,
        project: projectId,
        task: task._id,
        type: 'task_assigned',
        message: `${req.user.name} assigned you to task "${task.title}" in "${access.project.name}"`
      });
    }

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email profileImage')
      .populate('createdBy', 'name email profileImage')
      .populate('project', 'name');

    const io = getIO();
    if (io) {
      io.to(`project_${projectId}`).emit('task_created', populatedTask);
    }

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task: populatedTask
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get tasks (filtered by project or assigned to me)
// @route   GET /api/tasks
// @access  Private
const getTasks = async (req, res, next) => {
  try {
    const {
      project: projectId,
      assignedTo,
      priority,
      status,
      search,
      overdue,
      assignedToMe
    } = req.query;

    const filter = {};

    if (projectId) {
      const access = await checkUserProjectAccess(projectId, req.user._id);
      if (!access.authorized) {
        return res.status(403).json({
          success: false,
          message: access.reason
        });
      }
      filter.project = projectId;
    } else {
      // Find all projects user belongs to
      const userProjects = await Project.find({
        $or: [{ owner: req.user._id }, { 'members.user': req.user._id }]
      }).select('_id');
      const projectIds = userProjects.map((p) => p._id);
      filter.project = { $in: projectIds };
    }

    if (assignedToMe === 'true') {
      filter.assignedTo = req.user._id;
    } else if (assignedTo && assignedTo !== 'all') {
      filter.assignedTo = assignedTo;
    }

    if (priority && priority !== 'all') {
      filter.priority = priority;
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search && search.trim()) {
      filter.title = { $regex: search.trim(), $options: 'i' };
    }

    if (overdue === 'true') {
      filter.status = { $ne: 'Completed' };
      filter.dueDate = { $lt: new Date() };
    }

    const tasks = await Task.find(filter)
      .populate('assignedTo', 'name email profileImage')
      .populate('createdBy', 'name email profileImage')
      .populate('project', 'name owner')
      .sort({ order: 1, createdAt: -1 });

    res.json({
      success: true,
      count: tasks.length,
      tasks
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single task by ID
// @route   GET /api/tasks/:id
// @access  Private
const getTaskById = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name email profileImage')
      .populate('createdBy', 'name email profileImage')
      .populate('project', 'name owner members');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const access = await checkUserProjectAccess(task.project._id, req.user._id);
    if (!access.authorized) {
      return res.status(403).json({
        success: false,
        message: access.reason
      });
    }

    res.json({
      success: true,
      task
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update task
// @route   PUT /api/tasks/:id
// @access  Private
const updateTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const access = await checkUserProjectAccess(task.project, req.user._id);
    if (!access.authorized) {
      return res.status(403).json({
        success: false,
        message: access.reason
      });
    }

    const {
      title,
      description,
      assignedTo,
      priority,
      status,
      startDate,
      dueDate,
      labels,
      order
    } = req.body;

    const previousAssignedTo = task.assignedTo ? task.assignedTo.toString() : null;
    const previousStatus = task.status;

    if (title) task.title = title.trim();
    if (description !== undefined) task.description = description.trim();
    if (priority) task.priority = priority;
    if (startDate !== undefined) task.startDate = startDate || null;
    if (dueDate !== undefined) task.dueDate = dueDate || null;
    if (typeof order === 'number') task.order = order;

    if (labels !== undefined) {
      if (Array.isArray(labels)) {
        task.labels = labels.map((l) => l.trim()).filter(Boolean);
      } else if (typeof labels === 'string') {
        task.labels = labels.split(',').map((l) => l.trim()).filter(Boolean);
      }
    }

    let reassigned = false;
    if (assignedTo !== undefined) {
      const newAssignedToStr = assignedTo ? assignedTo.toString() : null;
      if (newAssignedToStr !== previousAssignedTo) {
        task.assignedTo = assignedTo || null;
        reassigned = true;
      }
    }

    let statusChanged = false;
    if (status && status !== previousStatus) {
      task.status = status;
      statusChanged = true;
    }

    await task.save();

    // Log activity and create notifications
    if (statusChanged) {
      await logActivity({
        project: task.project,
        user: req.user,
        action: 'updated_task_status',
        description: `${req.user.name} moved task "${task.title}" to ${task.status}`
      });

      if (task.assignedTo && task.assignedTo.toString() !== req.user._id.toString()) {
        await createNotification({
          recipient: task.assignedTo,
          project: task.project,
          task: task._id,
          type: 'task_status_changed',
          message: `${req.user.name} changed status of "${task.title}" to ${task.status}`
        });
      }
    }

    if (reassigned && task.assignedTo) {
      await logActivity({
        project: task.project,
        user: req.user,
        action: 'reassigned_task',
        description: `${req.user.name} reassigned task "${task.title}"`
      });

      if (task.assignedTo.toString() !== req.user._id.toString()) {
        await createNotification({
          recipient: task.assignedTo,
          project: task.project,
          task: task._id,
          type: 'task_reassigned',
          message: `${req.user.name} assigned you to task "${task.title}"`
        });
      }
    }

    const updatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email profileImage')
      .populate('createdBy', 'name email profileImage')
      .populate('project', 'name');

    const io = getIO();
    if (io) {
      io.to(`project_${task.project}`).emit('task_updated', updatedTask);
    }

    res.json({
      success: true,
      message: 'Task updated successfully',
      task: updatedTask
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Fast update task status and order (Kanban Drag and Drop)
// @route   PUT /api/tasks/:id/status
// @access  Private
const updateTaskStatus = async (req, res, next) => {
  try {
    const { status, order } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const access = await checkUserProjectAccess(task.project, req.user._id);
    if (!access.authorized) {
      return res.status(403).json({
        success: false,
        message: access.reason
      });
    }

    const oldStatus = task.status;
    if (status) task.status = status;
    if (typeof order === 'number') task.order = order;

    await task.save();

    if (oldStatus !== task.status) {
      await logActivity({
        project: task.project,
        user: req.user,
        action: 'moved_task',
        description: `${req.user.name} moved "${task.title}" from ${oldStatus} to ${task.status}`
      });

      if (task.assignedTo && task.assignedTo.toString() !== req.user._id.toString()) {
        await createNotification({
          recipient: task.assignedTo,
          project: task.project,
          task: task._id,
          type: 'task_status_changed',
          message: `${req.user.name} moved "${task.title}" to ${task.status}`
        });
      }
    }

    const updatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email profileImage')
      .populate('createdBy', 'name email profileImage')
      .populate('project', 'name');

    const io = getIO();
    if (io) {
      io.to(`project_${task.project}`).emit('task_moved', {
        taskId: task._id,
        status: task.status,
        order: task.order,
        task: updatedTask
      });
    }

    res.json({
      success: true,
      message: 'Task status updated',
      task: updatedTask
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete task
// @route   DELETE /api/tasks/:id
// @access  Private (Owner, Admin, or Task Creator)
const deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const access = await checkUserProjectAccess(task.project, req.user._id);
    if (!access.authorized) {
      return res.status(403).json({
        success: false,
        message: access.reason
      });
    }

    const isCreator = task.createdBy.toString() === req.user._id.toString();
    const isOwnerOrAdmin = access.role === 'Owner' || access.role === 'Admin';

    if (!isCreator && !isOwnerOrAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: Only task creator, project admin, or owner can delete this task'
      });
    }

    const projectId = task.project;
    const taskTitle = task.title;

    await Comment.deleteMany({ task: task._id });
    await Task.findByIdAndDelete(task._id);

    await logActivity({
      project: projectId,
      user: req.user,
      action: 'deleted_task',
      description: `${req.user.name} deleted task "${taskTitle}"`
    });

    const io = getIO();
    if (io) {
      io.to(`project_${projectId}`).emit('task_deleted', {
        taskId: task._id,
        title: taskTitle
      });
    }

    res.json({
      success: true,
      message: `Task "${taskTitle}" deleted successfully`
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  updateTaskStatus,
  deleteTask
};
