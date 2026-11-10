const express = require('express');
const router = express.Router();
const {
  getStats,
  getRecentActivity
} = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/stats', getStats);
router.get('/recent-activity', getRecentActivity);

module.exports = router;
