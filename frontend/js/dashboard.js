// Dashboard Logic

async function loadDashboardData() {
  try {
    const statsData = await apiRequest('/dashboard/stats');
    const activityData = await apiRequest('/dashboard/recent-activity');

    renderDashboardStats(statsData.stats);
    renderUpcomingDeadlines(statsData.upcomingDeadlines);
    renderRecentActivity(activityData.activities);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderDashboardStats(stats) {
  if (!stats) return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? 0;
  };

  setVal('stat-total-projects', stats.totalProjects);
  setVal('stat-active-projects', stats.activeProjects);
  setVal('stat-completed-projects', stats.completedProjects);
  setVal('stat-total-tasks', stats.totalTasks);
  setVal('stat-pending-tasks', stats.pendingTasks);
  setVal('stat-completed-tasks', stats.completedTasks);
  setVal('stat-assigned-to-me', stats.tasksAssignedToMe);
  setVal('stat-overdue-tasks', stats.overdueTasks);
}

function renderUpcomingDeadlines(deadlines) {
  const container = document.getElementById('upcoming-deadlines-list');
  if (!container) return;

  if (!deadlines || deadlines.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem;">
        <p>No upcoming deadlines in the next 7 days 🎉</p>
      </div>
    `;
    return;
  }

  container.innerHTML = deadlines.map(task => {
    const dueDate = new Date(task.dueDate);
    const isUrgent = dueDate.getTime() - Date.now() < 24 * 60 * 60 * 1000;
    const day = dueDate.getDate();
    const month = dueDate.toLocaleString('default', { month: 'short' });

    return `
      <div class="deadline-item">
        <div class="deadline-info">
          <div class="deadline-date-pill ${isUrgent ? 'urgent' : ''}">
            <span style="font-size: 1.1rem; line-height: 1;">${day}</span>
            <span>${month}</span>
          </div>
          <div>
            <div class="deadline-title">
              <a href="/project-board.html?id=${task.project?._id || ''}">${task.title}</a>
            </div>
            <div class="deadline-project">${task.project?.name || 'Project'} • Priority: <span class="badge badge-${task.priority.toLowerCase()}">${task.priority}</span></div>
          </div>
        </div>
        <div>
          ${task.assignedTo ? `
            <div class="assignee-avatar" title="Assigned to ${task.assignedTo.name}">
              ${getInitials(task.assignedTo.name)}
            </div>
          ` : '<span class="text-muted" style="font-size: 0.75rem;">Unassigned</span>'}
        </div>
      </div>
    `;
  }).join('');
}

function renderRecentActivity(activities) {
  const container = document.getElementById('recent-activity-list');
  if (!container) return;

  if (!activities || activities.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem;">
        <p>No recent activity recorded</p>
      </div>
    `;
    return;
  }

  container.innerHTML = activities.slice(0, 10).map(act => `
    <div class="activity-item">
      <div class="activity-avatar">
        ${getInitials(act.user?.name || 'U')}
      </div>
      <div class="activity-content">
        <div class="activity-desc">${act.description}</div>
        <div class="activity-time">${formatTimeAgo(act.createdAt)} ${act.project?.name ? `• ${act.project.name}` : ''}</div>
      </div>
    </div>
  `).join('');
}

// Auto-sync on real-time events
window.addEventListener('app:activity_logged', () => {
  loadDashboardData();
});
