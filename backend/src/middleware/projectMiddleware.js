const mongoose = require('mongoose');
const Project = require('../models/Project');

const getProjectId = (req) => {
  return (
    req.params.projectId ||
    req.params.id ||
    req.body.project ||
    req.body.projectId ||
    req.query.project ||
    req.query.projectId
  );
};

const requireProjectAccess = async (req, res, next) => {
  try {
    const projectId = getProjectId(req);

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing project ID'
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const userIdStr = req.user._id.toString();
    const isOwner = project.owner.toString() === userIdStr;
    const memberObj = project.members.find(
      (m) => m.user && m.user.toString() === userIdStr
    );

    if (!isOwner && !memberObj) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not a member of this project'
      });
    }

    req.project = project;
    req.userRole = isOwner ? 'Owner' : memberObj.role;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error verifying project access: ' + error.message
    });
  }
};

const requireProjectAdminOrOwner = (req, res, next) => {
  if (req.userRole === 'Owner' || req.userRole === 'Admin') {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Permission denied: Requires Project Owner or Admin role'
  });
};

const requireProjectOwner = (req, res, next) => {
  if (req.userRole === 'Owner') {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Permission denied: Requires Project Owner role'
  });
};

module.exports = {
  requireProjectAccess,
  requireProjectAdminOrOwner,
  requireProjectOwner
};
