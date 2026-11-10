const Notification = require('../models/Notification');
const { getIO } = require('../sockets/socketHandler');

const createNotification = async ({ recipient, project, task, type, message }) => {
  try {
    if (!recipient) return null;

    const notification = await Notification.create({
      recipient,
      project: project || null,
      task: task || null,
      type,
      message,
      isRead: false
    });

    const populated = await Notification.findById(notification._id)
      .populate('project', 'name')
      .populate('task', 'title')
      .lean();

    const io = getIO();
    if (io) {
      io.to(`user_${recipient.toString()}`).emit('new_notification', populated);
    }

    return notification;
  } catch (error) {
    console.error('[Notification Error]', error.message);
    return null;
  }
};

module.exports = { createNotification };
