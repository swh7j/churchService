import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.join(__dirname, '..');
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT_DIR, 'data');
export const DB_FILE = path.join(DATA_DIR, 'church.db');

const SCHEMA = `
-- 로그인 사용자 / 세션 / 활동 기록
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','finance','staff')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT DEFAULT (datetime('now','localtime')),
  user_id INTEGER,
  user_name TEXT,
  action TEXT NOT NULL,
  target TEXT,
  target_id TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 교인
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gender TEXT,
  birth_date TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  position TEXT,          -- 직분
  district TEXT,          -- 구역/셀
  household TEXT,         -- 가족(세대주)
  status TEXT NOT NULL DEFAULT '재적',
  registered_date TEXT,
  baptism TEXT,
  memo TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 헌금 종류 / 헌금
CREATE TABLE IF NOT EXISTS offering_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS offerings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  donor_name TEXT,        -- 교인이 아닌 경우 / 무기명
  type_id INTEGER NOT NULL REFERENCES offering_types(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT,
  memo TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_offerings_date ON offerings(date);

-- 교회 회계 (헌금 외 수입/지출)
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
  name TEXT NOT NULL,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
  category_id INTEGER REFERENCES categories(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  description TEXT,
  method TEXT,
  memo TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);

-- 소모임 회계 (교회 장부와 별도)
CREATE TABLE IF NOT EXISTS small_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  leader TEXT,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS group_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES small_groups(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  description TEXT,
  memo TEXT
);

-- 교회 소식 / 주보 / 행사
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT,
  content TEXT,
  pinned INTEGER DEFAULT 0,
  date TEXT
);
CREATE TABLE IF NOT EXISTS bulletins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  title TEXT,
  preacher TEXT,
  sermon_title TEXT,
  scripture TEXT,
  worship_order TEXT,
  announcements TEXT,
  prayer_requests TEXT,
  memo TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  location TEXT,
  description TEXT
);

-- 출석
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  UNIQUE (date, service_id, member_id)
);
`;

function open() {
  const d = new DatabaseSync(DB_FILE);
  d.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  d.exec(SCHEMA);
  return d;
}

fs.mkdirSync(DATA_DIR, { recursive: true });
// export let: 복원 시 DB 연결을 바꿔 끼우면 다른 파일에서도 새 연결을 보게 됩니다.
export let db = open();

if (db.prepare('SELECT COUNT(*) AS n FROM offering_types').get().n === 0) {
  seed(db);
  console.log('샘플 데이터를 넣었습니다.');
}

// 백업 파일로 DB를 통째로 교체 (복원)
export function replaceDatabase(srcFile) {
  db.close();
  for (const ext of ['-wal', '-shm']) fs.rmSync(DB_FILE + ext, { force: true });
  fs.copyFileSync(srcFile, DB_FILE);
  db = open();
}
