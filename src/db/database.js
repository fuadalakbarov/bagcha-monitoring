const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'monitoring.db');
let db;

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kindergartens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      region     TEXT NOT NULL,
      target     REAL NOT NULL DEFAULT 2.5
    );
    CREATE TABLE IF NOT EXISTS survey_tokens (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      kindergarten_id  INTEGER NOT NULL,
      pin_code         TEXT    NOT NULL UNIQUE,
      is_used          INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (kindergarten_id) REFERENCES kindergartens(id)
    );
    CREATE TABLE IF NOT EXISTS survey_responses (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      kindergarten_id INTEGER NOT NULL,
      volume_rating   INTEGER NOT NULL CHECK(volume_rating  BETWEEN 1 AND 3),
      quality_rating  INTEGER NOT NULL CHECK(quality_rating BETWEEN 1 AND 3),
      taste_rating    INTEGER NOT NULL CHECK(taste_rating   BETWEEN 1 AND 3),
      hygiene_rating  INTEGER NOT NULL CHECK(hygiene_rating BETWEEN 1 AND 3),
      comment         TEXT,
      submitted_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO kindergartens (id, name, region, target) VALUES
      (1, '1 saylı Uşaq Bağçası', 'Gəncə', 2.5),
      (2, '2 saylı Uşaq Bağçası', 'Gəncə', 2.5),
      (3, 'Günəşli Bağça', 'Goranboy', 2.5),
      (4, 'Şəfəq Bağçası', 'Samux', 2.5);
  `);

  // target sütunu köhnə DB-lərdə olmaya bilər — əlavə et
  try { db.exec('ALTER TABLE kindergartens ADD COLUMN target REAL NOT NULL DEFAULT 2.5'); } catch {}
}

module.exports = { getDb };
