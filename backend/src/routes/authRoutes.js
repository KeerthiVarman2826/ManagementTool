const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  updateProfile,
  searchUsers
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.get('/users', protect, searchUsers);

module.exports = router;
