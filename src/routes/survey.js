const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// ── PIN generator (6 rəqəm, unikal) ──────────────────────────────
function generatePin(db) {
  let pin, exists;
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000));
    exists = db.prepare('SELECT 1 FROM registrations WHERE pin_code=?').get(pin)
           || db.prepare('SELECT 1 FROM survey_tokens WHERE pin_code=?').get(pin);
  } while (exists);
  return pin;
}

// ── POST /api/register ────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { surname, name, patronymic, phone, kindergarten_id, appt_date, appt_hour } = req.body;

  if (!surname?.trim() || !name?.trim() || !patronymic?.trim())
    return res.status(400).json({ error: 'Ad, soyad və ata adı tələb olunur' });
  if (!phone?.trim())
    return res.status(400).json({ error: 'Əlaqə nömrəsi tələb olunur' });
  if (!kindergarten_id)
    return res.status(400).json({ error: 'Bağça seçilməyib' });

  // Tarix yoxlaması: bugündən etibarən olmalıdır
  const today = new Date().toISOString().slice(0, 10);
  if (!appt_date || appt_date < today)
    return res.status(400).json({ error: 'Tarix bugündən az ola bilməz' });

  // Saat yoxlaması: 12, 13 (12:00-12:59 → 13:00-13:59)
  const hour = parseInt(appt_hour);
  if (![12, 13].includes(hour))
    return res.status(400).json({ error: 'Randevu saatı 12:00 və ya 13:00 olmalıdır' });

  const db = getDb();

  // Bağça mövcuddurmu?
  const kg = db.prepare('SELECT id, name FROM kindergartens WHERE id=?').get(parseInt(kindergarten_id));
  if (!kg) return res.status(404).json({ error: 'Bağça tapılmadı' });

  // Həmin gün + həmin saat üçün yer varmı? (max 1 nəfər/saat/bağça per day)
  const existing = db.prepare(
    'SELECT COUNT(*) AS cnt FROM registrations WHERE kindergarten_id=? AND appt_date=? AND appt_hour=?'
  ).get(kg.id, appt_date, hour);
  if (existing.cnt >= 1)
    return res.status(409).json({ error: 'Bu saat artıq tutulub. Başqa saat seçin.' });

  const pin = generatePin(db);

  db.prepare(`
    INSERT INTO registrations (surname, name, patronymic, phone, kindergarten_id, appt_date, appt_hour, pin_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    surname.trim(), name.trim(), patronymic.trim(),
    phone.trim(), kg.id, appt_date, hour, pin
  );

  // survey_tokens cədvəlinə də yazırıq — həmin gün, həmin saat aktiv olsun
  db.prepare(`
    INSERT INTO survey_tokens (kindergarten_id, pin_code, valid_date, valid_hour_start, valid_hour_end)
    VALUES (?, ?, ?, ?, ?)
  `).run(kg.id, pin, appt_date, hour, hour + 1);

  res.json({
    ok: true,
    pin,
    appt_date,
    appt_hour: hour,
    kindergartenName: kg.name,
    message: `Qeydiyyat tamamlandı. PIN kodunuz: ${pin}. Bu PIN ${appt_date} tarixində saat ${hour}:00-${hour+1}:00 arasında aktiv olacaq.`
  });
});

// ── GET /api/register/slots?date=YYYY-MM-DD ───────────────────────
// Boş saatları qaytarır (12 və ya 13; bütün bağçalar üçün deyil, valideyn öz bağçasını seçəcək)
router.get('/register/slots', (req, res) => {
  const { date, kindergarten_id } = req.query;
  if (!date || !kindergarten_id)
    return res.status(400).json({ error: 'date və kindergarten_id tələb olunur' });

  const db = getDb();
  const taken = db.prepare(
    'SELECT appt_hour FROM registrations WHERE appt_date=? AND kindergarten_id=?'
  ).all(date, parseInt(kindergarten_id)).map(r => r.appt_hour);

  const all = [12, 13];
  const free = all.filter(h => !taken.includes(h));
  res.json({ free });
});

// ── GET /api/survey/verify?pin=123456 ────────────────────────────
router.get('/verify', (req, res) => {
  const { pin } = req.query;
  if (!pin || !/^\d{6}$/.test(pin))
    return res.status(400).json({ error: 'PIN 6 rəqəmli olmalıdır' });

  const db = getDb();
  const token = db.prepare(
    'SELECT id, kindergarten_id, is_used, valid_date, valid_hour_start, valid_hour_end FROM survey_tokens WHERE pin_code = ?'
  ).get(pin);

  if (!token) return res.status(404).json({ error: 'PIN tapılmadı' });
  if (token.is_used) return res.status(410).json({ error: 'Bu PIN artıq istifadə olunub' });

  // Tarix + saat yoxlaması (yalnız valid_date varsa)
  if (token.valid_date) {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const currentHour = now.getUTCHours() + 4; // Azərbaycan vaxtı (UTC+4)
    const azHour = currentHour >= 24 ? currentHour - 24 : currentHour;

    if (todayStr !== token.valid_date)
      return res.status(403).json({ error: `Bu PIN yalnız ${token.valid_date} tarixində aktivdir` });

    if (azHour < token.valid_hour_start || azHour >= token.valid_hour_end)
      return res.status(403).json({
        error: `Bu PIN yalnız saat ${token.valid_hour_start}:00-${token.valid_hour_end}:00 arasında aktivdir`
      });
  }

  const kg = db.prepare('SELECT name FROM kindergartens WHERE id = ?').get(token.kindergarten_id);
  res.json({ valid: true, kindergartenName: kg?.name });
});

// ── POST /api/survey/submit ───────────────────────────────────────
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
