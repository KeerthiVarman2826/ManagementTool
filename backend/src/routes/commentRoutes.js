const express = require('express');
const router = express.Router();
const {
  updateComment,
  deleteComment
} = require('../controllers/commentController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/:id')
  .put(updateComment)
  .delete(deleteComment);

module.exports = router;
