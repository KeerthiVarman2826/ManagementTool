// Projects Management

let allProjects = [];

async function loadProjects() {
  try {
    const search = document.getElementById('project-search-input')?.value || '';
    const status = document.getElementById('project-status-filter')?.value || 'all';
    const priority = document.getElementById('project-priority-filter')?.value || 'all';

    let query = `?status=${status}&priority=${priority}`;
    if (search.trim()) {
      query += `&search=${encodeURIComponent(search.trim())}`;
    }

    const data = await apiRequest(`/projects${query}`);
    allProjects = data.projects;
    renderProjectsList(allProjects);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderProjectsList(projects) {
  const container = document.getElementById('projects-grid');
  if (!container) return;

  if (!projects || projects.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <h3>No projects found</h3>
        <p>Get started by creating your first group project to collaborate with your team.</p>
        <button class="btn btn-primary" onclick="openCreateProjectModal()">+ Create New Project</button>
      </div>
    `;
    return;
  }

  const currentUser = getCurrentUser();

  container.innerHTML = projects.map(project => {
    const isOwner = currentUser && project.owner && project.owner._id === currentUser._id;
    const memberObj = currentUser && project.members ? project.members.find(m => m.user?._id === currentUser._id) : null;
    const canManage = isOwner || (memberObj && memberObj.role === 'Admin');

    const membersStackHtml = (project.members || []).slice(0, 4).map(m => `
      <div class="member-stack-avatar" title="${m.user?.name || 'Member'} (${m.role})">
        ${getInitials(m.user?.name || 'M')}
      </div>
    `).join('') + ((project.members?.length > 4) ? `
      <div class="member-stack-avatar">+${project.members.length - 4}</div>
    ` : '');

    return `
      <div class="project-card">
        <div>
          <div class="project-card-header">
            <span class="badge badge-${project.priority.toLowerCase()}">${project.priority}</span>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <span class="badge badge-${project.status.toLowerCase().replace(' ', '')}">${project.status}</span>
              ${canManage ? `
                <button class="btn-icon" title="Edit Project" onclick="openEditProjectModal('${project._id}')">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              ` : ''}
              ${isOwner ? `
                <button class="btn-icon text-danger" title="Delete Project" onclick="confirmDeleteProject('${project._id}', '${project.name.replace(/'/g, "\\'")}')">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              ` : ''}
            </div>
          </div>
          <h3 class="project-title">
            <a href="/project-board.html?id=${project._id}">${project.name}</a>
          </h3>
          <p class="project-desc">${project.description || 'No description provided.'}</p>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.35rem;">
            <span class="text-secondary">Progress (${project.completedTasks || 0}/${project.totalTasks || 0} tasks)</span>
            <span class="font-semibold">${project.progress || 0}%</span>
          </div>
          <div class="project-progress-bar">
            <div class="project-progress-fill" style="width: ${project.progress || 0}%;"></div>
          </div>

          <div class="project-meta-row">
            <div class="member-stack">
              ${membersStackHtml}
            </div>
            <div>
              ${project.dueDate ? `<span>Due ${formatDate(project.dueDate)}</span>` : '<span>No deadline</span>'}
            </div>
          </div>

          <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
            <a href="/project-board.html?id=${project._id}" class="btn btn-primary btn-sm" style="flex: 1;">Open Board</a>
            ${canManage ? `
              <button class="btn btn-secondary btn-sm" onclick="openMembersModal('${project._id}')">Team (${project.members?.length || 1})</button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Create Project
function openCreateProjectModal() {
  const form = document.getElementById('create-project-form');
  if (form) form.reset();
  document.getElementById('create-project-modal')?.classList.add('open');
}

async function handleCreateProject(e) {
  e.preventDefault();
  const name = document.getElementById('project-name-input').value;
  const description = document.getElementById('project-desc-input').value;
  const priority = document.getElementById('project-priority-input').value;
  const status = document.getElementById('project-status-input').value;
  const startDate = document.getElementById('project-start-date').value;
  const dueDate = document.getElementById('project-due-date').value;

  try {
    await apiRequest('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description, priority, status, startDate, dueDate })
    });
    showToast('Project created successfully', 'success');
    document.getElementById('create-project-modal')?.classList.remove('open');
    loadProjects();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// Edit Project
let editingProjectId = null;

async function openEditProjectModal(projectId) {
  try {
    editingProjectId = projectId;
    const data = await apiRequest(`/projects/${projectId}`);
    const project = data.project;

    document.getElementById('edit-project-name').value = project.name;
    document.getElementById('edit-project-desc').value = project.description || '';
    document.getElementById('edit-project-priority').value = project.priority;
    document.getElementById('edit-project-status').value = project.status;
    document.getElementById('edit-project-start-date').value = project.startDate ? project.startDate.split('T')[0] : '';
    document.getElementById('edit-project-due-date').value = project.dueDate ? project.dueDate.split('T')[0] : '';

    document.getElementById('edit-project-modal')?.classList.add('open');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleUpdateProject(e) {
  e.preventDefault();
  if (!editingProjectId) return;

  const name = document.getElementById('edit-project-name').value;
  const description = document.getElementById('edit-project-desc').value;
  const priority = document.getElementById('edit-project-priority').value;
  const status = document.getElementById('edit-project-status').value;
  const startDate = document.getElementById('edit-project-start-date').value;
  const dueDate = document.getElementById('edit-project-due-date').value;

  try {
    await apiRequest(`/projects/${editingProjectId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description, priority, status, startDate, dueDate })
    });
    showToast('Project updated successfully', 'success');
    document.getElementById('edit-project-modal')?.classList.remove('open');
    loadProjects();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// Delete Project
async function confirmDeleteProject(projectId, projectName) {
  if (confirm(`Are you sure you want to delete "${projectName}"? This will permanently delete all tasks, boards, and comments.`)) {
    try {
      await apiRequest(`/projects/${projectId}`, { method: 'DELETE' });
      showToast('Project deleted successfully', 'success');
      loadProjects();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

// Team Members Management Modal
let activeProjectIdForMembers = null;

async function openMembersModal(projectId) {
  try {
    activeProjectIdForMembers = projectId;
    const data = await apiRequest(`/projects/${projectId}`);
    const project = data.project;
    const currentUser = getCurrentUser();

    document.getElementById('members-modal-title').textContent = `Manage Team: ${project.name}`;
    const listEl = document.getElementById('members-modal-list');

    const isOwner = currentUser && project.owner && project.owner._id === currentUser._id;

    listEl.innerHTML = project.members.map(m => {
      const isThisMemberOwner = m.user?._id === project.owner?._id;
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="user-avatar" style="width: 32px; height: 32px; font-size: 0.75rem;">
              ${getInitials(m.user?.name || 'M')}
            </div>
            <div>
              <div style="font-weight: 500; font-size: 0.9rem;">${m.user?.name || 'Unknown'} ${isThisMemberOwner ? '<span class="badge badge-medium">Owner</span>' : ''}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${m.user?.email || ''}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            ${isOwner && !isThisMemberOwner ? `
              <select class="form-control" style="width: auto; padding: 0.3rem 0.5rem; font-size: 0.8rem;" onchange="handleUpdateMemberRole('${projectId}', '${m.user?._id}', this.value)">
                <option value="Member" ${m.role === 'Member' ? 'selected' : ''}>Member</option>
                <option value="Admin" ${m.role === 'Admin' ? 'selected' : ''}>Admin</option>
              </select>
              <button class="btn btn-secondary btn-sm text-danger" onclick="handleRemoveMember('${projectId}', '${m.user?._id}')">Remove</button>
            ` : `
              <span class="badge badge-${m.role === 'Admin' ? 'high' : 'low'}">${m.role}</span>
            `}
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('members-modal')?.classList.add('open');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleAddMember(e) {
  e.preventDefault();
  if (!activeProjectIdForMembers) return;

  const email = document.getElementById('add-member-email').value;
  const role = document.getElementById('add-member-role').value;

  try {
    await apiRequest(`/projects/${activeProjectIdForMembers}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role })
    });
    showToast('Member added successfully', 'success');
    document.getElementById('add-member-email').value = '';
    openMembersModal(activeProjectIdForMembers);
    loadProjects();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleRemoveMember(projectId, userId) {
  if (confirm('Remove this member from the project?')) {
    try {
      await apiRequest(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
      showToast('Member removed', 'success');
      openMembersModal(projectId);
      loadProjects();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

async function handleUpdateMemberRole(projectId, userId, newRole) {
  try {
    await apiRequest(`/projects/${projectId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role: newRole })
    });
    showToast('Member role updated', 'success');
    openMembersModal(projectId);
  } catch (error) {
    showToast(error.message, 'error');
  }
}
