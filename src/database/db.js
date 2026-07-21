'use strict';
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'vial.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS incidents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id     TEXT    UNIQUE NOT NULL,
    tipo          TEXT    NOT NULL DEFAULT 'otro',
    calle         TEXT,
    entre_calles  TEXT,
    ciudad        TEXT    DEFAULT 'Huajuapan de León',
    severidad     TEXT    DEFAULT 'media',
    descripcion   TEXT,
    fuente        TEXT    NOT NULL,
    url           TEXT,
    titulo        TEXT,
    activo        INTEGER DEFAULT 1,
    created_at    TEXT    DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
    expires_at    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_activo_created ON incidents(activo, created_at);
  CREATE INDEX IF NOT EXISTS idx_calle          ON incidents(calle);
  CREATE INDEX IF NOT EXISTS idx_fuente         ON incidents(fuente);
`);

module.exports = db;
