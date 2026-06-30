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

// ── Randevu slotları (survey.js ilə eyni) ────────────────────────
const SLOTS = {
  1: { label: '11:30 – 12:20', startH: 11, startM: 30, endH: 12, endM: 20 },
  2: { label: '12:20 – 13:10', startH: 12, startM: 20, endH: 13, endM: 10 },
  3: { label: '13:10 – 14:00', startH: 13, startM: 10, endH: 14, endM: 0 },
};
const SLOT_IDS = [1, 2, 3];

// ── Randevular siyahısı ───────────────────────────────────────────
router.get('/registrations', requireAdmin, async (req, res) => {
  try {
    const [regs, kgs, tokens] = await Promise.all([
      query('registrations', { select: '*', order: 'appt_date.desc,appt_hour.asc' }),
      query('kindergartens', { select: 'id,name,region' }),
      query('survey_tokens', { select: 'pin_code,is_used' })
    ]);
    const kgMap = {};
    kgs.forEach(k => { kgMap[k.id] = k; });
    const usedMap = {};
    tokens.forEach(t => { usedMap[t.pin_code] = !!t.is_used; });

    const registrations = regs.map(r => {
      const kg = kgMap[r.kindergarten_id] || {};
      return {
        id: r.id,
        parent: `${r.surname || ''} ${r.name || ''} ${r.patronymic || ''}`.trim(),
        surname: r.surname, name: r.name, patronymic: r.patronymic,
        phone: r.phone,
        child: `${r.child_surname || ''} ${r.child_name || ''} ${r.child_patronymic || ''}`.trim(),
        child_surname: r.child_surname, child_name: r.child_name, child_patronymic: r.child_patronymic,
        kindergarten_id: r.kindergarten_id,
        kindergarten: kg.name || '—',
        region: kg.region || '—',
        appt_date: r.appt_date,
        appt_hour: r.appt_hour,
        slot: (SLOTS[r.appt_hour] || {}).label || '—',
        pin: r.pin_code,
        used: usedMap[r.pin_code] || false
      };
    });
    res.json({ registrations });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── Randevu yenilə ────────────────────────────────────────────────
router.put('/registrations/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const {
    surname, name, patronymic, phone,
    child_surname, child_name, child_patronymic,
    kindergarten_id, appt_date, appt_hour
  } = req.body;

  if (!surname?.trim() || !name?.trim() || !patronymic?.trim())
    return res.status(400).json({ error: 'Valideynin ad, soyad və ata adı tələb olunur' });
  if (!phone?.trim())
    return res.status(400).json({ error: 'Əlaqə nömrəsi tələb olunur' });
  if (!child_surname?.trim() || !child_name?.trim() || !child_patronymic?.trim())
    return res.status(400).json({ error: 'Övladın ad, soyad və ata adı tələb olunur' });
  if (!kindergarten_id) return res.status(400).json({ error: 'Bağça seçilməyib' });

  const slotId = parseInt(appt_hour);
  if (!SLOT_IDS.includes(slotId))
    return res.status(400).json({ error: 'Düzgün randevu saatı seçin' });
  if (!appt_date) return res.status(400).json({ error: 'Tarix seçilməyib' });

  try {
    const existing = await query('registrations', { id: `eq.${id}` });
    if (!existing.length) return res.status(404).json({ error: 'Randevu tapılmadı' });
    const old = existing[0];

    // Eyni bağça/tarix/saatda başqa randevu varmı (özü istisna)
    const clashes = await query('registrations', {
      kindergarten_id: `eq.${parseInt(kindergarten_id)}`,
      appt_date: `eq.${appt_date}`,
      appt_hour: `eq.${slotId}`
    });
    if (clashes.some(c => c.id !== id))
      return res.status(409).json({ error: 'Bu saat artıq tutulub. Başqa saat seçin.' });

    await update('registrations', { id }, {
      surname: surname.trim(), name: name.trim(), patronymic: patronymic.trim(),
      phone: phone.trim(),
      child_surname: child_surname.trim(), child_name: child_name.trim(), child_patronymic: child_patronymic.trim(),
      kindergarten_id: parseInt(kindergarten_id),
      appt_date, appt_hour: slotId
    });

    // Uyğun PIN-in (survey_tokens) etibarlılıq tarix/saatını da yenilə
    const slot = SLOTS[slotId];
    await update('survey_tokens', { pin_code: old.pin_code }, {
      kindergarten_id: parseInt(kindergarten_id),
      valid_date: appt_date,
      valid_hour_start: slot.startH * 100 + slot.startM,
      valid_hour_end: slot.endH * 100 + slot.endM
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── Randevu sil ────────────────────────────────────────────────────
router.delete('/registrations/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const existing = await query('registrations', { id: `eq.${id}` });
    if (!existing.length) return res.status(404).json({ error: 'Randevu tapılmadı' });
    const reg = existing[0];

    await del('registrations', { id });
    if (reg.pin_code) await del('survey_tokens', { pin_code: reg.pin_code });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── PIN siyahısı (hamısı) ──────────────────────────────────────────
router.get('/pins', requireAdmin, async (req, res) => {
  try {
    const [tokens, kgs, regs] = await Promise.all([
      query('survey_tokens', { select: '*', order: 'created_at.desc' }),
      query('kindergartens', { select: 'id,name,region' }),
      query('registrations', { select: 'pin_code,surname,name,patronymic,child_surname,child_name,child_patronymic,appt_date,appt_hour' })
    ]);
    const kgMap = {};
    kgs.forEach(k => { kgMap[k.id] = k; });
    const regMap = {};
    regs.forEach(r => { regMap[r.pin_code] = r; });

    const pins = tokens.map(t => {
      const kg = kgMap[t.kindergarten_id] || {};
      const reg = regMap[t.pin_code];
      return {
        id: t.id,
        pin_code: t.pin_code,
        kindergarten_id: t.kindergarten_id,
        kindergarten: kg.name || '—',
        region: kg.region || '—',
        is_used: !!t.is_used,
        valid_date: t.valid_date || null,
        valid_hour_start: t.valid_hour_start ?? null,
        valid_hour_end: t.valid_hour_end ?? null,
        assigned_to: reg ? `${reg.surname || ''} ${reg.name || ''} ${reg.patronymic || ''}`.trim() : null,
        assigned_child: reg ? `${reg.child_surname || ''} ${reg.child_name || ''} ${reg.child_patronymic || ''}`.trim() : null,
        created_at: t.created_at
      };
    });
    res.json({ pins });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── PIN yenilə ──────────────────────────────────────────────────────
router.put('/pins/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { kindergarten_id, is_used, valid_date, valid_hour_start, valid_hour_end } = req.body;

  try {
    const existing = await query('survey_tokens', { id: `eq.${id}` });
    if (!existing.length) return res.status(404).json({ error: 'PIN tapılmadı' });

    const payload = {};
    if (kindergarten_id !== undefined) payload.kindergarten_id = parseInt(kindergarten_id);
    if (is_used !== undefined) payload.is_used = is_used ? 1 : 0;
    if (valid_date !== undefined) payload.valid_date = valid_date || null;
    if (valid_hour_start !== undefined) payload.valid_hour_start = valid_hour_start === '' || valid_hour_start === null ? null : parseInt(valid_hour_start);
    if (valid_hour_end !== undefined) payload.valid_hour_end = valid_hour_end === '' || valid_hour_end === null ? null : parseInt(valid_hour_end);

    await update('survey_tokens', { id }, payload);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── PIN sil ───────────────────────────────────────────────────────
router.delete('/pins/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await del('survey_tokens', { id });
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
