const Project = require('../models/Project');
const Task = require('../models/Task');
const ActivityLog = require('../models/ActivityLog');
const Notification = require('../models/Notification');
const { checkDeadlines } = require('../utils/deadlineChecker');

// @desc    Get dashboard statistics for current user
// @route   GET /api/dashboard/stats
// @access  Private
const getStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Trigger deadline check proactively
    await checkDeadlines();

    // Find all projects user has access to
    const userProjects = await Project.find({
      $or: [{ owner: userId }, { 'members.user': userId }]
    }).select('_id status');

    const projectIds = userProjects.map((p) => p._id);

    const totalProjects = userProjects.length;
    const activeProjects = userProjects.filter((p) => p.status === 'Active').length;
    const completedProjects = userProjects.filter((p) => p.status === 'Completed').length;

    // Tasks counts across user projects
    const totalTasks = await Task.countDocuments({
      project: { $in: projectIds }
    });

    const completedTasks = await Task.countDocuments({
      project: { $in: projectIds },
      status: 'Completed'
    });

    const pendingTasks = await Task.countDocuments({
      project: { $in: projectIds },
      status: { $ne: 'Completed' }
    });

    const tasksAssignedToMe = await Task.countDocuments({
      assignedTo: userId,
      status: { $ne: 'Completed' }
    });

    // Overdue tasks
    const overdueTasks = await Task.countDocuments({
      project: { $in: projectIds },
      status: { $ne: 'Completed' },
      dueDate: { $lt: new Date() }
    });

    // Upcoming deadlines: tasks due in next 7 days
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);

    const upcomingDeadlines = await Task.find({
      project: { $in: projectIds },
      status: { $ne: 'Completed' },
      dueDate: { $gte: new Date(), $lte: next7Days }
    })
      .populate('project', 'name')
      .populate('assignedTo', 'name email profileImage')
      .sort({ dueDate: 1 })
      .limit(6);

    // Recent notifications
    const recentNotifications = await Notification.find({
      recipient: userId
    })
      .populate('project', 'name')
      .populate('task', 'title')
      .sort({ createdAt: -1 })
      .limit(5);

    const unreadNotificationsCount = await Notification.countDocuments({
      recipient: userId,
      isRead: false
    });

    res.json({
      success: true,
      stats: {
        totalProjects,
        activeProjects,
        completedProjects,
        totalTasks,
        pendingTasks,
        completedTasks,
        tasksAssignedToMe,
        overdueTasks
      },
      upcomingDeadlines,
      recentNotifications,
      unreadNotificationsCount
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get recent activity across user projects
// @route   GET /api/dashboard/recent-activity
// @access  Private
const getRecentActivity = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const userProjects = await Project.find({
      $or: [{ owner: userId }, { 'members.user': userId }]
    }).select('_id');

    const projectIds = userProjects.map((p) => p._id);

    const activities = await ActivityLog.find({
      project: { $in: projectIds }
    })
      .populate('user', 'name email profileImage')
      .populate('project', 'name')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      count: activities.length,
      activities
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStats,
  getRecentActivity
};
