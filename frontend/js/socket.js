// Socket.IO Client Manager
let socket = null;

function initSocketConnection() {
  const token = getToken();
  if (!token) return null;

  if (socket && socket.connected) {
    return socket;
  }

  if (typeof io === 'undefined') {
    console.warn('[Socket.IO] io client script not loaded');
    return null;
  }

  socket = io(window.location.origin, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10
  });

  socket.on('connect', () => {
    console.log('[Socket.IO] Connected as client ID:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket.IO] Connection error:', err.message);
  });

  // Handle incoming real-time notifications
  socket.on('new_notification', (notification) => {
    showToast(`🔔 ${notification.message}`, 'info');
    // Dispatch custom event for notifications component
    window.dispatchEvent(new CustomEvent('app:notification', { detail: notification }));
  });

  // Dispatch project-related events
  socket.on('task_created', (task) => {
    window.dispatchEvent(new CustomEvent('board:task_created', { detail: task }));
  });

  socket.on('task_updated', (task) => {
    window.dispatchEvent(new CustomEvent('board:task_updated', { detail: task }));
  });

  socket.on('task_moved', (data) => {
    window.dispatchEvent(new CustomEvent('board:task_moved', { detail: data }));
  });

  socket.on('task_deleted', (data) => {
    window.dispatchEvent(new CustomEvent('board:task_deleted', { detail: data }));
  });

  socket.on('comment_created', (data) => {
    window.dispatchEvent(new CustomEvent('board:comment_created', { detail: data }));
  });

  socket.on('comment_updated', (data) => {
    window.dispatchEvent(new CustomEvent('board:comment_updated', { detail: data }));
  });

  socket.on('comment_deleted', (data) => {
    window.dispatchEvent(new CustomEvent('board:comment_deleted', { detail: data }));
  });

  socket.on('member_added', (data) => {
    window.dispatchEvent(new CustomEvent('project:member_added', { detail: data }));
  });

  socket.on('member_removed', (data) => {
    window.dispatchEvent(new CustomEvent('project:member_removed', { detail: data }));
  });

  socket.on('project_updated', (project) => {
    window.dispatchEvent(new CustomEvent('project:updated', { detail: project }));
  });

  socket.on('activity_logged', (activity) => {
    window.dispatchEvent(new CustomEvent('app:activity_logged', { detail: activity }));
  });

  return socket;
}

function joinProjectRoom(projectId) {
  if (socket && projectId) {
    socket.emit('join_project', projectId);
  }
}

function leaveProjectRoom(projectId) {
  if (socket && projectId) {
    socket.emit('leave_project', projectId);
  }
}
