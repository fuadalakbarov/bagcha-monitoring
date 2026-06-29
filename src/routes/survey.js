const express = require('express');
const router = express.Router();
const { query, insert, update, count } = require('../db/database');

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── POST /api/register ────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { surname, name, patronymic, phone, kindergarten_id, appt_date, appt_hour } = req.body;

  if (!surname?.trim() || !name?.trim() || !patronymic?.trim())
    return res.status(400).json({ error: 'Ad, soyad və ata adı tələb olunur' });
  if (!phone?.trim())
    return res.status(400).json({ error: 'Əlaqə nömrəsi tələb olunur' });
  if (!kindergarten_id)
    return res.status(400).json({ error: 'Bağça seçilməyib' });

  const today = new Date().toISOString().slice(0, 10);
  if (!appt_date || appt_date < today)
    return res.status(400).json({ error: 'Tarix bugündən az ola bilməz' });

  const hour = parseInt(appt_hour);
  if (![12, 13].includes(hour))
    return res.status(400).json({ error: 'Randevu saatı 12:00 və ya 13:00 olmalıdır' });

  try {
    const kgs = await query('kindergartens', { id: `eq.${parseInt(kindergarten_id)}` });
    if (!kgs.length) return res.status(404).json({ error: 'Bağça tapılmadı' });
    const kg = kgs[0];

    const taken = await count('registrations', {
      kindergarten_id: `eq.${kg.id}`,
      appt_date: `eq.${appt_date}`,
      appt_hour: `eq.${hour}`
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
      phone: phone.trim(), kindergarten_id: kg.id,
      appt_date, appt_hour: hour, pin_code: pin
    });

    await insert('survey_tokens', {
      kindergarten_id: kg.id,
      pin_code: pin,
      is_used: 0,
      valid_date: appt_date,
      valid_hour_start: hour,
      valid_hour_end: hour + 1
    });

    res.json({
      ok: true, pin, appt_date, appt_hour: hour,
      kindergartenName: kg.name,
      message: `Qeydiyyat tamamlandı. PIN: ${pin}`
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── GET /api/register/slots ───────────────────────────────────────
router.get('/slots', async (req, res) => {
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
    const free = [12, 13].filter(h => !taken.includes(h));
    res.json({ free });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── GET /api/survey/verify ────────────────────────────────────────
router.get('/verify', async (req, res) => {
  const { pin } = req.query;
  if (!pin || !/^\d{6}$/.test(pin))
    return res.status(400).json({ error: 'PIN 6 rəqəmli olmalıdır' });

  try {
    const tokens = await query('survey_tokens', { pin_code: `eq.${pin}` });
    if (!tokens.length) return res.status(404).json({ error: 'PIN tapılmadı' });
    const token = tokens[0];

    if (token.is_used) return res.status(410).json({ error: 'Bu PIN artıq istifadə olunub' });

    if (token.valid_date) {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      let azHour = now.getUTCHours() + 4;
      if (azHour >= 24) azHour -= 24;

      if (todayStr !== token.valid_date)
        return res.status(403).json({ error: `Bu PIN yalnız ${token.valid_date} tarixində aktivdir` });
      if (azHour < token.valid_hour_start || azHour >= token.valid_hour_end)
        return res.status(403).json({
          error: `Bu PIN yalnız saat ${token.valid_hour_start}:00-${token.valid_hour_end}:00 arasında aktivdir`
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
