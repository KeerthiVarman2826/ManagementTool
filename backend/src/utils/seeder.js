const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');

const seedData = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/project_management_tool';
    await mongoose.connect(mongoUri);
    console.log('[Seed] Connected to MongoDB');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Project.deleteMany({}),
      Task.deleteMany({}),
      Comment.deleteMany({}),
      Notification.deleteMany({}),
      ActivityLog.deleteMany({})
    ]);

    console.log('[Seed] Cleared existing data');

    // 1. Create Users
    const alice = await User.create({
      name: 'Alice Johnson',
      email: 'alice@example.com',
      password: 'password123',
      role: 'admin',
      bio: 'Senior Technical Project Manager & Scrum Master'
    });

    const bob = await User.create({
      name: 'Bob Smith',
      email: 'bob@example.com',
      password: 'password123',
      role: 'user',
      bio: 'Full-Stack Developer & UI Specialist'
    });

    const clara = await User.create({
      name: 'Clara Oswald',
      email: 'clara@example.com',
      password: 'password123',
      role: 'user',
      bio: 'QA Engineer & Test Automation Specialist'
    });

    console.log('[Seed] Created demo users (password: password123):');
    console.log('       alice@example.com (Project Owner & Admin)');
    console.log('       bob@example.com   (Team Member / Developer)');
    console.log('       clara@example.com (Team Member / QA)');

    // 2. Create Projects
    const project1 = await Project.create({
      name: 'SaaS Mobile App 2.0',
      description: 'Design and engineer cross-platform mobile client with offline sync and push notifications.',
      owner: alice._id,
      priority: 'High',
      status: 'Active',
      startDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      members: [
        { user: alice._id, role: 'Owner' },
        { user: bob._id, role: 'Admin' },
        { user: clara._id, role: 'Member' }
      ]
    });

    const project2 = await Project.create({
      name: 'Customer Portal Redesign',
      description: 'Upgrade customer billing, analytics dashboard, and settings interface.',
      owner: alice._id,
      priority: 'Urgent',
      status: 'Active',
      startDate: new Date(),
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      members: [
        { user: alice._id, role: 'Owner' },
        { user: bob._id, role: 'Member' }
      ]
    });

    // 3. Create Tasks
    const task1 = await Task.create({
      title: 'Design Wireframes and Design System Tokens',
      description: 'Establish color palette, typography scale, and responsive component primitives.',
      project: project1._id,
      assignedTo: bob._id,
      createdBy: alice._id,
      priority: 'High',
      status: 'Completed',
      order: 0,
      labels: ['Design', 'Figma'],
      startDate: new Date(),
      dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000)
    });

    const task2 = await Task.create({
      title: 'Setup Socket.IO Project Rooms and JWT Handshake',
      description: 'Implement real-time WebSocket communication for collaborative task moves.',
      project: project1._id,
      assignedTo: bob._id,
      createdBy: alice._id,
      priority: 'Urgent',
      status: 'In Progress',
      order: 0,
      labels: ['Backend', 'WebSockets'],
      startDate: new Date(),
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    });

    const task3 = await Task.create({
      title: 'Write Automated End-to-End API Test Suite',
      description: 'Validate authorization guards, Kanban moves, notifications, and Mongo collections.',
      project: project1._id,
      assignedTo: clara._id,
      createdBy: alice._id,
      priority: 'Medium',
      status: 'Review',
      order: 0,
      labels: ['QA', 'Testing'],
      startDate: new Date(),
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    });

    const task4 = await Task.create({
      title: 'Implement Dark Mode and Accessible High-Contrast Theme',
      description: 'Support OS color scheme detection and user preference persistence.',
      project: project1._id,
      assignedTo: bob._id,
      createdBy: alice._id,
      priority: 'Low',
      status: 'To Do',
      order: 0,
      labels: ['Frontend', 'Accessibility'],
      startDate: new Date(),
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    });

    const task5 = await Task.create({
      title: 'Database Indexing & Query Profiling',
      description: 'Review compound indexes for project membership queries and activity log feeds.',
      project: project2._id,
      assignedTo: bob._id,
      createdBy: alice._id,
      priority: 'High',
      status: 'To Do',
      order: 0,
      labels: ['Database', 'Optimization'],
      startDate: new Date(),
      dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)
    });

    // 4. Create Comments
    await Comment.create({
      task: task2._id,
      project: project1._id,
      author: bob._id,
      content: 'JWT handshake authorization middleware is active on socket connections!'
    });

    await Comment.create({
      task: task2._id,
      project: project1._id,
      author: alice._id,
      content: 'Great progress Bob. Make sure to test room isolation so unauthorized members cannot listen.'
    });

    // 5. Create Activity Logs
    await ActivityLog.create([
      {
        project: project1._id,
        user: alice._id,
        action: 'created_project',
        description: 'Alice Johnson created project "SaaS Mobile App 2.0"'
      },
      {
        project: project1._id,
        user: alice._id,
        action: 'added_member',
        description: 'Alice Johnson added Bob Smith (Admin) to the project'
      },
      {
        project: project1._id,
        user: bob._id,
        action: 'moved_task',
        description: 'Bob Smith moved "Design Wireframes and Design System Tokens" to Completed'
      },
      {
        project: project1._id,
        user: bob._id,
        action: 'added_comment',
        description: 'Bob Smith commented on "Setup Socket.IO Project Rooms and JWT Handshake"'
      }
    ]);

    // 6. Create Notifications
    await Notification.create([
      {
        recipient: bob._id,
        project: project1._id,
        task: task2._id,
        type: 'task_assigned',
        message: 'Alice Johnson assigned you to task "Setup Socket.IO Project Rooms and JWT Handshake"',
        isRead: false
      },
      {
        recipient: bob._id,
        project: project1._id,
        task: task2._id,
        type: 'comment_added',
        message: 'Alice Johnson commented on task "Setup Socket.IO Project Rooms and JWT Handshake"',
        isRead: false
      },
      {
        recipient: clara._id,
        project: project1._id,
        task: task3._id,
        type: 'task_assigned',
        message: 'Alice Johnson assigned you to task "Write Automated End-to-End API Test Suite"',
        isRead: true
      }
    ]);

    console.log('[Seed] Database seeded with projects, tasks, comments, activity logs, and notifications!');
    process.exit(0);
  } catch (error) {
    console.error('[Seed Error]', error);
    process.exit(1);
  }
};

seedData();
