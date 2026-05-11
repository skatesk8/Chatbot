const express = require('express');
const router = express.Router();

const {
  createChat,
  getChats,
  getChatById,
  sendMessage,
  deleteChat
} = require('../controllers/chat.controller');

router.post('/chats', createChat);
router.get('/chats', getChats);
router.get('/chats/:id', getChatById);
router.post('/chats/:id/message', sendMessage);
router.delete('/chats/:id', deleteChat);

module.exports = router;