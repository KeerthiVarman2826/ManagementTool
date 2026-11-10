// Kanban Board Module

let currentProject = null;
let projectTasks = [];
let draggedTaskId = null;
let boardColumns = ['To Do', 'In Progress', 'Review', 'Completed'];

async function initBoard() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');

  if (!projectId) {
    showToast('No project selected. Redirecting to projects list...', 'error');
    setTimeout(() => { window.location.href = '/projects.html'; }, 1500);
    return;
  }

  try {
    const projectData = await apiRequest(`/projects/${projectId}`);
    currentProject = projectData.project;

    // Join WebSocket room for real-time sync
    joinProjectRoom(currentProject._id);

    renderBoardHeader(currentProject);
    populateAssigneeFilter(currentProject.members);
    await loadBoardTasks();
    setupBoardEventListeners();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderBoardHeader(project) {
  document.getElementById('board-project-title').textContent = project.name;
  document.getElementById('board-project-desc').textContent = project.description || 'No description provided';
  
  const priorityEl = document.getElementById('board-project-priority');
  if (priorityEl) {
    priorityEl.textContent = project.priority;
    priorityEl.className = `badge badge-${project.priority.toLowerCase()}`;
  }

  const statusEl = document.getElementById('board-project-status');
  if (statusEl) {
    statusEl.textContent = project.status;
    statusEl.className = `badge badge-${project.status.toLowerCase().replace(' ', '')}`;
  }
}

function populateAssigneeFilter(members) {
  const select = document.getElementById('board-assignee-filter');
  if (!select) return;

  select.innerHTML = '<option value="all">All Assignees</option>';
  (members || []).forEach(m => {
    if (m.user) {
      select.innerHTML += `<option value="${m.user._id}">${m.user.name}</option>`;
    }
  });
}

async function loadBoardTasks() {
  if (!currentProject) return;

  try {
    const search = document.getElementById('board-search-input')?.value || '';
    const priority = document.getElementById('board-priority-filter')?.value || 'all';
    const assignedTo = document.getElementById('board-assignee-filter')?.value || 'all';

    let query = `?project=${currentProject._id}`;
    if (priority !== 'all') query += `&priority=${priority}`;
    if (assignedTo !== 'all') query += `&assignedTo=${assignedTo}`;
    if (search.trim()) query += `&search=${encodeURIComponent(search.trim())}`;

    const data = await apiRequest(`/tasks${query}`);
    projectTasks = data.tasks;
    renderKanbanBoard();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderKanbanBoard() {
  const container = document.getElementById('board-columns-container');
  if (!container) return;

  container.innerHTML = boardColumns.map(columnName => {
    const columnTasks = projectTasks.filter(t => t.status === columnName);
    return `
      <div class="kanban-column" data-status="${columnName}">
        <div class="column-header">
          <div class="column-title-group">
            <span class="column-title">${columnName}</span>
            <span class="column-count">${columnTasks.length}</span>
          </div>
          <button class="column-add-btn" title="Add task in ${columnName}" onclick="openCreateTaskModal('${columnName}')">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <div class="kanban-cards-list" data-column-status="${columnName}" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, '${columnName}')">
          ${columnTasks.map(task => renderTaskCard(task)).join('')}
        </div>
      </div>
    `;
  }).join('') + `
    <div style="min-width: 200px; display: flex; align-items: flex-start;">
      <button class="btn btn-secondary btn-sm" onclick="promptAddNewColumn()" style="width: 100%; border-style: dashed;">+ Add Column</button>
    </div>
  `;

  // Attach drag events to cards
  document.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
  });
}

function renderTaskCard(task) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'Completed';

  const labelsHtml = (task.labels || []).map(label => `
    <span class="tag-chip">${label}</span>
  `).join('');

  return `
    <div class="task-card" draggable="true" data-task-id="${task._id}" onclick="openTaskDetailModal('${task._id}')">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
        <span class="badge badge-${task.priority.toLowerCase()}">${task.priority}</span>
        ${isOverdue ? '<span class="badge badge-urgent">Overdue</span>' : ''}
      </div>
      
      <div class="task-card-title">${task.title}</div>
      ${task.description ? `<div class="task-card-desc">${task.description}</div>` : ''}

      ${labelsHtml ? `<div class="task-labels">${labelsHtml}</div>` : ''}

      <div class="task-card-footer">
        <div class="task-footer-left">
          ${task.dueDate ? `
            <div class="due-date-indicator ${isOverdue ? 'overdue' : ''}">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>${formatDate(task.dueDate)}</span>
            </div>
          ` : ''}
        </div>
        <div>
          ${task.assignedTo ? `
            <div class="assignee-avatar" title="${task.assignedTo.name}">
              ${getInitials(task.assignedTo.name)}
            </div>
          ` : `
            <div class="assignee-avatar unassigned" title="Unassigned">?</div>
          `}
        </div>
      </div>
    </div>
  `;
}

// Drag & Drop Handlers
function handleDragStart(e) {
  draggedTaskId = this.getAttribute('data-task-id');
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedTaskId);
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.kanban-cards-list').forEach(list => {
    list.classList.remove('drag-over');
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e, newStatus) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  if (!draggedTaskId) return;

  const targetTask = projectTasks.find(t => t._id === draggedTaskId);
  if (!targetTask || targetTask.status === newStatus) return;

  // Optimistic UI update
  targetTask.status = newStatus;
  renderKanbanBoard();

  try {
    await apiRequest(`/tasks/${draggedTaskId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    showToast(`Task moved to ${newStatus}`, 'success');
  } catch (error) {
    showToast('Failed to move task: ' + error.message, 'error');
    loadBoardTasks();
  }
}

function promptAddNewColumn() {
  const colName = prompt('Enter new column name:');
  if (colName && colName.trim()) {
    const trimmed = colName.trim();
    if (!boardColumns.includes(trimmed)) {
      boardColumns.push(trimmed);
      renderKanbanBoard();
      showToast(`Column "${trimmed}" added`, 'success');
    } else {
      showToast('Column already exists', 'error');
    }
  }
}

// Real-Time Socket Event Listeners for Board
function setupBoardEventListeners() {
  window.addEventListener('board:task_created', (e) => {
    const task = e.detail;
    if (currentProject && task.project?._id === currentProject._id) {
      projectTasks.unshift(task);
      renderKanbanBoard();
      showToast(`New task added: ${task.title}`, 'info');
    }
  });

  window.addEventListener('board:task_updated', (e) => {
    const updated = e.detail;
    if (currentProject && updated.project?._id === currentProject._id) {
      const idx = projectTasks.findIndex(t => t._id === updated._id);
      if (idx !== -1) {
        projectTasks[idx] = updated;
      } else {
        projectTasks.unshift(updated);
      }
      renderKanbanBoard();
    }
  });

  window.addEventListener('board:task_moved', (e) => {
    const { taskId, status } = e.detail;
    const task = projectTasks.find(t => t._id === taskId);
    if (task && task.status !== status) {
      task.status = status;
      renderKanbanBoard();
    }
  });

  window.addEventListener('board:task_deleted', (e) => {
    const { taskId } = e.detail;
    projectTasks = projectTasks.filter(t => t._id !== taskId);
    renderKanbanBoard();
  });
}
