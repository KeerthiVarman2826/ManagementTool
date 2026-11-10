const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Project = require('../models/Project');

let io = null;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
  });

  // JWT Authentication Middleware for WebSockets
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication error: Token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pm_tool_super_secret_jwt_key_2026_secure!');
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    // Join personal user room for direct notifications
    socket.join(`user_${userId}`);

    // Join project room with server-side authorization check
    socket.on('join_project', async (projectId) => {
      try {
        if (!projectId) return;

        const project = await Project.findById(projectId);
        if (!project) {
          socket.emit('error_message', 'Project not found');
          return;
        }

        const isOwner = project.owner.toString() === userId;
        const isMember = project.members.some(m => m.user.toString() === userId);

        if (!isOwner && !isMember) {
          socket.emit('error_message', 'Unauthorized to join this project room');
          return;
        }

        const room = `project_${projectId}`;
        socket.join(room);
      } catch (err) {
        socket.emit('error_message', 'Failed to join project room');
      }
    });

    // Leave project room
    socket.on('leave_project', (projectId) => {
      if (projectId) {
        socket.leave(`project_${projectId}`);
      }
    });

    socket.on('disconnect', () => {
      // Disconnection handled automatically by Socket.IO
    });
  });

  return io;
};

const getIO = () => {
  return io;
};

module.exports = { initSocket, getIO };
