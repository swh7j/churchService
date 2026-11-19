// 백업 / 복원
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { db, replaceDatabase, ROOT_DIR } from './db.js';

// BACKUP_DIR 환경변수로 다른 폴더(예: 구글 드라이브 동기화 폴더)를 지정할 수 있습니다.
export const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(ROOT_DIR, 'backups');
const NAME_RE = /^church-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(auto|manual|before-restore)\.db$/;
const KEEP_AUTO = 30; // 자동 백업은 최근 30개만 보관

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .map((name) => [name, name.match(NAME_RE)])
    .filter(([, m]) => m)
    .map(([name, m]) => ({
      name,
      kind: m[7],
      created_at: `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`,
      size: fs.statSync(path.join(BACKUP_DIR, name)).size,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function createBackup(kind = 'manual') {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = `church-${stamp()}-${kind}.db`;
  const file = path.join(BACKUP_DIR, name);
  if (fs.existsSync(file)) throw new Error('방금 백업했습니다. 잠시 후 다시 시도해 주세요.');
  // VACUUM INTO: 사용 중에도 일관된 복사본을 만들어 줍니다.
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  if (kind === 'auto') {
    listBackups()
      .filter((b) => b.kind === 'auto')
      .slice(KEEP_AUTO)
      .forEach((b) => fs.rmSync(path.join(BACKUP_DIR, b.name)));
  }
  return listBackups().find((b) => b.name === name);
}

export function backupPath(name) {
  if (!NAME_RE.test(String(name))) throw new Error('잘못된 백업 파일 이름입니다.');
  const p = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(p)) throw new Error('백업 파일을 찾을 수 없습니다.');
  return p;
}

export function deleteBackup(name) {
  fs.rmSync(backupPath(name));
}

export function restoreBackup(name) {
  const src = backupPath(name);
  // 올바른 백업 파일인지 먼저 확인
  let t;
  try {
    t = new DatabaseSync(src, { readOnly: true });
    t.prepare('SELECT COUNT(*) FROM members').get();
    t.prepare('SELECT COUNT(*) FROM offerings').get();
  } catch {
    throw new Error('올바른 백업 파일이 아닙니다.');
  } finally {
    t?.close();
  }
  // 복원 직전 상태도 따로 백업해 두어, 잘못 복원해도 되돌릴 수 있게
  const safety = createBackup('before-restore');
  replaceDatabase(src);
  return safety;
}

// 서버가 켜져 있는 동안 하루 한 번 자동 백업
export function startAutoBackup() {
  const check = () => {
    try {
      const last = listBackups().find((b) => b.kind === 'auto');
      const ageHours = last ? (Date.now() - new Date(last.created_at.replace(' ', 'T')).getTime()) / 3600e3 : Infinity;
      if (ageHours >= 24) console.log('자동 백업 완료:', createBackup('auto').name);
    } catch (e) {
      console.error('자동 백업 실패:', e.message);
    }
  };
  check();
  setInterval(check, 60 * 60 * 1000).unref();
}
