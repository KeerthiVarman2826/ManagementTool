const ActivityLog = require('../models/ActivityLog');
const { getIO } = require('../sockets/socketHandler');

const logActivity = async ({ project, user, action, description }) => {
  try {
    const activity = await ActivityLog.create({
      project,
      user: typeof user === 'object' && user._id ? user._id : user,
      action,
      description
    });

    const populatedActivity = await ActivityLog.findById(activity._id)
      .populate('user', 'name email profileImage')
      .lean();

    const io = getIO();
    if (io && project) {
      io.to(`project_${project.toString()}`).emit('activity_logged', populatedActivity);
    }

    return activity;
  } catch (error) {
    console.error('[ActivityLog Error]', error.message);
  }
};

module.exports = { logActivity };
