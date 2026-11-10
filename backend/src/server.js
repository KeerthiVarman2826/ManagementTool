const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = require('./config/db');
const { initSocket } = require('./sockets/socketHandler');
const { checkDeadlines } = require('./utils/deadlineChecker');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Route files
const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const commentRoutes = require('./routes/commentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

// Connect to Database
connectDB();

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
initSocket(server);

// Body parser & CORS
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Project Management Tool API'
  });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Serve Frontend Static Files
const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// Fallback for SPA routing: send index.html if request is not an API call
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Periodic deadline check (every 15 minutes)
setInterval(() => {
  checkDeadlines().catch((err) =>
    console.error('[Periodic Check Error]', err.message)
  );
}, 15 * 60 * 1000);

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket server initialized`);
    console.log(`📂 Frontend served from: ${frontendPath}`);
    console.log(`=========================================`);
  });
}

module.exports = { app, server };
