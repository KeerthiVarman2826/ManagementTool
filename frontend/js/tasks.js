// Task CRUD & Management Logic

let activeTaskProject = null;

function openCreateTaskModal(defaultStatus = 'To Do') {
  const form = document.getElementById('task-form');
  if (form) form.reset();

  const statusSelect = document.getElementById('task-status-input');
  if (statusSelect) statusSelect.value = defaultStatus;

  // Populate project members into assignee dropdown
  populateTaskAssignees();

  document.getElementById('task-modal-title').textContent = 'Create New Task';
  document.getElementById('task-modal')?.classList.add('open');
}

function populateTaskAssignees() {
  const select = document.getElementById('task-assignee-input');
  if (!select) return;

  select.innerHTML = '<option value="">Unassigned</option>';

  const members = currentProject?.members || [];
  members.forEach(m => {
    if (m.user) {
      select.innerHTML += `<option value="${m.user._id}">${m.user.name} (${m.role})</option>`;
    }
  });
}

async function handleSaveTask(e) {
  e.preventDefault();

  const taskId = document.getElementById('task-id-hidden')?.value;
  const title = document.getElementById('task-title-input').value;
  const description = document.getElementById('task-desc-input').value;
  const priority = document.getElementById('task-priority-input').value;
  const status = document.getElementById('task-status-input').value;
  const assignedTo = document.getElementById('task-assignee-input').value || null;
  const startDate = document.getElementById('task-start-date').value || null;
  const dueDate = document.getElementById('task-due-date').value || null;
  const labelsRaw = document.getElementById('task-labels-input').value;

  const payload = {
    title,
    description,
    priority,
    status,
    assignedTo,
    startDate,
    dueDate,
    labels: labelsRaw ? labelsRaw.split(',').map(l => l.trim()).filter(Boolean) : []
  };

  try {
    if (taskId) {
      // Update
      await apiRequest(`/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Task updated successfully', 'success');
    } else {
      // Create
      payload.project = currentProject?._id;
      if (!payload.project) {
        showToast('Please select a project', 'error');
        return;
      }
      await apiRequest('/tasks', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Task created successfully', 'success');
    }

    document.getElementById('task-modal')?.classList.remove('open');
    if (typeof loadBoardTasks === 'function') loadBoardTasks();
    if (typeof loadMyTasksPage === 'function') loadMyTasksPage();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteTaskById(taskId) {
  if (confirm('Are you sure you want to delete this task?')) {
    try {
      await apiRequest(`/tasks/${taskId}`, { method: 'DELETE' });
      showToast('Task deleted', 'success');
      document.getElementById('task-detail-modal')?.classList.remove('open');
      if (typeof loadBoardTasks === 'function') loadBoardTasks();
      if (typeof loadMyTasksPage === 'function') loadMyTasksPage();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

// My Tasks Page View
async function loadMyTasksPage() {
  try {
    const search = document.getElementById('mytasks-search')?.value || '';
    const status = document.getElementById('mytasks-status-filter')?.value || 'all';
    const priority = document.getElementById('mytasks-priority-filter')?.value || 'all';
    const overdue = document.getElementById('mytasks-overdue-filter')?.checked ? 'true' : 'false';

    let query = '?assignedToMe=true';
    if (status !== 'all') query += `&status=${status}`;
    if (priority !== 'all') query += `&priority=${priority}`;
    if (overdue === 'true') query += `&overdue=true`;
    if (search.trim()) query += `&search=${encodeURIComponent(search.trim())}`;

    const data = await apiRequest(`/tasks${query}`);
    renderMyTasksList(data.tasks);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderMyTasksList(tasks) {
  const container = document.getElementById('mytasks-list');
  if (!container) return;

  if (!tasks || tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3>No tasks found</h3>
        <p>You have no pending tasks matching your current filter.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
      ${tasks.map(task => {
        const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'Completed';
        return `
          <div class="card" style="padding: 1rem 1.25rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
            <div style="flex: 1; min-width: 240px;">
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span class="badge badge-${task.priority.toLowerCase()}">${task.priority}</span>
                <span class="badge badge-${task.status.toLowerCase().replace(' ', '')}">${task.status}</span>
                ${isOverdue ? '<span class="badge badge-urgent">Overdue</span>' : ''}
              </div>
              <h4 style="font-size: 1rem; margin-bottom: 0.25rem;">${task.title}</h4>
              <div style="font-size: 0.8rem; color: var(--text-muted);">
                Project: <a href="/project-board.html?id=${task.project?._id || ''}">${task.project?.name || 'Project'}</a>
                ${task.dueDate ? ` • Due: ${formatDate(task.dueDate)}` : ''}
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <select class="form-control" style="width: auto; padding: 0.35rem 0.6rem; font-size: 0.8rem;" onchange="handleQuickStatusChange('${task._id}', this.value)">
                <option value="To Do" ${task.status === 'To Do' ? 'selected' : ''}>To Do</option>
                <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                <option value="Review" ${task.status === 'Review' ? 'selected' : ''}>Review</option>
                <option value="Completed" ${task.status === 'Completed' ? 'selected' : ''}>Completed</option>
              </select>
              <button class="btn btn-secondary btn-sm" onclick="openTaskDetailModal('${task._id}')">View Details</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

async function handleQuickStatusChange(taskId, newStatus) {
  try {
    await apiRequest(`/tasks/${taskId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    showToast(`Status updated to ${newStatus}`, 'success');
    if (typeof loadMyTasksPage === 'function') loadMyTasksPage();
  } catch (error) {
    showToast(error.message, 'error');
  }
}
