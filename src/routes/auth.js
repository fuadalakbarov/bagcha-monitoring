const express = require('express');
const router = express.Router();
const { requireAdmin, createSession, deleteSession, ADMIN_PASSWORD } = require('../middleware/adminAuth');

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Şifrə yanlışdır' });
  const token = createSession();
  res.cookie('admin_token', token, { httpOnly: true, sameSite: 'strict', maxAge: 8*60*60*1000 });
  res.json({ ok: true });
});

router.post('/logout', requireAdmin, (req, res) => {
  deleteSession(req.cookies.admin_token);
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

module.exports = router;
