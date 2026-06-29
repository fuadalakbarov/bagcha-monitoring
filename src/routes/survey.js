const express = require('express');
const router = express.Router();
const { query, insert, update, count } = require('../db/database');

// ── Slot konfiqurasiyası (11:30 – 14:00, 3 slot) ─────────────────
// id: appt_hour sahəsində saxlanır (1, 2, 3)
const SLOTS = {
  1: { label: '11:30 – 12:20', startH: 11, startM: 30, endH: 12, endM: 20 },
  2: { label: '12:20 – 13:10', startH: 12, startM: 20, endH: 13, endM: 10 },
  3: { label: '13:10 – 14:00', startH: 13, startM: 10, endH: 14, endM: 0 },
};
const SLOT_IDS = [1, 2, 3];

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── POST /api/register ────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { surname, name, patronymic, phone, child_surname, child_name, child_patronymic, kindergarten_id, appt_date, appt_hour } = req.body;

  if (!surname?.trim() || !name?.trim() || !patronymic?.trim())
    return res.status(400).json({ error: 'Valideynin ad, soyad və ata adı tələb olunur' });
  if (!phone?.trim())
    return res.status(400).json({ error: 'Əlaqə nömrəsi tələb olunur' });
  if (!child_surname?.trim() || !child_name?.trim() || !child_patronymic?.trim())
    return res.status(400).json({ error: 'Övladın ad, soyad və ata adı tələb olunur' });
  if (!kindergarten_id)
    return res.status(400).json({ error: 'Bağça seçilməyib' });

  const today = new Date().toISOString().slice(0, 10);
  if (!appt_date || appt_date < today)
    return res.status(400).json({ error: 'Tarix bugündən az ola bilməz' });

  const slotId = parseInt(appt_hour);
  if (!SLOT_IDS.includes(slotId))
    return res.status(400).json({ error: 'Düzgün randevu saatı seçin' });
  const slot = SLOTS[slotId];

  try {
    const kgs = await query('kindergartens', { id: `eq.${parseInt(kindergarten_id)}` });
    if (!kgs.length) return res.status(404).json({ error: 'Bağça tapılmadı' });
    const kg = kgs[0];

    const taken = await count('registrations', {
      kindergarten_id: kg.id,
      appt_date: appt_date,
      appt_hour: slotId
    });
    if (taken >= 1)
      return res.status(409).json({ error: 'Bu saat artıq tutulub. Başqa saat seçin.' });

    // Unikal PIN yarat
    let pin, exists;
    do {
      pin = generatePin();
      const r = await query('registrations', { pin_code: `eq.${pin}` });
      exists = r.length > 0;
    } while (exists);

    await insert('registrations', {
      surname: surname.trim(), name: name.trim(), patronymic: patronymic.trim(),
      phone: phone.trim(),
      child_surname: child_surname.trim(), child_name: child_name.trim(), child_patronymic: child_patronymic.trim(),
      kindergarten_id: kg.id,
      appt_date, appt_hour: slotId, pin_code: pin
    });

    // valid_hour_start/end sahələrində HHMM formatında saxlayırıq (məs: 1130, 1220)
    await insert('survey_tokens', {
      kindergarten_id: kg.id,
      pin_code: pin,
      is_used: 0,
      valid_date: appt_date,
      valid_hour_start: slot.startH * 100 + slot.startM,
      valid_hour_end: slot.endH * 100 + slot.endM
    });

    res.json({
      ok: true, pin, appt_date,
      appt_slot: slotId,
      slot_label: slot.label,
      kindergartenName: kg.name,
      message: `Qeydiyyat tamamlandı. PIN: ${pin}`
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── GET /api/register/slots ───────────────────────────────────────
router.get('/register/slots', async (req, res) => {
  const { date, kindergarten_id } = req.query;
  if (!date || !kindergarten_id)
    return res.status(400).json({ error: 'date və kindergarten_id tələb olunur' });

  try {
    const rows = await query('registrations', {
      appt_date: `eq.${date}`,
      kindergarten_id: `eq.${parseInt(kindergarten_id)}`,
      select: 'appt_hour'
    });
    const taken = rows.map(r => r.appt_hour);
    const free = SLOT_IDS
      .filter(id => !taken.includes(id))
      .map(id => ({ id, label: SLOTS[id].label }));
    res.json({ free, all: SLOT_IDS.map(id => ({ id, label: SLOTS[id].label })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// Master/test PIN — istənilən vaxt işləyir (sınaq üçün)
const MASTER_PIN = process.env.MASTER_PIN || '000000';

// ── GET /api/survey/verify ────────────────────────────────────────
router.get('/verify', async (req, res) => {
  const { pin } = req.query;
  if (!pin || !/^\d{6}$/.test(pin))
    return res.status(400).json({ error: 'PIN 6 rəqəmli olmalıdır' });

  // Master PIN: tarix/saat yoxlamadan, istifadə olunmadan keçir
  if (pin === MASTER_PIN) {
    return res.json({ valid: true, kindergartenName: 'TEST (Master PIN)', master: true });
  }

  try {
    const tokens = await query('survey_tokens', { pin_code: `eq.${pin}` });
    if (!tokens.length) return res.status(404).json({ error: 'PIN tapılmadı' });
    const token = tokens[0];

    if (token.is_used) return res.status(410).json({ error: 'Bu PIN artıq istifadə olunub' });

    if (token.valid_date) {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      let azH = now.getUTCHours() + 4;
      if (azH >= 24) azH -= 24;
      const azM = now.getUTCMinutes();
      const nowHHMM = azH * 100 + azM; // məs: 1145

      const fmt = (v) => `${String(Math.floor(v/100)).padStart(2,'0')}:${String(v%100).padStart(2,'0')}`;

      if (todayStr !== token.valid_date)
        return res.status(403).json({ error: `Bu PIN yalnız ${token.valid_date} tarixində aktivdir` });
      if (nowHHMM < token.valid_hour_start || nowHHMM >= token.valid_hour_end)
        return res.status(403).json({
          error: `Bu PIN yalnız saat ${fmt(token.valid_hour_start)} – ${fmt(token.valid_hour_end)} arasında aktivdir`
        });
    }

    const kgs = await query('kindergartens', { id: `eq.${token.kindergarten_id}` });
    res.json({ valid: true, kindergartenName: kgs[0]?.name });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── POST /api/survey/submit ───────────────────────────────────────
router.post('/submit', async (req, res) => {
  const { pin, volume_rating, quality_rating, taste_rating, hygiene_rating, comment } = req.body;

  if (!pin || !/^\d{6}$/.test(pin))
    return res.status(400).json({ error: 'PIN 6 rəqəmli olmalıdır' });

  const ratings = [volume_rating, quality_rating, taste_rating, hygiene_rating];
  if (ratings.some(r => ![1,2,3].includes(Number(r))))
    return res.status(400).json({ error: 'Bütün qiymətlər 1-3 arasında olmalıdır' });

  try {
    // Master PIN: hər dəfə işləyir, ratings yadda saxlanmır (yalnız test)
    if (pin === MASTER_PIN) {
      return res.json({ ok: true, message: 'TEST: Rəy qəbul edildi (yadda saxlanmadı).', master: true });
    }

    const tokens = await query('survey_tokens', { pin_code: `eq.${pin}`, is_used: 'eq.0' });
    if (!tokens.length)
      return res.status(410).json({ error: 'PIN artıq istifadə olunub və ya tapılmadı' });

    const token = tokens[0];
    await update('survey_tokens', { pin_code: pin }, { is_used: 1 });

    await insert('survey_responses', {
      kindergarten_id: token.kindergarten_id,
      volume_rating: Number(volume_rating),
      quality_rating: Number(quality_rating),
      taste_rating: Number(taste_rating),
      hygiene_rating: Number(hygiene_rating),
      comment: comment?.trim().substring(0, 1000) || null
    });

    res.json({ ok: true, message: 'Rəyiniz qeydə alındı. Təşəkkür edirik!' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

module.exports = router;
