// Notifications Manager

async function loadNotifications() {
  try {
    const data = await apiRequest('/notifications');
    renderNotificationBadge(data.unreadCount);
    renderNotificationDropdown(data.notifications);
    return data;
  } catch (error) {
    console.error('Failed to load notifications', error);
  }
}

function renderNotificationBadge(unreadCount) {
  const badgeElements = document.querySelectorAll('.notification-unread-badge');
  badgeElements.forEach(badge => {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  });
}

function renderNotificationDropdown(notifications) {
  const listEl = document.getElementById('notification-dropdown-list');
  if (!listEl) return;

  if (!notifications || notifications.length === 0) {
    listEl.innerHTML = `
      <div style="padding: 2rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
        No notifications yet
      </div>
    `;
    return;
  }

  listEl.innerHTML = notifications.slice(0, 6).map(n => `
    <div class="notification-item ${n.isRead ? '' : 'unread'}" onclick="handleNotificationClick('${n._id}', '${n.project ? n.project._id : ''}')">
      <div class="notification-item-text">
        <div>${n.message}</div>
        <div class="notification-item-time">${formatTimeAgo(n.createdAt)}</div>
      </div>
    </div>
  `).join('');
}

async function handleNotificationClick(notificationId, projectId) {
  try {
    await apiRequest(`/notifications/${notificationId}/read`, { method: 'PUT' });
    loadNotifications();
    if (projectId) {
      window.location.href = `/project-board.html?id=${projectId}`;
    }
  } catch (err) {
    console.error(err);
  }
}

async function markAllNotificationsAsRead() {
  try {
    await apiRequest('/notifications/read-all', { method: 'PUT' });
    showToast('All notifications marked as read', 'success');
    loadNotifications();
    if (typeof loadAllNotificationsPage === 'function') {
      loadAllNotificationsPage();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteNotificationById(id) {
  try {
    await apiRequest(`/notifications/${id}`, { method: 'DELETE' });
    showToast('Notification deleted', 'success');
    loadNotifications();
    if (typeof loadAllNotificationsPage === 'function') {
      loadAllNotificationsPage();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function initNotificationDropdown() {
  const bellBtn = document.getElementById('notification-bell-btn');
  const dropdown = document.getElementById('notification-dropdown');
  const markAllBtn = document.getElementById('mark-all-read-btn');

  if (bellBtn && dropdown) {
    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && e.target !== bellBtn) {
        dropdown.classList.remove('open');
      }
    });
  }

  if (markAllBtn) {
    markAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      markAllNotificationsAsRead();
    });
  }

  // Real-time notification event
  window.addEventListener('app:notification', () => {
    loadNotifications();
    if (typeof loadAllNotificationsPage === 'function') {
      loadAllNotificationsPage();
    }
  });

  // Load immediately on page init
  loadNotifications();
}
