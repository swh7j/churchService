// 데이터베이스를 지우고 다음 실행 때 샘플 데이터로 다시 시작합니다.
// 서버가 실행 중이면 먼저 종료한 뒤 실행하세요.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
for (const f of ['church.db', 'church.db-wal', 'church.db-shm']) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) fs.rmSync(p);
}
console.log('데이터를 초기화했습니다. npm run dev 로 다시 실행하세요.');
