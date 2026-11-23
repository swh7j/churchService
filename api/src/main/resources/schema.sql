-- 앱 시작 시 실행 (이미 있는 테이블은 건드리지 않음)

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
  birth_date TEXT,                              -- 생년월일 (선택, 연도까지 알 때)
  birth_month INTEGER,                          -- 생일 월
  birth_day INTEGER,                            -- 생일 일
  birth_lunar INTEGER NOT NULL DEFAULT 0,       -- 1 = 음력 생일
  birthday_public INTEGER NOT NULL DEFAULT 0,   -- 1 = 성도 화면에 생일(월·일) 공개 (본인 동의 시)
  phone TEXT,
  email TEXT,
  address TEXT,
  position TEXT,
  district TEXT,
  household TEXT,
  status TEXT NOT NULL DEFAULT '재적',
  registered_date TEXT,
  baptism TEXT,
  memo TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 헌금
CREATE TABLE IF NOT EXISTS offering_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS offerings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  donor_name TEXT,
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

-- 연간 예산 (item: 'o:헌금종류id' 또는 'c:계정과목id'), memo = 예결산서 비고
CREATE TABLE IF NOT EXISTS budgets (
  year INTEGER NOT NULL,
  item TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  memo TEXT,
  PRIMARY KEY (year, item)
);

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
  is_public INTEGER NOT NULL DEFAULT 1,  -- 성도 화면 공개 여부
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
  is_public INTEGER NOT NULL DEFAULT 1,
  memo TEXT,
  layout TEXT,          -- 4면 주보 내용 (JSON)
  offering_names TEXT   -- 헌금자 명단 (성도 화면 API로 공개하지 않음)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  location TEXT,
  description TEXT,
  is_public INTEGER NOT NULL DEFAULT 1
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

-- 성도 화면 익명 기도제목 (로그인 없이 작성, 작성할 때 정한 비밀번호로 삭제)
CREATE TABLE IF NOT EXISTS prayers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT,
  content TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0,  -- 비밀 기도제목: 관리자만 내용을 봄
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 악보: 관리자가 올린 여러 장을 화면에서 세로로 이어 붙인 JPEG 한 장
CREATE TABLE IF NOT EXISTS sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  pages INTEGER NOT NULL DEFAULT 1,      -- 합친 장 수
  image BLOB NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1,  -- 성도 화면 공개 여부
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 예배 PPT 서식: 자리 표시({영광송} 등)를 넣은 .pptx 한 개. 주보 내용으로 채워 내려받음
CREATE TABLE IF NOT EXISTS worship_ppt (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  file BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 예배 PPT 에 끼워 넣을 화면 (찬송 악보, 교독문). 번호별로 그림들을 zip 하나로 보관
CREATE TABLE IF NOT EXISTS ppt_inserts (
  kind TEXT NOT NULL,            -- hymn(찬송가) / reading(교독문)
  no TEXT NOT NULL,              -- 장·번 번호
  count INTEGER NOT NULL,        -- 화면 수
  file BLOB NOT NULL,            -- 그림 zip (001.jpg, 002.png …)
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (kind, no)
);

-- 교회 앨범. 사진 파일은 DB 밖 data/photos/{교회코드}/{file}.jpg (작은 사진 {file}_t.jpg) — 매일 DB 백업이 커지지 않게
CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_public INTEGER NOT NULL DEFAULT 1,  -- 성도 화면 공개 여부
  cover_id INTEGER,                      -- 대표 사진 (없으면 첫 사진)
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS album_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  size INTEGER NOT NULL DEFAULT 0,       -- 사진 + 작은 사진 바이트
  file TEXT NOT NULL,                     -- 파일 이름 (무작위)
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_album_photos_album ON album_photos(album_id, sort, id);
