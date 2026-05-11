const pool = require('../db');
const { getAnswerFromQuestion } = require('./ask.controller');

async function createChat(req, res) {
  try {
    const title = req.body.title || 'New Chat';
    const userIdentifier = req.body.user_identifier || 'guest';

    const result = await pool.query(
      `
      INSERT INTO chat_sessions (title, user_identifier)
      VALUES ($1, $2)
      RETURNING *
      `,
      [title, userIdentifier]
    );

    res.json({
      success: true,
      chat: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ success: false, message: 'Error creating chat' });
  }
}

async function getChats(req, res) {
  try {
    const userIdentifier = req.query.user_identifier;

    if (!userIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'user_identifier is required'
      });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM chat_sessions
      WHERE user_identifier = $1
      ORDER BY updated_at DESC
      `,
      [userIdentifier]
    );

    return res.json({
      success: true,
      chats: result.rows
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

async function getChatById(req, res) {
  try {
    const { id } = req.params;

    const chatResult = await pool.query(
      `SELECT * FROM chat_sessions WHERE id = $1`,
      [id]
    );

    if (!chatResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    const messagesResult = await pool.query(
      `
      SELECT *
      FROM chat_messages
      WHERE session_id = $1
      ORDER BY created_at ASC
      `,
      [id]
    );

    res.json({
      success: true,
      chat: chatResult.rows[0],
      messages: messagesResult.rows
    });
  } catch (error) {
    console.error('Error getting chat:', error);
    res.status(500).json({ success: false, message: 'Error getting chat' });
  }
}

async function getAllChats(req, res) {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM chat_sessions
      ORDER BY updated_at DESC
      `
    );

    return res.json({
      success: true,
      chats: result.rows
    });
  } catch (error) {
    console.error('Error getting all chats:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

async function sendMessage(req, res) {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const question = req.body.question?.trim();

    if (!question) {
      return res.status(400).json({
        success: false,
        message: 'Question is required'
      });
    }

    await client.query('BEGIN');

    const chatResult = await client.query(
      `SELECT * FROM chat_sessions WHERE id = $1`,
      [id]
    );

    if (!chatResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    await client.query(
      `
      INSERT INTO chat_messages (session_id, role, message)
      VALUES ($1, $2, $3)
      `,
      [id, 'user', question]
    );

    await client.query('COMMIT');

    const historyResult = await client.query(
      `
      SELECT role, message
      FROM chat_messages
      WHERE session_id = $1
      ORDER BY created_at ASC
      LIMIT 10
      `,
      [id]
    );

    const aiResult = await getAnswerFromQuestion(question, historyResult.rows);

    await client.query('BEGIN');

    await client.query(
      `
      INSERT INTO chat_messages (session_id, role, message, sources)
      VALUES ($1, $2, $3, $4)
      `,
      [
        id,
        'assistant',
        aiResult.answer,
        JSON.stringify(aiResult.sources || [])
      ]
    );

    await client.query(
      `
      UPDATE chat_sessions
      SET
        updated_at = NOW(),
        title = CASE
          WHEN title = 'New Chat' THEN $2
          ELSE title
        END
      WHERE id = $1
      `,
      [id, question.substring(0, 60)]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      answer: aiResult.answer,
      sources: aiResult.sources,
      detected_intent: aiResult.detected_intent
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, message: 'Error sending message' });
  } finally {
    client.release();
  }
}

async function deleteChat(req, res) {
  try {
    const { id } = req.params;

    await pool.query(
      `DELETE FROM chat_sessions WHERE id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Chat deleted'
    });
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({ success: false, message: 'Error deleting chat' });
  }
}

module.exports = {
  createChat,
  getChats,
  getAllChats,
  getChatById,
  sendMessage,
  deleteChat
};