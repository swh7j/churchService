// 로그인 / 세션 / 비밀번호 처리
import crypto from 'node:crypto';
import { db } from './db.js';

const COOKIE = 'sid';
const SESSION_HOURS = 12; // 마지막 사용 후 12시간이 지나면 자동 로그아웃
const MAX_FAILS = 5;
const LOCK_MINUTES = 5;

export const ROLES = { admin: '관리자', finance: '재정 담당', staff: '교역자·사역 담당' };
// 역할별로 쓸 수 있는 영역
const ROLE_AREAS = { admin: ['admin', 'finance', 'church'], finance: ['finance'], staff: ['church'] };
export const has = (user, area) => !!ROLE_AREAS[user?.role]?.includes(area);

/* 비밀번호: scrypt + 랜덤 salt */
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, s, h] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const calc = crypto.scryptSync(String(pw), Buffer.from(s, 'hex'), 64);
  const expected = Buffer.from(h, 'hex');
  return expected.length === calc.length && crypto.timingSafeEqual(calc, expected);
}
// 없는 아이디로 로그인해도 같은 시간이 걸리도록 비교용 해시
export const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');
}
export function validateUsername(u) {
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(u || '')) throw new Error('아이디는 영문·숫자·_.- 로 3~30자여야 합니다.');
}

/* 세션: 랜덤 토큰을 쿠키로 주고, DB에는 해시만 저장 */
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const expiry = () => new Date(Date.now() + SESSION_HOURS * 3600e3).toISOString();
const readToken = (req) => {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
};

export function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha(token), userId, expiry());
  db.prepare("UPDATE users SET last_login = datetime('now','localtime') WHERE id = ?").run(userId);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  res.cookie(COOKIE, token, {
    httpOnly: true, // 자바스크립트에서 쿠키를 읽을 수 없게
    sameSite: 'lax',
    secure: req.secure || process.env.COOKIE_SECURE === '1', // HTTPS로 배포하면 켜짐
    path: '/',
  });
}

export function endSession(req, res) {
  const token = readToken(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
  res.clearCookie(COOKIE, { path: '/' });
}

export function currentUser(req) {
  const token = readToken(req);
  if (!token) return null;
  const th = sha(token);
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.name, u.role, u.active, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .get(th);
  const now = new Date().toISOString();
  if (!row || !row.active || row.expires_at < now) {
    if (row) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(th);
    return null;
  }
  // 사용 중이면 만료 시간을 연장 (남은 시간이 절반 이하일 때만 갱신)
  if (new Date(row.expires_at) - Date.now() < (SESSION_HOURS * 3600e3) / 2) {
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(expiry(), th);
  }
  return { id: row.id, username: row.username, name: row.name, role: row.role };
}

export const publicUser = (u) => u && { id: u.id, username: u.username, name: u.name, role: u.role, roleLabel: ROLES[u.role] };

/* 로그인 실패 횟수 제한 (아이디별, 메모리) */
const fails = new Map();
export const loginGuard = {
  lockedMinutes(key) {
    const f = fails.get(key);
    if (!f || !f.until) return 0;
    const left = f.until - Date.now();
    if (left <= 0) {
      fails.delete(key);
      return 0;
    }
    return Math.ceil(left / 60000);
  },
  fail(key) {
    const f = fails.get(key) || { count: 0 };
    f.count += 1;
    if (f.count >= MAX_FAILS) f.until = Date.now() + LOCK_MINUTES * 60000;
    fails.set(key, f);
  },
  success(key) {
    fails.delete(key);
  },
};
