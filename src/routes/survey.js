const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/survey/verify?pin=123456
router.get('/verify', (req, res) => {
  const { pin } = req.query;
  if (!pin || !/^\d{6}$/.test(pin))
    return res.status(400).json({ error: 'PIN 6 rəqəmli olmalıdır' });

  const db = getDb();
  const token = db.prepare(
    'SELECT id, kindergarten_id, is_used FROM survey_tokens WHERE pin_code = ?'
  ).get(pin);

  if (!token) return res.status(404).json({ error: 'PIN tapılmadı' });
  if (token.is_used) return res.status(410).json({ error: 'Bu PIN artıq istifadə olunub' });

  const kg = db.prepare('SELECT name FROM kindergartens WHERE id = ?').get(token.kindergarten_id);
  res.json({ valid: true, kindergartenName: kg?.name });
});

// POST /api/survey/submit
router.post('/submit', (req, res) => {
  const { pin, volume_rating, quality_rating, taste_rating, hygiene_rating, comment } = req.body;

  if (!pin || !/^\d{6}$/.test(pin))
    return res.status(400).json({ error: 'PIN 6 rəqəmli olmalıdır' });

  const ratings = [volume_rating, quality_rating, taste_rating, hygiene_rating];
  if (ratings.some(r => ![1,2,3].includes(Number(r))))
    return res.status(400).json({ error: 'Bütün qiymətlər 1-3 arasında olmalıdır' });

  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare(
      'UPDATE survey_tokens SET is_used = 1 WHERE pin_code = ? AND is_used = 0'
    ).run(pin);

    if (result.changes === 0) {
      db.exec('ROLLBACK');
      return res.status(410).json({ error: 'PIN artıq istifadə olunub və ya tapılmadı' });
    }

    const token = db.prepare('SELECT kindergarten_id FROM survey_tokens WHERE pin_code = ?').get(pin);

    db.prepare(`
      INSERT INTO survey_responses
        (kindergarten_id, volume_rating, quality_rating, taste_rating, hygiene_rating, comment)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      token.kindergarten_id,
      Number(volume_rating), Number(quality_rating),
      Number(taste_rating),  Number(hygiene_rating),
      comment?.trim().substring(0, 1000) || null
    );

    db.exec('COMMIT');
    res.json({ ok: true, message: 'Rəyiniz qeydə alındı. Təşəkkür edirik!' });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server xətası' });
  }
});

module.exports = router;
