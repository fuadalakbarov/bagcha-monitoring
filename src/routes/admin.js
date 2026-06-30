const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/adminAuth');
const { query, insert, update, del } = require('../db/database');

// ── Köməkçi: orta hesabla ────────────────────────────────────────
function avg(arr, key) {
  const vals = arr.map(r => r[key]).filter(v => v != null);
  if (!vals.length) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

// ── Dashboard ────────────────────────────────────────────────────
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const kgs = await query('kindergartens', { select: 'id,name,region,target', order: 'name.asc' });
    const tokens = await query('survey_tokens', { select: 'id,is_used' });
    const responses = await query('survey_responses', {
      select: 'kindergarten_id,volume_rating,quality_rating,taste_rating,hygiene_rating,comment,submitted_at'
    });

    // Stats
    const stats = {
      active_pins: tokens.filter(t => !t.is_used).length,
      used_pins: tokens.filter(t => t.is_used).length,
      total_pins: tokens.length,
      total_responses: responses.length,
      total_kg: kgs.length
    };

    // Hər bağça üzrə statistika
    const kindergartens = kgs.map(k => {
      const rs = responses.filter(r => r.kindergarten_id === k.id);
      const av = avg(rs, 'volume_rating'), aq = avg(rs, 'quality_rating'),
            at = avg(rs, 'taste_rating'), ah = avg(rs, 'hygiene_rating');
      const overall = Math.round(((av + aq + at + ah) / 4) * 100) / 100;
      return {
        id: k.id, name: k.name, region: k.region, target: k.target,
        participant_count: rs.length,
        avg_volume: av, avg_quality: aq, avg_taste: at, avg_hygiene: ah,
        overall_avg: overall
      };
    });

    // Şərhlər
    const comments = responses
      .filter(r => r.comment && r.comment.trim())
      .sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''))
      .slice(0, 100)
      .map(r => {
        const kg = kgs.find(k => k.id === r.kindergarten_id);
        return { comment: r.comment, submitted_at: r.submitted_at, kindergarten_name: kg?.name || '—' };
      });

    // Son 7 günün trendi
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const byDay = {};
    responses.forEach(r => {
      const day = (r.submitted_at || '').slice(0, 10);
      if (!day || day < weekAgo) return;
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push((r.volume_rating + r.quality_rating + r.taste_rating + r.hygiene_rating) / 4);
    });
    const trend = Object.keys(byDay).sort().map(day => ({
      day,
      count: byDay[day].length,
      avg_score: Math.round((byDay[day].reduce((a, b) => a + b, 0) / byDay[day].length) * 100) / 100
    }));

    res.json({ stats, kindergartens, comments, trend });
  } catch (e) {
    console.error('dashboard error:', e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── Bağça siyahısı (PUBLIC) ──────────────────────────────────────
router.get('/kindergartens/public', async (req, res) => {
  try {
    const list = await query('kindergartens', { select: 'id,name,region', order: 'name.asc' });
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── Bağça siyahısı (admin) ───────────────────────────────────────
router.get('/kindergartens', requireAdmin, async (req, res) => {
  try {
    const list = await query('kindergartens', { select: 'id,name,region,target', order: 'name.asc' });
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── Bağça əlavə et ───────────────────────────────────────────────
router.post('/kindergartens', requireAdmin, async (req, res) => {
  const { name, region, target } = req.body;
  if (!name?.trim() || !region?.trim())
    return res.status(400).json({ error: 'Ad və region tələb olunur' });
  try {
    const rows = await insert('kindergartens', {
      name: name.trim(), region: region.trim(), target: Number(target) || 2.5
    });
    res.json(rows[0] || { ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── Bağça yenilə ─────────────────────────────────────────────────
router.put('/kindergartens/:id', requireAdmin, async (req, res) => {
  const { name, region, target } = req.body;
  if (!name?.trim() || !region?.trim())
    return res.status(400).json({ error: 'Ad və region tələb olunur' });
  try {
    const rows = await update('kindergartens', { id: parseInt(req.params.id) }, {
      name: name.trim(), region: region.trim(), target: Number(target) || 2.5
    });
    if (!rows.length) return res.status(404).json({ error: 'Tapılmadı' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── Bağça sil ────────────────────────────────────────────────────
router.delete('/kindergartens/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await del('survey_tokens', { kindergarten_id: id });
    await del('survey_responses', { kindergarten_id: id });
    await del('registrations', { kindergarten_id: id });
    await del('kindergartens', { id });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── PIN yarat (toplu) ────────────────────────────────────────────
function genPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
router.post('/generate-pins', requireAdmin, async (req, res) => {
  const { kindergarten_id, count = 50 } = req.body;
  if (!kindergarten_id) return res.status(400).json({ error: 'Bağça seçilməyib' });
  try {
    const kgs = await query('kindergartens', { id: `eq.${parseInt(kindergarten_id)}` });
    if (!kgs.length) return res.status(404).json({ error: 'Bağça tapılmadı' });

    const n = Math.min(Number(count), 200);
    const baseUrl = process.env.BASE_URL || `https://bagcha-monitoring.onrender.com`;
    const links = [];

    for (let i = 0; i < n; i++) {
      const pin = genPin();
      await insert('survey_tokens', { kindergarten_id: parseInt(kindergarten_id), pin_code: pin, is_used: 0 });
      links.push({ pin, url: `${baseUrl}/survey?pin=${pin}` });
    }

    res.json({ kindergartenName: kgs[0].name, count: links.length, links });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── CSV export ───────────────────────────────────────────────────
router.get('/export-pins/:kindergartenId', requireAdmin, async (req, res) => {
  try {
    const kgs = await query('kindergartens', { id: `eq.${parseInt(req.params.kindergartenId)}` });
    if (!kgs.length) return res.status(404).json({ error: 'Tapılmadı' });
    const kg = kgs[0];

    const tokens = await query('survey_tokens', {
      kindergarten_id: `eq.${kg.id}`,
      select: 'pin_code,is_used,created_at',
      order: 'created_at.desc'
    });

    const baseUrl = process.env.BASE_URL || `https://bagcha-monitoring.onrender.com`;
    const rows = [['PIN Kod', 'Link', 'Status', 'Yaradılma Tarixi']];
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

module.exports = router;
