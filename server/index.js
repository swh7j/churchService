import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import {
  currentUser, DUMMY_HASH, endSession, has, hashPassword, loginGuard, publicUser, ROLES,
  startSession, validatePassword, validateUsername, verifyPassword,
} from './auth.js';
import { BACKUP_DIR, backupPath, createBackup, deleteBackup, listBackups, restoreBackup, startAutoBackup } from './backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback'); // 배포 시 Nginx 등 리버스 프록시 뒤에서 HTTPS 인식
app.use(express.json({ limit: '1mb' }));

// db는 복원 시 바뀔 수 있으므로 항상 호출 시점의 연결을 사용
const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const localDate = () => new Date().toLocaleDateString('sv-SE');
const monthEnd = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).toLocaleDateString('sv-SE');
};
const userCount = () => get('SELECT COUNT(*) AS n FROM users').n;
const churchName = () => get("SELECT value FROM settings WHERE key = 'church_name'")?.value || '';

// 활동 기록 (누가 언제 무엇을 바꿨는지)
function audit(req, action, target, targetId = null, detail = null) {
  try {
    const d = detail == null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail);
    run(
      'INSERT INTO audit_log (user_id, user_name, action, target, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
      req.user?.id ?? null, req.user?.name ?? null, action, target, targetId == null ? null : String(targetId), d?.slice(0, 1000) ?? null,
    );
  } catch (e) {
    console.error('활동 기록 실패:', e.message);
  }
}

const need = (area) => (req, res, next) =>
  has(req.user, area) ? next() : res.status(403).json({ error: '이 기능을 사용할 권한이 없습니다.' });

/* ------------------------------------------------------------------ */
/* 로그인 (로그인 없이 접근 가능한 API는 여기까지만)                      */
/* ------------------------------------------------------------------ */

app.get('/api/auth/me', (req, res) => {
  res.json({ setupRequired: userCount() === 0, churchName: churchName(), user: publicUser(currentUser(req)) });
});

// 최초 실행: 사용자가 한 명도 없을 때만 관리자 계정을 만들 수 있음
app.post('/api/auth/setup', (req, res) => {
  if (userCount() > 0) return res.status(400).json({ error: '이미 관리자 계정이 있습니다. 로그인해 주세요.' });
  const { username = '', name = '', password } = req.body || {};
  validateUsername(username.trim());
  if (!name.trim()) throw new Error('이름을 입력해 주세요.');
  validatePassword(password);
  const id = Number(
    run('INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)', username.trim(), name.trim(), hashPassword(password), 'admin')
      .lastInsertRowid,
  );
  startSession(req, res, id);
  req.user = { id, name: name.trim() };
  audit(req, '계정 생성', 'users', id, '최초 관리자');
  res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const key = String(username).trim().toLowerCase();
  const locked = loginGuard.lockedMinutes(key);
  if (locked) return res.status(429).json({ error: `로그인 실패가 반복되어 잠겼습니다. ${locked}분 후 다시 시도해 주세요.` });
  const u = get('SELECT * FROM users WHERE username = ?', String(username).trim());
  const ok = verifyPassword(password, u?.password_hash ?? DUMMY_HASH) && u && u.active;
  if (!ok) {
    loginGuard.fail(key);
    return res.status(400).json({ error: '아이디 또는 비밀번호가 맞지 않습니다.' });
  }
  loginGuard.success(key);
  startSession(req, res, u.id);
  req.user = u;
  audit(req, '로그인', 'auth');
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  req.user = currentUser(req);
  if (req.user) audit(req, '로그아웃', 'auth');
  endSession(req, res);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* 여기부터는 로그인 필요                                              */
/* ------------------------------------------------------------------ */
app.use('/api', (req, res, next) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: '로그인이 필요합니다.' });
  req.user = u;
  next();
});

app.post('/api/auth/password', (req, res) => {
  const { current, next: pw } = req.body || {};
  const u = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(current || '', u.password_hash)) throw new Error('현재 비밀번호가 맞지 않습니다.');
  validatePassword(pw);
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(pw), u.id);
  run('DELETE FROM sessions WHERE user_id = ?', u.id); // 다른 기기 로그인도 모두 해제
  startSession(req, res, u.id);
  audit(req, '비밀번호 변경', 'users', u.id);
  res.json({ ok: true });
});

/* 사용자 관리 (관리자) */
const activeAdmins = (exceptId) => get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?", exceptId).n;

app.get('/api/users', need('admin'), (req, res) => {
  res.json(all('SELECT id, username, name, role, active, created_at, last_login FROM users ORDER BY active DESC, name'));
});
app.post('/api/users', need('admin'), (req, res) => {
  const { username = '', name = '', role, password } = req.body || {};
  validateUsername(username.trim());
  if (!name.trim()) throw new Error('이름을 입력해 주세요.');
  if (!ROLES[role]) throw new Error('역할을 선택해 주세요.');
  validatePassword(password);
  const id = Number(
    run('INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)', username.trim(), name.trim(), hashPassword(password), role)
      .lastInsertRowid,
  );
  audit(req, '계정 생성', 'users', id, { username: username.trim(), name: name.trim(), role });
  res.status(201).json({ id });
});
app.put('/api/users/:id', need('admin'), (req, res) => {
  const id = Number(req.params.id);
  const u = get('SELECT * FROM users WHERE id = ?', id);
  if (!u) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  const { name = u.name, role = u.role, password } = req.body || {};
  const active = req.body?.active === undefined ? u.active : Number(req.body.active) ? 1 : 0;
  if (!ROLES[role]) throw new Error('역할을 선택해 주세요.');
  if (id === req.user.id && (!active || role !== 'admin')) throw new Error('자기 자신의 관리자 권한은 해제할 수 없습니다.');
  if (u.role === 'admin' && (role !== 'admin' || !active) && activeAdmins(id) === 0) throw new Error('관리자는 최소 한 명 있어야 합니다.');
  run('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?', String(name).trim() || u.name, role, active, id);
  if (password) {
    validatePassword(password);
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), id);
  }
  if (password || !active || role !== u.role) run('DELETE FROM sessions WHERE user_id = ?', id); // 다시 로그인하게
  audit(req, '계정 수정', 'users', id, { name, role, active, passwordReset: !!password });
  res.json({ ok: true });
});
app.delete('/api/users/:id', need('admin'), (req, res) => {
  const id = Number(req.params.id);
  const u = get('SELECT * FROM users WHERE id = ?', id);
  if (!u) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if (id === req.user.id) throw new Error('자기 자신은 삭제할 수 없습니다.');
  if (u.role === 'admin' && activeAdmins(id) === 0) throw new Error('관리자는 최소 한 명 있어야 합니다.');
  run('DELETE FROM users WHERE id = ?', id);
  audit(req, '계정 삭제', 'users', id, { username: u.username, name: u.name });
  res.json({ ok: true });
});

/* 백업 (관리자) */
app.get('/api/backups', need('admin'), (req, res) => res.json({ dir: BACKUP_DIR, list: listBackups() }));
app.post('/api/backups', need('admin'), (req, res) => {
  const b = createBackup('manual');
  audit(req, '백업', 'backups', b.name);
  res.status(201).json(b);
});
app.get('/api/backups/:name/download', need('admin'), (req, res) => {
  const p = backupPath(req.params.name);
  audit(req, '백업 다운로드', 'backups', req.params.name);
  res.download(p);
});
app.post('/api/backups/:name/restore', need('admin'), (req, res) => {
  const safety = restoreBackup(req.params.name);
  // 복원 후에는 DB가 바뀌었으므로, 복원된 DB에 기록
  audit(req, '복원', 'backups', req.params.name, `복원 직전 상태는 ${safety.name} 에 보관`);
  res.json({ ok: true, safety: safety.name });
});
app.delete('/api/backups/:name', need('admin'), (req, res) => {
  deleteBackup(req.params.name);
  audit(req, '백업 삭제', 'backups', req.params.name);
  res.json({ ok: true });
});

/* 활동 기록 (관리자) */
app.get('/api/audit', need('admin'), (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  const limit = Math.min(Number(req.query.limit) || 300, 2000);
  res.json(
    q
      ? all('SELECT * FROM audit_log WHERE user_name LIKE ? OR action LIKE ? OR target LIKE ? OR detail LIKE ? ORDER BY id DESC LIMIT ?', q, q, q, q, limit)
      : all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', limit),
  );
});

/* 설정 */
app.get('/api/settings', (req, res) => {
  res.json(Object.fromEntries(all('SELECT key, value FROM settings').map((r) => [r.key, r.value])));
});
app.put('/api/settings', need('admin'), (req, res) => {
  const st = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(req.body || {})) st.run(k, v == null ? '' : String(v));
  audit(req, '설정 변경', 'settings', null, req.body);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* 대시보드 / 장부 / 보고서 / 출석                                      */
/* ------------------------------------------------------------------ */

app.get('/api/dashboard', (req, res) => {
  const t = localDate();
  const ms = t.slice(0, 7) + '-01';
  const me = monthEnd(t.slice(0, 7));
  const fin = has(req.user, 'finance');
  const members = get(
    `SELECT COALESCE(SUM(status IN ('재적','새가족')),0) AS active, COUNT(*) AS total,
            COALESCE(SUM(registered_date BETWEEN ? AND ?),0) AS newThisMonth FROM members`,
    ms, me,
  );
  let finance = null;
  if (fin) {
    const offering = get('SELECT COALESCE(SUM(amount),0) AS v FROM offerings WHERE date BETWEEN ? AND ?', ms, me).v;
    const tx = get(
      `SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount END),0) AS inc,
              COALESCE(SUM(CASE WHEN kind='expense' THEN amount END),0) AS exp
         FROM transactions WHERE date BETWEEN ? AND ?`,
      ms, me,
    );
    finance = {
      month: { offering, income: offering + tx.inc, expense: tx.exp },
      balance: get(
        `SELECT (SELECT COALESCE(SUM(amount),0) FROM offerings)
              + (SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount ELSE -amount END),0) FROM transactions) AS v`,
      ).v,
      byType: all(
        `SELECT t.name, SUM(o.amount) AS amount FROM offerings o JOIN offering_types t ON t.id = o.type_id
          WHERE o.date BETWEEN ? AND ? GROUP BY t.id ORDER BY t.sort, t.id`,
        ms, me,
      ),
    };
  }
  const lastAtt = get('SELECT MAX(date) AS d FROM attendance WHERE date <= ?', t).d;
  res.json({
    today: t,
    members,
    finance,
    attendance: {
      date: lastAtt,
      list: lastAtt
        ? all(
            `SELECT s.name, COUNT(*) AS cnt FROM attendance a JOIN services s ON s.id = a.service_id
              WHERE a.date = ? GROUP BY s.id ORDER BY s.sort`,
            lastAtt,
          )
        : [],
    },
    news: all('SELECT id, title, category, date, pinned FROM news ORDER BY pinned DESC, date DESC, id DESC LIMIT 5'),
    events: all('SELECT * FROM events WHERE COALESCE(end_date, start_date) >= ? ORDER BY start_date LIMIT 5', t),
    birthdays: all(
      `SELECT id, name, position, birth_date FROM members
        WHERE substr(birth_date,6,2) = ? AND status IN ('재적','새가족') ORDER BY substr(birth_date,9,2)`,
      t.slice(5, 7),
    ),
  });
});

// 회계 장부: 헌금(일자·종류별 합계) + 수기 입력 수입/지출
app.get('/api/ledger', need('finance'), (req, res) => {
  const t = localDate();
  const from = req.query.from || t.slice(0, 7) + '-01';
  const to = req.query.to || monthEnd(t.slice(0, 7));
  const carry = get(
    `SELECT (SELECT COALESCE(SUM(amount),0) FROM offerings WHERE date < ?)
          + (SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount ELSE -amount END),0) FROM transactions WHERE date < ?) AS v`,
    from, from,
  ).v;
  const rows = all(
    `SELECT 'offering' AS source, NULL AS id, o.date, 'income' AS kind, t.name AS category_name,
            '헌금 집계 (' || COUNT(*) || '건)' AS description, SUM(o.amount) AS amount, NULL AS method, NULL AS memo, NULL AS category_id
       FROM offerings o LEFT JOIN offering_types t ON t.id = o.type_id
      WHERE o.date BETWEEN ? AND ? GROUP BY o.date, o.type_id
     UNION ALL
     SELECT 'manual', x.id, x.date, x.kind, c.name, x.description, x.amount, x.method, x.memo, x.category_id
       FROM transactions x LEFT JOIN categories c ON c.id = x.category_id
      WHERE x.date BETWEEN ? AND ?
     ORDER BY date, source DESC, id`,
    from, to, from, to,
  );
  const income = rows.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0);
  const expense = rows.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0);
  res.json({ from, to, carry, rows, income, expense, balance: carry + income - expense });
});

// 결산 보고서: 연간 월별 계정과목 합계
app.get('/api/reports/summary', need('finance'), (req, res) => {
  const y = String(req.query.year || localDate().slice(0, 4));
  const blank = () => Array(12).fill(0);
  const income = [];
  const expense = [];

  const off = all(
    `SELECT type_id, CAST(substr(date,6,2) AS INTEGER) AS m, SUM(amount) AS v
       FROM offerings WHERE substr(date,1,4) = ? GROUP BY type_id, m`,
    y,
  );
  for (const t of all('SELECT id, name FROM offering_types ORDER BY sort, id')) {
    const months = blank();
    off.filter((o) => o.type_id === t.id).forEach((o) => (months[o.m - 1] += o.v));
    income.push({ group: '헌금', name: t.name, months });
  }

  const cats = all('SELECT id, kind, name FROM categories ORDER BY sort, id');
  const tx = all(
    `SELECT category_id, kind, CAST(substr(date,6,2) AS INTEGER) AS m, SUM(amount) AS v
       FROM transactions WHERE substr(date,1,4) = ? GROUP BY category_id, kind, m`,
    y,
  );
  for (const c of cats) {
    const months = blank();
    tx.filter((x) => x.category_id === c.id && x.kind === c.kind).forEach((x) => (months[x.m - 1] += x.v));
    (c.kind === 'income' ? income : expense).push({ group: c.kind === 'income' ? '기타수입' : '지출', name: c.name, months });
  }
  for (const kind of ['income', 'expense']) {
    const months = blank();
    let any = false;
    tx.filter((x) => x.kind === kind && !cats.some((c) => c.id === x.category_id && c.kind === kind)).forEach((x) => {
      months[x.m - 1] += x.v;
      any = true;
    });
    if (any) (kind === 'income' ? income : expense).push({ group: kind === 'income' ? '기타수입' : '지출', name: '미분류', months });
  }

  const sum = (rows) => rows.reduce((a, r) => a.map((v, i) => v + r.months[i]), blank());
  for (const r of [...income, ...expense]) r.total = r.months.reduce((a, b) => a + b, 0);
  res.json({ year: y, income, expense, incomeMonths: sum(income), expenseMonths: sum(expense) });
});

// 교인별 연간 헌금 (기부금 영수증 자료)
app.get('/api/reports/donations', need('finance'), (req, res) => {
  const y = String(req.query.year || localDate().slice(0, 4));
  const rows = all(
    `SELECT m.id, m.name, m.position, m.district, o.type_id, SUM(o.amount) AS v
       FROM offerings o JOIN members m ON m.id = o.member_id
      WHERE substr(o.date,1,4) = ? GROUP BY m.id, o.type_id ORDER BY m.name, m.id`,
    y,
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.id)) map.set(r.id, { id: r.id, name: r.name, position: r.position, district: r.district, byType: {}, total: 0 });
    const e = map.get(r.id);
    e.byType[r.type_id] = r.v;
    e.total += r.v;
  }
  const anonymous = get('SELECT COALESCE(SUM(amount),0) AS v FROM offerings WHERE member_id IS NULL AND substr(date,1,4) = ?', y).v;
  res.json({ year: y, types: all('SELECT id, name FROM offering_types ORDER BY sort, id'), rows: [...map.values()], anonymous });
});

// 출석
app.get('/api/attendance', need('church'), (req, res) => {
  const { date, service_id } = req.query;
  res.json(
    all(
      `SELECT m.id, m.name, m.position, m.district, m.status, CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS attended
         FROM members m
         LEFT JOIN attendance a ON a.member_id = m.id AND a.date = ? AND a.service_id = ?
        WHERE m.status NOT IN ('전출','별세') OR a.id IS NOT NULL
        ORDER BY m.district, m.name`,
      date, service_id,
    ),
  );
});
app.put('/api/attendance', need('church'), (req, res) => {
  const { date, service_id, member_ids = [] } = req.body || {};
  if (!date || !service_id) throw new Error('날짜와 예배를 선택해 주세요.');
  db.exec('BEGIN');
  try {
    run('DELETE FROM attendance WHERE date = ? AND service_id = ?', date, service_id);
    const st = db.prepare('INSERT INTO attendance (date, service_id, member_id) VALUES (?, ?, ?)');
    for (const id of member_ids) st.run(date, service_id, id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  audit(req, '출석 저장', 'attendance', `${date}/${service_id}`, `${member_ids.length}명`);
  res.json({ ok: true, count: member_ids.length });
});
app.get('/api/attendance-stats', need('church'), (req, res) => {
  res.json(
    all(
      `SELECT a.date, s.name AS service, COUNT(*) AS cnt FROM attendance a JOIN services s ON s.id = a.service_id
        GROUP BY a.date, a.service_id ORDER BY a.date DESC, s.sort LIMIT 40`,
    ),
  );
});

/* ------------------------------------------------------------------ */
/* 일반 CRUD                                                           */
/* area: 'church' = 교역자·사역 담당, 'finance' = 재정 담당              */
/* adminWrite: 조회는 해당 영역, 수정은 관리자만 (분류 항목)              */
/* alsoRead: 다른 영역에서도 조회 가능 (재정 담당이 헌금 입력 시 교인 검색) */
/* ------------------------------------------------------------------ */

const R = {
  members: {
    table: 'members', area: 'church', alsoRead: ['finance'],
    cols: ['name', 'gender', 'birth_date', 'phone', 'email', 'address', 'position', 'district', 'household', 'status', 'registered_date', 'baptism', 'memo'],
    filters: ['status', 'position', 'district'],
    search: ['name', 'phone', 'district', 'household', 'address'],
    order: 'name, id',
  },
  offering_types: { table: 'offering_types', area: 'finance', adminWrite: true, cols: ['name', 'sort'], order: 'sort, id' },
  categories: { table: 'categories', area: 'finance', adminWrite: true, cols: ['kind', 'name', 'sort'], filters: ['kind'], order: 'kind, sort, id' },
  services: { table: 'services', area: 'church', adminWrite: true, cols: ['name', 'sort'], order: 'sort, id' },
  offerings: {
    table: 'offerings', area: 'finance', alias: 'o',
    cols: ['date', 'member_id', 'donor_name', 'type_id', 'amount', 'method', 'memo'],
    select: `SELECT o.*, m.name AS member_name, m.position AS member_position, t.name AS type_name
               FROM offerings o LEFT JOIN members m ON m.id = o.member_id LEFT JOIN offering_types t ON t.id = o.type_id`,
    dateCol: 'date',
    filters: ['type_id', 'member_id', 'method'],
    search: ['m.name', 'o.donor_name', 'o.memo'],
    order: 'o.date DESC, o.id DESC',
  },
  transactions: {
    table: 'transactions', area: 'finance', alias: 'x',
    cols: ['date', 'kind', 'category_id', 'amount', 'description', 'method', 'memo'],
    select: 'SELECT x.*, c.name AS category_name FROM transactions x LEFT JOIN categories c ON c.id = x.category_id',
    dateCol: 'date',
    filters: ['kind', 'category_id'],
    search: ['x.description', 'x.memo'],
    order: 'x.date DESC, x.id DESC',
  },
  small_groups: {
    table: 'small_groups', area: 'finance', alias: 'g',
    cols: ['name', 'leader', 'description'],
    select: `SELECT g.*, COALESCE((SELECT SUM(CASE WHEN kind='income' THEN amount ELSE -amount END)
               FROM group_transactions WHERE group_id = g.id), 0) AS balance FROM small_groups g`,
    order: 'g.name, g.id',
  },
  group_transactions: {
    table: 'group_transactions', area: 'finance',
    cols: ['group_id', 'date', 'kind', 'amount', 'description', 'memo'],
    dateCol: 'date',
    filters: ['group_id'],
    order: 'date, id',
  },
  news: {
    table: 'news', area: 'church',
    cols: ['title', 'category', 'content', 'pinned', 'date'],
    filters: ['category'],
    search: ['title', 'content'],
    order: 'pinned DESC, date DESC, id DESC',
  },
  bulletins: {
    table: 'bulletins', area: 'church',
    cols: ['date', 'title', 'preacher', 'sermon_title', 'scripture', 'worship_order', 'announcements', 'prayer_requests', 'memo'],
    search: ['title', 'sermon_title', 'preacher', 'scripture'],
    order: 'date DESC, id DESC',
  },
  events: {
    table: 'events', area: 'church',
    cols: ['title', 'start_date', 'end_date', 'location', 'description'],
    dateCol: 'start_date',
    search: ['title', 'location', 'description'],
    order: 'start_date DESC, id DESC',
  },
};

const canRead = (user, r) => has(user, r.area) || (r.alsoRead || []).some((a) => has(user, a));
const canWrite = (user, r) => (r.adminWrite ? has(user, 'admin') : has(user, r.area));
const forbid = (res) => res.status(403).json({ error: '이 기능을 사용할 권한이 없습니다.' });

const val = (v) => (v === '' || v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
const colOf = (r, c) => (r.alias ? `${r.alias}.${c}` : c);
const baseSelect = (r) => r.select || `SELECT * FROM ${r.table}`;
const findOne = (r, id) => get(`${baseSelect(r)} WHERE ${colOf(r, 'id')} = ?`, id);
const picked = (r, body) => Object.fromEntries(r.cols.filter((c) => c in (body || {})).map((c) => [c, val(body[c])]));

app.get('/api/:res', (req, res, next) => {
  const r = R[req.params.res];
  if (!r) return next();
  if (!canRead(req.user, r)) return forbid(res);
  const where = [];
  const params = [];
  for (const f of r.filters || []) {
    if (req.query[f] !== undefined && req.query[f] !== '') {
      where.push(`${colOf(r, f)} = ?`);
      params.push(req.query[f]);
    }
  }
  if (r.dateCol && req.query.from) {
    where.push(`${colOf(r, r.dateCol)} >= ?`);
    params.push(req.query.from);
  }
  if (r.dateCol && req.query.to) {
    where.push(`${colOf(r, r.dateCol)} <= ?`);
    params.push(req.query.to);
  }
  if (r.search && req.query.q) {
    where.push('(' + r.search.map((s) => `${s} LIKE ?`).join(' OR ') + ')');
    r.search.forEach(() => params.push(`%${req.query.q}%`));
  }
  const sql = `${baseSelect(r)}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY ${r.order || 'id'}`;
  res.json(all(sql, ...params));
});

app.get('/api/:res/:id', (req, res, next) => {
  const r = R[req.params.res];
  if (!r) return next();
  if (!canRead(req.user, r)) return forbid(res);
  const row = findOne(r, Number(req.params.id));
  if (!row) return res.status(404).json({ error: '데이터를 찾을 수 없습니다.' });
  res.json(row);
});

app.post('/api/:res', (req, res, next) => {
  const r = R[req.params.res];
  if (!r) return next();
  if (!canWrite(req.user, r)) return forbid(res);
  const data = picked(r, req.body);
  const cols = Object.keys(data);
  if (!cols.length) throw new Error('입력된 값이 없습니다.');
  const info = run(`INSERT INTO ${r.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...Object.values(data));
  const id = Number(info.lastInsertRowid);
  audit(req, '등록', r.table, id, data);
  res.status(201).json(findOne(r, id));
});

app.put('/api/:res/:id', (req, res, next) => {
  const r = R[req.params.res];
  if (!r) return next();
  if (!canWrite(req.user, r)) return forbid(res);
  const data = picked(r, req.body);
  const cols = Object.keys(data);
  if (!cols.length) throw new Error('입력된 값이 없습니다.');
  const id = Number(req.params.id);
  run(`UPDATE ${r.table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...Object.values(data), id);
  audit(req, '수정', r.table, id, data);
  res.json(findOne(r, id));
});

app.delete('/api/:res/:id', (req, res, next) => {
  const r = R[req.params.res];
  if (!r) return next();
  if (!canWrite(req.user, r)) return forbid(res);
  const id = Number(req.params.id);
  const before = get(`SELECT * FROM ${r.table} WHERE id = ?`, id);
  run(`DELETE FROM ${r.table} WHERE id = ?`, id);
  if (before) audit(req, '삭제', r.table, id, before); // 삭제된 내용을 기록에 남김
  res.json({ ok: true });
});

app.use('/api', (req, res) => res.status(404).json({ error: '없는 API입니다.' }));

/* 빌드된 화면 제공 (npm run build 후 npm start) */
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

// 오류 메시지를 사용자가 이해할 수 있는 문장으로 바꿔서 돌려줌
app.use((err, req, res, next) => {
  const m = String(err?.message || err);
  let msg = m;
  if (m.includes('FOREIGN KEY')) msg = '다른 데이터에서 사용 중인 항목이라 삭제하거나 변경할 수 없습니다.';
  else if (m.includes('NOT NULL')) msg = '필수 항목을 입력해 주세요.';
  else if (m.includes('CHECK constraint')) msg = '입력값을 확인해 주세요. (금액은 0보다 커야 합니다)';
  else if (m.includes('UNIQUE')) msg = '이미 같은 이름(아이디)이 있습니다.';
  else if (err?.type === 'entity.parse.failed') msg = '잘못된 요청입니다.';
  if (msg === m) console.error('[API 오류]', m);
  res.status(400).json({ error: msg });
});

startAutoBackup();
app.listen(PORT, () => console.log(`교회 관리 시스템 API: http://localhost:${PORT}`));
