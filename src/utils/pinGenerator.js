const { getDb } = require('../db/database');

function generatePin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generatePinsForKindergarten(kindergartenId, count = 50) {
  const db = getDb();
  const pins = [];
  let attempts = 0;
  const maxAttempts = count * 15;
  const insert = db.prepare(
    'INSERT OR IGNORE INTO survey_tokens (kindergarten_id, pin_code) VALUES (?, ?)'
  );
  while (pins.length < count && attempts < maxAttempts) {
    attempts++;
    const pin = generatePin();
    const result = insert.run(kindergartenId, pin);
    if (result.changes > 0) pins.push(pin);
  }
  return pins;
}

module.exports = { generatePinsForKindergarten };
