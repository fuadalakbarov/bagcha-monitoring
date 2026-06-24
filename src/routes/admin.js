const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/adminAuth');
const { getDb } = require('../db/database');
const { generatePinsForKindergarten } = require('../utils/pinGenerator');

// Dashboard məlumatları
router.get('/dashboard', requireAdmin, (req, res) => {
  const db = getDb();

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM survey_tokens WHERE is_used = 0) AS active_pins,
      (SELECT COUNT(*) FROM survey_tokens WHERE is_used = 1) AS used_pins,
      (SELECT COUNT(*) FROM survey_tokens)                   AS total_pins,
      (SELECT COUNT(*) FROM survey_responses)                AS total_responses,
      (SELECT COUNT(DISTINCT id) FROM kindergartens)         AS total_kg
  `).get();

  const kindergartens = db.prepare(`
    SELECT
      k.id, k.name, k.region, k.target,
      COUNT(r.id) AS participant_count,
      ROUND(AVG(r.volume_rating),  2) AS avg_volume,
      ROUND(AVG(r.quality_rating), 2) AS avg_quality,
      ROUND(AVG(r.taste_rating),   2) AS avg_taste,
      ROUND(AVG(r.hygiene_rating), 2) AS avg_hygiene,
      ROUND((COALESCE(AVG(r.volume_rating),0) + COALESCE(AVG(r.quality_rating),0) +
             COALESCE(AVG(r.taste_rating),0)  + COALESCE(AVG(r.hygiene_rating),0)) / 4.0, 2) AS overall_avg
    FROM kindergartens k
    LEFT JOIN survey_responses r ON r.kindergarten_id = k.id
    GROUP BY k.id
    ORDER BY k.name
  `).all();

  const comments = db.prepare(`
    SELECT r.comment, r.submitted_at, k.name AS kindergarten_name
    FROM survey_responses r
    JOIN kindergartens k ON k.id = r.kindergarten_id
    WHERE r.comment IS NOT NULL AND TRIM(r.comment) != ''
    ORDER BY r.submitted_at DESC
    LIMIT 100
  `).all();

  // Son 7 günün trendi
  const trend = db.prepare(`
    SELECT
      date(submitted_at) AS day,
      COUNT(*) AS count,
      ROUND(AVG(volume_rating + quality_rating + taste_rating + hygiene_rating) / 4.0, 2) AS avg_score
    FROM survey_responses
    WHERE submitted_at >= date('now', '-7 days')
    GROUP BY date(submitted_at)
    ORDER BY day
  `).all();

  res.json({ stats, kindergartens, comments, trend });
});

// Bağça siyahısı
router.get('/kindergartens', requireAdmin, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT id, name, region, target FROM kindergartens ORDER BY name').all());
});

// Bağça əlavə et
router.post('/kindergartens', requireAdmin, (req, res) => {
  const { name, region, target } = req.body;
  if (!name?.trim() || !region?.trim()) return res.status(400).json({ error: 'Ad və region tələb olunur' });
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO kindergartens (name, region, target) VALUES (?, ?, ?)'
  ).run(name.trim(), region.trim(), Number(target) || 2.5);
  res.json({ id: result.lastInsertRowid, name: name.trim(), region: region.trim(), target: Number(target) || 2.5 });
});

// Bağça yenilə
router.put('/kindergartens/:id', requireAdmin, (req, res) => {
  const { name, region, target } = req.body;
  if (!name?.trim() || !region?.trim()) return res.status(400).json({ error: 'Ad və region tələb olunur' });
  const db = getDb();
  const result = db.prepare(
    'UPDATE kindergartens SET name=?, region=?, target=? WHERE id=?'
  ).run(name.trim(), region.trim(), Number(target) || 2.5, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Tapılmadı' });
  res.json({ ok: true });
});

// Bağça sil
router.delete('/kindergartens/:id', requireAdmin, (req, res) => {
  const db = getDb();
  // əvvəlcə bağlı məlumatları sil
  db.prepare('DELETE FROM survey_tokens WHERE kindergarten_id=?').run(req.params.id);
  db.prepare('DELETE FROM survey_responses WHERE kindergarten_id=?').run(req.params.id);
  const result = db.prepare('DELETE FROM kindergartens WHERE id=?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Tapılmadı' });
  res.json({ ok: true });
});

// PIN yarat
router.post('/generate-pins', requireAdmin, (req, res) => {
  const { kindergarten_id, count = 50 } = req.body;
  if (!kindergarten_id) return res.status(400).json({ error: 'Bağça seçilməyib' });

  const db = getDb();
  const kg = db.prepare('SELECT name FROM kindergartens WHERE id = ?').get(kindergarten_id);
  if (!kg) return res.status(404).json({ error: 'Bağça tapılmadı' });

  const pins = generatePinsForKindergarten(Number(kindergarten_id), Math.min(Number(count), 200));
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const links = pins.map(pin => ({ pin, url: `${baseUrl}/survey?pin=${pin}` }));

  res.json({ kindergartenName: kg.name, count: links.length, links });
});

// CSV export
router.get('/export-pins/:kindergartenId', requireAdmin, (req, res) => {
  const db = getDb();
  const kg = db.prepare('SELECT name FROM kindergartens WHERE id = ?').get(req.params.kindergartenId);
  if (!kg) return res.status(404).json({ error: 'Tapılmadı' });

  const tokens = db.prepare(`
    SELECT pin_code, is_used, created_at FROM survey_tokens
    WHERE kindergarten_id = ? ORDER BY created_at DESC
  `).all(req.params.kindergartenId);

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const rows = [['PIN Kod','Link','Status','Yaradılma Tarixi']];
  tokens.forEach(t => rows.push([
    t.pin_code,
    `${baseUrl}/survey?pin=${t.pin_code}`,
    t.is_used ? 'İstifadə edilib' : 'Aktiv',
    t.created_at
  ]));

  const csv = rows.map(r => r.join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(kg.name)}-pinler.csv"`);
  res.send('\uFEFF' + csv);
});

module.exports = router;
