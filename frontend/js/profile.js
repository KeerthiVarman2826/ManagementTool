// Profile Management Logic

async function loadProfilePage() {
  try {
    const user = await fetchCurrentUser();
    if (!user) return;

    document.getElementById('profile-name-input').value = user.name || '';
    document.getElementById('profile-email-input').value = user.email || '';
    document.getElementById('profile-bio-input').value = user.bio || '';
    document.getElementById('profile-role-display').textContent = (user.role || 'USER').toUpperCase();
    document.getElementById('profile-avatar-preview').textContent = getInitials(user.name);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleUpdateProfile(e) {
  e.preventDefault();

  const name = document.getElementById('profile-name-input').value;
  const bio = document.getElementById('profile-bio-input').value;

  try {
    const data = await apiRequest('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ name, bio })
    });

    setCurrentUser(data.user);
    updateUserUI(data.user);
    showToast('Profile updated successfully', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleChangePassword(e) {
  e.preventDefault();

  const currentPassword = document.getElementById('current-password-input').value;
  const newPassword = document.getElementById('new-password-input').value;
  const confirmPassword = document.getElementById('confirm-password-input').value;

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match', 'error');
    return;
  }

  try {
    await apiRequest('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });

    showToast('Password changed successfully', 'success');
    document.getElementById('change-password-form').reset();
  } catch (error) {
    showToast(error.message, 'error');
  }
}
