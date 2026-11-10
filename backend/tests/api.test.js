const http = require('http');
const mongoose = require('mongoose');
const { io: ioClient } = require('socket.io-client');
const { app, server } = require('../src/server');

// Models
const User = require('../src/models/User');
const Project = require('../src/models/Project');
const Task = require('../src/models/Task');
const Comment = require('../src/models/Comment');
const Notification = require('../src/models/Notification');
const ActivityLog = require('../src/models/ActivityLog');

const PORT = 5055;
const BASE_URL = `http://localhost:${PORT}/api`;

let aliceToken = '';
let aliceUser = null;
let bobToken = '';
let bobUser = null;
let charlieToken = '';
let charlieUser = null;

let testProjectId = '';
let testTaskId = '';
let testCommentId = '';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`✅ PASSED: ${message}`);
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 STARTING COMPREHENSIVE END-TO-END TEST SUITE');
  console.log('====================================================\n');

  // Start test server on port 5055
  await new Promise((resolve) => server.listen(PORT, resolve));

  try {
    // -------------------------------------------------------------------------
    // 1. AUTHENTICATION TESTS
    // -------------------------------------------------------------------------
    console.log('--- 1. Testing User Authentication ---');

    // Clean test database records for these test emails
    await User.deleteMany({ email: { $in: ['alice@test.com', 'bob@test.com', 'charlie@test.com'] } });

    // Register Alice (Owner)
    const regAlice = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Alice Johnson',
        email: 'alice@test.com',
        password: 'password123',
        confirmPassword: 'password123'
      })
    });
    assert(regAlice.status === 201, 'Alice registration status is 201');
    assert(regAlice.data.token, 'Alice registration returned JWT token');
    aliceToken = regAlice.data.token;
    aliceUser = regAlice.data.user;

    // Register Bob (Member)
    const regBob = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Bob Smith',
        email: 'bob@test.com',
        password: 'password123',
        confirmPassword: 'password123'
      })
    });
    assert(regBob.status === 201, 'Bob registration status is 201');
    bobToken = regBob.data.token;
    bobUser = regBob.data.user;

    // Register Charlie (Outsider)
    const regCharlie = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Charlie Brown',
        email: 'charlie@test.com',
        password: 'password123',
        confirmPassword: 'password123'
      })
    });
    assert(regCharlie.status === 201, 'Charlie registration status is 201');
    charlieToken = regCharlie.data.token;
    charlieUser = regCharlie.data.user;

    // Duplicate email registration should fail
    const dupReg = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Alice Dup',
        email: 'alice@test.com',
        password: 'password123'
      })
    });
    assert(dupReg.status === 400, 'Duplicate email registration rejected with 400');

    // Invalid login password should fail
    const invalidLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'alice@test.com',
        password: 'wrongpassword'
      })
    });
    assert(invalidLogin.status === 401, 'Invalid password login rejected with 401');

    // Valid login
    const validLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'alice@test.com',
        password: 'password123'
      })
    });
    assert(validLogin.status === 200, 'Alice valid login status 200');
    assert(validLogin.data.token, 'Alice login returned valid JWT token');

    // Access protected route /auth/me
    const getMe = await request('/auth/me', {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    assert(getMe.status === 200 && getMe.data.user.email === 'alice@test.com', 'Protected GET /auth/me returns current user');

    // Unauthorized access without token
    const unauthGetMe = await request('/auth/me');
    assert(unauthGetMe.status === 401, 'Protected route without token returns 401');

    // Update Profile
    const updateProf = await request('/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({
        name: 'Alice J. Senior PM',
        bio: 'Lead Project Manager'
      })
    });
    assert(updateProf.status === 200 && updateProf.data.user.name === 'Alice J. Senior PM', 'Profile update works');

    // -------------------------------------------------------------------------
    // 2. PROJECT MANAGEMENT & PERMISSION TESTS
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Project Management & Permissions ---');

    // Alice creates project
    const createProj = await request('/projects', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({
        name: 'E-Commerce Redesign',
        description: 'Overhaul customer portal and checkout pipeline',
        priority: 'High',
        status: 'Active',
        startDate: new Date(),
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      })
    });
    assert(createProj.status === 201, 'Project created successfully');
    testProjectId = createProj.data.project._id;
    assert(createProj.data.project.owner.name === 'Alice J. Senior PM', 'Project owner set to Alice');

    // Alice adds Bob to project as Member
    const addBob = await request(`/projects/${testProjectId}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({
        email: 'bob@test.com',
        role: 'Member'
      })
    });
    assert(addBob.status === 200, 'Alice added Bob to project');

    // Bob attempts to delete project (should fail 403 - Member is not Owner)
    const bobDelete = await request(`/projects/${testProjectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    assert(bobDelete.status === 403, 'Unauthorized user (Member) cannot delete project (403)');

    // Charlie (outsider) attempts to view project (should fail 403)
    const charlieView = await request(`/projects/${testProjectId}`, {
      headers: { Authorization: `Bearer ${charlieToken}` }
    });
    assert(charlieView.status === 403, 'Non-member cannot view project details (403)');

    // Bob views project details (should succeed)
    const bobView = await request(`/projects/${testProjectId}`, {
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    assert(bobView.status === 200, 'Authorized project member can view project details');

    // -------------------------------------------------------------------------
    // 3. TASK MANAGEMENT & KANBAN MOVES
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Task Creation, Assignment, & Status Moves ---');

    // Alice creates task and assigns to Bob
    const createTaskRes = await request('/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({
        title: 'Design Checkout Wireframes',
        description: 'Create mobile and desktop wireframes in Figma',
        project: testProjectId,
        assignedTo: bobUser._id,
        priority: 'Urgent',
        status: 'To Do',
        labels: ['Design', 'UI'],
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      })
    });
    assert(createTaskRes.status === 201, 'Task created successfully');
    testTaskId = createTaskRes.data.task._id;
    assert(createTaskRes.data.task.assignedTo._id === bobUser._id, 'Task correctly assigned to Bob');

    // Bob moves task to 'In Progress' via status route (Kanban move)
    const moveTaskRes = await request(`/tasks/${testTaskId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${bobToken}` },
      body: JSON.stringify({
        status: 'In Progress'
      })
    });
    assert(moveTaskRes.status === 200 && moveTaskRes.data.task.status === 'In Progress', 'Bob moved task to In Progress');

    // Charlie (outsider) attempts to update task (should fail 403)
    const charlieUpdateTask = await request(`/tasks/${testTaskId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${charlieToken}` },
      body: JSON.stringify({ title: 'Hacked Title' })
    });
    assert(charlieUpdateTask.status === 403, 'Non-member cannot update task (403)');

    // -------------------------------------------------------------------------
    // 4. TASK COMMENTS & COMMUNICATION
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Task Comments & Communication ---');

    // Bob comments on task
    const addCommentRes = await request(`/tasks/${testTaskId}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}` },
      body: JSON.stringify({
        content: 'I have started drafting the cart layout.'
      })
    });
    assert(addCommentRes.status === 201, 'Bob added a comment to the task');
    testCommentId = addCommentRes.data.comment._id;

    // Fetch comments in chronological order
    const getCommentsRes = await request(`/tasks/${testTaskId}/comments`, {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    assert(getCommentsRes.status === 200 && getCommentsRes.data.comments.length >= 1, 'Comments fetched successfully');

    // Bob edits his comment
    const editCommentRes = await request(`/comments/${testCommentId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${bobToken}` },
      body: JSON.stringify({
        content: 'I have started drafting the cart layout. Prototypes ready by 4 PM.'
      })
    });
    assert(editCommentRes.status === 200, 'Bob edited his own comment');

    // Charlie attempts to edit Bob's comment (should fail 403)
    const charlieEditComment = await request(`/comments/${testCommentId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${charlieToken}` },
      body: JSON.stringify({ content: 'Tampered comment' })
    });
    assert(charlieEditComment.status === 403, 'User cannot edit someone else’s comment (403)');

    // -------------------------------------------------------------------------
    // 5. IN-APP NOTIFICATIONS & DEADLINE CHECKER
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing In-App Notification System & Deadlines ---');

    // Test Deadline Checker
    const { checkDeadlines } = require('../src/utils/deadlineChecker');
    // Create an overdue task for Bob
    const overdueTask = await Task.create({
      title: 'Urgent Security Audit',
      description: 'Audit SSL certificates and keys',
      project: testProjectId,
      assignedTo: bobUser._id,
      createdBy: aliceUser._id,
      priority: 'Urgent',
      status: 'To Do',
      dueDate: new Date(Date.now() - 3600 * 1000) // 1 hour ago
    });

    // Run deadline check
    await checkDeadlines();

    // Verify overdue notification was created
    const overdueNotif = await Notification.findOne({
      recipient: bobUser._id,
      task: overdueTask._id,
      type: 'task_overdue'
    });
    assert(overdueNotif !== null, 'DeadlineChecker generated task_overdue notification for Bob');

    // Run deadline check again to verify deduplication
    const countBefore = await Notification.countDocuments({
      recipient: bobUser._id,
      task: overdueTask._id,
      type: 'task_overdue'
    });
    await checkDeadlines();
    const countAfter = await Notification.countDocuments({
      recipient: bobUser._id,
      task: overdueTask._id,
      type: 'task_overdue'
    });
    assert(countBefore === countAfter, 'DeadlineChecker prevented duplicate notification within 24h');

    // Bob checks his notifications (should have invite, task assigned, and overdue)
    const bobNotifs = await request('/notifications', {
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    assert(bobNotifs.status === 200, 'Bob fetched notifications');
    assert(bobNotifs.data.notifications.length >= 2, 'Bob has notifications list');

    const notifId = bobNotifs.data.notifications[0]._id;
    // Mark single notification as read
    const markReadRes = await request(`/notifications/${notifId}/read`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    assert(markReadRes.status === 200 && markReadRes.data.notification.isRead === true, 'Marked single notification as read');

    // Mark all notifications as read
    const markAllReadRes = await request('/notifications/read-all', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    assert(markAllReadRes.status === 200 && markAllReadRes.data.unreadCount === 0, 'Marked all notifications as read');

    // -------------------------------------------------------------------------
    // 6. DASHBOARD STATISTICS & ACTIVITY LOGS
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testing Dashboard Stats & Activity Logs ---');

    const dashStats = await request('/dashboard/stats', {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    assert(dashStats.status === 200, 'Dashboard stats retrieved');
    assert(dashStats.data.stats.totalProjects >= 1, 'Total projects counted in MongoDB');
    assert(dashStats.data.stats.totalTasks >= 1, 'Total tasks counted in MongoDB');

    const dashActivity = await request('/dashboard/recent-activity', {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    assert(dashActivity.status === 200 && dashActivity.data.activities.length >= 2, 'Recent activities recorded in MongoDB');

    // -------------------------------------------------------------------------
    // 7. WEBSOCKET REAL-TIME UPDATES (Socket.IO)
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Testing Socket.IO Real-Time Auth & Room Isolation ---');

    // Connect authenticated client (Alice)
    const aliceSocket = ioClient(`http://localhost:${PORT}`, {
      auth: { token: aliceToken },
      transports: ['websocket']
    });

    await new Promise((resolve, reject) => {
      aliceSocket.on('connect', () => {
        assert(aliceSocket.connected, 'Alice authenticated WebSocket connected');
        resolve();
      });
      aliceSocket.on('connect_error', reject);
    });

    // Alice joins project room
    aliceSocket.emit('join_project', testProjectId);

    // Verify unauthenticated client is rejected
    const unauthSocket = ioClient(`http://localhost:${PORT}`, {
      auth: { token: 'invalid_token' },
      transports: ['websocket'],
      autoConnect: true
    });

    await new Promise((resolve) => {
      unauthSocket.on('connect_error', (err) => {
        assert(err.message.includes('Authentication error'), 'Unauthenticated WebSocket connection rejected');
        unauthSocket.disconnect();
        resolve();
      });
    });

    // Clean up socket
    aliceSocket.disconnect();

    // -------------------------------------------------------------------------
    // 8. DATABASE INTEGRITY VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Verifying MongoDB Collections ---');
    const userCount = await User.countDocuments();
    const projectCount = await Project.countDocuments();
    const taskCount = await Task.countDocuments();
    const commentCount = await Comment.countDocuments();
    const notifCount = await Notification.countDocuments();
    const activityCount = await ActivityLog.countDocuments();

    assert(userCount >= 3, `Users collection has ${userCount} documents`);
    assert(projectCount >= 1, `Projects collection has ${projectCount} documents`);
    assert(taskCount >= 1, `Tasks collection has ${taskCount} documents`);
    assert(commentCount >= 1, `Comments collection has ${commentCount} documents`);
    assert(notifCount >= 2, `Notifications collection has ${notifCount} documents`);
    assert(activityCount >= 3, `ActivityLogs collection has ${activityCount} documents`);

    console.log('\n====================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
    console.log('====================================================\n');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close();
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
