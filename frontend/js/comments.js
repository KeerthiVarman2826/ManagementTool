// Task Details & Real-Time Comments Manager

let activeDetailTaskId = null;
let activeTaskData = null;

async function openTaskDetailModal(taskId) {
  try {
    activeDetailTaskId = taskId;
    const data = await apiRequest(`/tasks/${taskId}`);
    activeTaskData = data.task;

    renderTaskDetail(activeTaskData);
    await loadTaskComments(taskId);

    document.getElementById('task-detail-modal')?.classList.add('open');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderTaskDetail(task) {
  document.getElementById('detail-task-title').textContent = task.title;
  document.getElementById('detail-task-desc').textContent = task.description || 'No description provided';
  
  const statusEl = document.getElementById('detail-task-status');
  if (statusEl) {
    statusEl.textContent = task.status;
    statusEl.className = `badge badge-${task.status.toLowerCase().replace(' ', '')}`;
  }

  const priorityEl = document.getElementById('detail-task-priority');
  if (priorityEl) {
    priorityEl.textContent = task.priority;
    priorityEl.className = `badge badge-${task.priority.toLowerCase()}`;
  }

  const assigneeEl = document.getElementById('detail-task-assignee');
  if (assigneeEl) {
    assigneeEl.innerHTML = task.assignedTo
      ? `<div style="display: flex; align-items: center; gap: 0.5rem;"><div class="assignee-avatar">${getInitials(task.assignedTo.name)}</div><span>${task.assignedTo.name}</span></div>`
      : '<span class="text-muted">Unassigned</span>';
  }

  const dueDateEl = document.getElementById('detail-task-due');
  if (dueDateEl) {
    dueDateEl.textContent = task.dueDate ? formatDate(task.dueDate) : 'No due date';
  }

  const labelsEl = document.getElementById('detail-task-labels');
  if (labelsEl) {
    labelsEl.innerHTML = (task.labels || []).map(l => `<span class="tag-chip">${l}</span>`).join('') || '<span class="text-muted">None</span>';
  }

  // Edit / Delete buttons in footer
  const footerEl = document.getElementById('detail-task-footer-actions');
  if (footerEl) {
    footerEl.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="openEditTaskModal('${task._id}')">Edit Task</button>
      <button class="btn btn-danger btn-sm" onclick="deleteTaskById('${task._id}')">Delete</button>
    `;
  }
}

async function loadTaskComments(taskId) {
  try {
    const data = await apiRequest(`/tasks/${taskId}/comments`);
    renderCommentsFeed(data.comments);
  } catch (error) {
    console.error(error);
  }
}

function renderCommentsFeed(comments) {
  const container = document.getElementById('task-comments-feed');
  if (!container) return;

  if (!comments || comments.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 1.5rem 0; color: var(--text-muted); font-size: 0.85rem;">
        No comments yet. Start the conversation!
      </div>
    `;
    return;
  }

  const currentUser = getCurrentUser();

  container.innerHTML = comments.map(c => {
    const isAuthor = currentUser && c.author && c.author._id === currentUser._id;
    return `
      <div class="comment-bubble" data-comment-id="${c._id}">
        <div class="comment-bubble-header">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div class="user-avatar" style="width: 24px; height: 24px; font-size: 0.65rem;">
              ${getInitials(c.author?.name || 'U')}
            </div>
            <span class="comment-author-name">${c.author?.name || 'User'}</span>
            <span class="comment-date">${formatTimeAgo(c.createdAt)}</span>
          </div>
        </div>
        <div class="comment-bubble-text" id="comment-text-${c._id}">${c.content}</div>
        ${isAuthor ? `
          <div class="comment-actions">
            <button onclick="handleEditCommentPrompt('${c._id}')">Edit</button>
            <button onclick="handleDeleteComment('${c._id}')">Delete</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function handleAddComment(e) {
  e.preventDefault();
  if (!activeDetailTaskId) return;

  const input = document.getElementById('task-comment-input');
  const content = input.value.trim();
  if (!content) return;

  try {
    await apiRequest(`/tasks/${activeDetailTaskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
    input.value = '';
    loadTaskComments(activeDetailTaskId);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleEditCommentPrompt(commentId) {
  const textEl = document.getElementById(`comment-text-${commentId}`);
  const currentText = textEl ? textEl.textContent : '';
  const newText = prompt('Edit comment:', currentText);

  if (newText && newText.trim() && newText.trim() !== currentText) {
    try {
      await apiRequest(`/comments/${commentId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: newText.trim() })
      });
      showToast('Comment updated', 'success');
      loadTaskComments(activeDetailTaskId);
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

async function handleDeleteComment(commentId) {
  if (confirm('Delete this comment?')) {
    try {
      await apiRequest(`/comments/${commentId}`, { method: 'DELETE' });
      showToast('Comment deleted', 'success');
      loadTaskComments(activeDetailTaskId);
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

function openEditTaskModal(taskId) {
  if (!activeTaskData) return;

  document.getElementById('task-id-hidden').value = activeTaskData._id;
  document.getElementById('task-title-input').value = activeTaskData.title;
  document.getElementById('task-desc-input').value = activeTaskData.description || '';
  document.getElementById('task-priority-input').value = activeTaskData.priority;
  document.getElementById('task-status-input').value = activeTaskData.status;
  document.getElementById('task-labels-input').value = (activeTaskData.labels || []).join(', ');
  document.getElementById('task-start-date').value = activeTaskData.startDate ? activeTaskData.startDate.split('T')[0] : '';
  document.getElementById('task-due-date').value = activeTaskData.dueDate ? activeTaskData.dueDate.split('T')[0] : '';

  populateTaskAssignees();
  if (activeTaskData.assignedTo) {
    document.getElementById('task-assignee-input').value = activeTaskData.assignedTo._id;
  }

  document.getElementById('task-modal-title').textContent = 'Edit Task';
  document.getElementById('task-detail-modal')?.classList.remove('open');
  document.getElementById('task-modal')?.classList.add('open');
}

// Real-Time Socket Comment Listeners
window.addEventListener('board:comment_created', (e) => {
  const { taskId } = e.detail;
  if (activeDetailTaskId && activeDetailTaskId === taskId) {
    loadTaskComments(activeDetailTaskId);
  }
});

window.addEventListener('board:comment_updated', (e) => {
  const { taskId } = e.detail;
  if (activeDetailTaskId && activeDetailTaskId === taskId) {
    loadTaskComments(activeDetailTaskId);
  }
});

window.addEventListener('board:comment_deleted', (e) => {
  const { taskId } = e.detail;
  if (activeDetailTaskId && activeDetailTaskId === taskId) {
    loadTaskComments(activeDetailTaskId);
  }
});
