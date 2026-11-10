const Task = require('../models/Task');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const { createNotification } = require('./notificationHelper');

const checkDeadlines = async () => {
  try {
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const next48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const past24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Tasks approaching deadline (within 24 hours, not completed)
    const approachingTasks = await Task.find({
      status: { $ne: 'Completed' },
      dueDate: { $gt: now, $lte: next24Hours },
      assignedTo: { $ne: null }
    }).populate('project', 'name');

    for (const task of approachingTasks) {
      const existing = await Notification.findOne({
        recipient: task.assignedTo,
        task: task._id,
        type: 'deadline_approaching',
        createdAt: { $gte: past24Hours }
      });

      if (!existing) {
        await createNotification({
          recipient: task.assignedTo,
          project: task.project._id,
          task: task._id,
          type: 'deadline_approaching',
          message: `Task "${task.title}" is due soon (${new Date(task.dueDate).toLocaleDateString()})`
        });
      }
    }

    // 2. Overdue tasks (due date passed, not completed)
    const overdueTasks = await Task.find({
      status: { $ne: 'Completed' },
      dueDate: { $lt: now },
      assignedTo: { $ne: null }
    }).populate('project', 'name');

    for (const task of overdueTasks) {
      const existing = await Notification.findOne({
        recipient: task.assignedTo,
        task: task._id,
        type: 'task_overdue',
        createdAt: { $gte: past24Hours }
      });

      if (!existing) {
        await createNotification({
          recipient: task.assignedTo,
          project: task.project._id,
          task: task._id,
          type: 'task_overdue',
          message: `Task "${task.title}" is overdue!`
        });
      }
    }

    // 3. Projects approaching deadline (within 48 hours, not completed)
    const approachingProjects = await Project.find({
      status: { $ne: 'Completed' },
      dueDate: { $gt: now, $lte: next48Hours }
    });

    for (const project of approachingProjects) {
      // Notify owner
      const existing = await Notification.findOne({
        recipient: project.owner,
        project: project._id,
        type: 'project_deadline',
        createdAt: { $gte: past24Hours }
      });

      if (!existing) {
        await createNotification({
          recipient: project.owner,
          project: project._id,
          type: 'project_deadline',
          message: `Project "${project.name}" deadline is approaching (${new Date(project.dueDate).toLocaleDateString()})`
        });
      }
    }
  } catch (error) {
    console.error('[DeadlineChecker Error]', error.message);
  }
};

module.exports = { checkDeadlines };
