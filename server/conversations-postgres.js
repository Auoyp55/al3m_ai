'use strict';

const { query } = require('./postgres');

async function listConversations(userId) {
  const result = await query(`
    SELECT
      c.id,
      c.title,
      c.created_at,
      c.updated_at,
      COUNT(m.id)::int AS message_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.user_id = $1
    GROUP BY c.id
    ORDER BY c.updated_at DESC NULLS LAST
    LIMIT 100
  `, [userId]);

  return result.rows;
}

async function getConversation(conversationId, userId) {
  const result = await query(`
    SELECT id, title, user_id
    FROM conversations
    WHERE id = $1 AND user_id = $2
    LIMIT 1
  `, [conversationId, userId]);

  return result.rows[0] || null;
}

async function listMessages(conversationId) {
  const result = await query(`
    SELECT id, role, content, created_at
    FROM messages
    WHERE conversation_id = $1
    ORDER BY id ASC
    LIMIT 500
  `, [conversationId]);

  return result.rows;
}


async function createConversation(userId, title) {
  const result = await query(
    'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id',
    [userId, title]
  );
  return Number(result.rows[0].id);
}

async function addMessage(conversationId, role, content) {
  const result = await query(
    'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING id',
    [conversationId, role, content]
  );
  return result.rows[0];
}

async function getHistory(conversationId) {
  const result = await query(
    'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 20',
    [conversationId]
  );
  return result.rows;
}

async function updateConversation(conversationId) {
  await query(
    'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
    [conversationId]
  );
}

module.exports = {
  updateConversation,
  getHistory,
  addMessage,
  createConversation,
  listConversations,
  getConversation,
  listMessages
};
