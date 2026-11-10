const Comment = require('../models/Comment');
const Task = require('../models/Task');
const Project = require('../models/Project');
const { logActivity } = require('../utils/activityLogger');
const { createNotification } = require('../utils/notificationHelper');
const { getIO } = require('../sockets/socketHandler');

// Helper to check user access to task
const verifyTaskAccess = async (taskId, userId) => {
  const task = await Task.findById(taskId);
  if (!task) return { authorized: false, reason: 'Task not found' };

  const project = await Project.findById(task.project);
  if (!project) return { authorized: false, reason: 'Project not found' };

  const userIdStr = userId.toString();
  const isOwner = project.owner.toString() === userIdStr;
  const member = project.members.find((m) => m.user.toString() === userIdStr);

  if (!isOwner && !member) {
    return { authorized: false, reason: 'Access denied: Not a project member' };
  }

  return {
    authorized: true,
    task,
    project,
    role: isOwner ? 'Owner' : member.role
  };
};

// @desc    Add comment to a task
// @route   POST /api/tasks/:id/comments
// @access  Private
const createComment = async (req, res, next) => {
  try {
    const { content } = req.body;
    const taskId = req.params.id;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Comment content cannot be empty'
      });
    }

    const access = await verifyTaskAccess(taskId, req.user._id);
    if (!access.authorized) {
      return res.status(403).json({
        success: false,
        message: access.reason
      });
    }

    const comment = await Comment.create({
      task: taskId,
      project: access.task.project,
      author: req.user._id,
      content: content.trim()
    });

    const populatedComment = await Comment.findById(comment._id)
      .populate('author', 'name email profileImage');

    await logActivity({
      project: access.task.project,
      user: req.user,
      action: 'added_comment',
      description: `${req.user.name} commented on "${access.task.title}"`
    });

    // Notify task assignee if not the comment author
    const authorIdStr = req.user._id.toString();
    const notifiedUserIds = new Set([authorIdStr]);

    if (access.task.assignedTo) {
      const assigneeIdStr = access.task.assignedTo.toString();
      if (!notifiedUserIds.has(assigneeIdStr)) {
        notifiedUserIds.add(assigneeIdStr);
        await createNotification({
          recipient: access.task.assignedTo,
          project: access.task.project,
          task: access.task._id,
          type: 'comment_added',
          message: `${req.user.name} commented on your task "${access.task.title}"`
        });
      }
    }

    // Notify task creator if different
    if (access.task.createdBy) {
      const creatorIdStr = access.task.createdBy.toString();
      if (!notifiedUserIds.has(creatorIdStr)) {
        notifiedUserIds.add(creatorIdStr);
        await createNotification({
          recipient: access.task.createdBy,
          project: access.task.project,
          task: access.task._id,
          type: 'comment_added',
          message: `${req.user.name} commented on task "${access.task.title}" you created`
        });
      }
    }

    const io = getIO();
    if (io) {
      io.to(`project_${access.task.project}`).emit('comment_created', {
        taskId,
        comment: populatedComment
      });
    }

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      comment: populatedComment
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get comments for a task
// @route   GET /api/tasks/:id/comments
// @access  Private
const getComments = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const access = await verifyTaskAccess(taskId, req.user._id);
    if (!access.authorized) {
      return res.status(403).json({
        success: false,
        message: access.reason
      });
    }

    const comments = await Comment.find({ task: taskId })
      .populate('author', 'name email profileImage')
      .sort({ createdAt: 1 });

    res.json({
      success: true,
      count: comments.length,
      comments
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a comment
// @route   PUT /api/comments/:id
// @access  Private (Author only)
const updateComment = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Comment content cannot be empty'
      });
    }

    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    if (comment.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: You can only edit your own comments'
      });
    }

    comment.content = content.trim();
    await comment.save();

    const populated = await Comment.findById(comment._id)
      .populate('author', 'name email profileImage');

    const io = getIO();
    if (io) {
      io.to(`project_${comment.project}`).emit('comment_updated', {
        taskId: comment.task,
        comment: populated
      });
    }

    res.json({
      success: true,
      message: 'Comment updated',
      comment: populated
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a comment
// @route   DELETE /api/comments/:id
// @access  Private (Author, Project Owner or Admin)
const deleteComment = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    const project = await Project.findById(comment.project);
    const userIdStr = req.user._id.toString();
    const isAuthor = comment.author.toString() === userIdStr;
    const isOwner = project && project.owner.toString() === userIdStr;
    const member = project && project.members.find((m) => m.user.toString() === userIdStr);
    const isAdmin = member && member.role === 'Admin';

    if (!isAuthor && !isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: Cannot delete this comment'
      });
    }

    const taskId = comment.task;
    const projectId = comment.project;
    const commentId = comment._id;

    await Comment.findByIdAndDelete(commentId);

    const io = getIO();
    if (io) {
      io.to(`project_${projectId}`).emit('comment_deleted', {
        taskId,
        commentId
      });
    }

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createComment,
  getComments,
  updateComment,
  deleteComment
};
