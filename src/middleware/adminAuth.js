const crypto = require('crypto');

const sessions = new Map();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin2024!';
const SESSION_TTL = 8 * 60 * 60 * 1000;

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: 'Giriş tələb olunur' });
  const session = sessions.get(token);
  if (!session) return res.status(401).json({ error: 'Sessiya tapılmadı' });
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Sessiya müddəti bitib' });
  }
  next();
}

function deleteSession(token) { sessions.delete(token); }

module.exports = { requireAdmin, createSession, deleteSession, ADMIN_PASSWORD };
