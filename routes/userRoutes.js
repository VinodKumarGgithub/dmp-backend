const express = require('express');
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserById,
} = require('../controllers/userController');

const router = express.Router();

// All user routes require authentication and admin role
router.use(authMiddleware);
router.use(requireAdmin);

router.get('/', listUsers);
router.get('/:id', getUserById);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

module.exports = router;

