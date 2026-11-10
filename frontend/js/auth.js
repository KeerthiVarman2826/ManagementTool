// Authentication Controller for Frontend

async function registerUser({ name, email, password, confirmPassword }) {
  const data = await apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, confirmPassword })
  });

  if (data.token) {
    setToken(data.token);
    setCurrentUser(data.user);
  }
  return data;
}

async function loginUser({ email, password }) {
  const data = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  if (data.token) {
    setToken(data.token);
    setCurrentUser(data.user);
  }
  return data;
}

function logoutUser() {
  setToken(null);
  setCurrentUser(null);
  window.location.href = '/login.html';
}

async function fetchCurrentUser() {
  try {
    const data = await apiRequest('/auth/me');
    if (data.user) {
      setCurrentUser(data.user);
      return data.user;
    }
  } catch (error) {
    return null;
  }
}

// Route Guard & UI Sync
function initAuthGuard(isPublicPage = false) {
  const token = getToken();

  if (!token && !isPublicPage) {
    window.location.href = '/login.html';
    return false;
  }

  if (token && isPublicPage) {
    window.location.href = '/dashboard.html';
    return false;
  }

  if (token) {
    const user = getCurrentUser();
    updateUserUI(user);
    initSocketConnection();
    // Also fetch fresh user profile asynchronously
    fetchCurrentUser().then(freshUser => {
      if (freshUser) updateUserUI(freshUser);
    });
  }

  return true;
}

function updateUserUI(user) {
  if (!user) return;

  const nameElements = document.querySelectorAll('.current-user-name');
  nameElements.forEach(el => { el.textContent = user.name; });

  const emailElements = document.querySelectorAll('.current-user-email');
  emailElements.forEach(el => { el.textContent = user.email; });

  const roleElements = document.querySelectorAll('.current-user-role');
  roleElements.forEach(el => {
    el.textContent = user.role ? user.role.toUpperCase() : 'USER';
  });

  const avatarElements = document.querySelectorAll('.current-user-avatar');
  avatarElements.forEach(el => {
    if (user.profileImage) {
      el.innerHTML = `<img src="${user.profileImage}" alt="${user.name}">`;
    } else {
      el.textContent = getInitials(user.name);
    }
  });
}
