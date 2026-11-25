// 서버가 활동 기록에 남기는 대상 이름이 모두 한국어 이름표를 가졌는지 (새 기능에서 빠뜨리지 않게)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TARGET, actionTone, targetLabel } from './auditLabels';

const JAVA = 'api/src/main/java';
const javaFiles = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? javaFiles(p) : p.endsWith('.java') ? [p] : [];
  });

describe('활동 기록 이름표', () => {
  it('서버 코드의 audit.log(…, "대상", …) 이 모두 TARGET 에 있음', () => {
    const used = new Set();
    for (const f of javaFiles(JAVA))
      for (const m of readFileSync(f, 'utf8').matchAll(/audit\.log\([^;]*?"[^"]+",\s*"([a-z_]+)"/g)) used.add(m[1]);
    // 공통 CRUD 는 표 이름을 그대로 대상으로 씀
    for (const m of readFileSync(join(JAVA, 'com/church/api/crud/Resources.java'), 'utf8').matchAll(/Resource\.of\(\s*"([a-z_]+)"/g)) used.add(m[1]);
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter((t) => !TARGET[t])).toEqual([]);
  });

  it('모르는 대상은 그대로, 작업 이름으로 색', () => {
    expect(targetLabel('sheets')).toBe('악보');
    expect(targetLabel('new_thing')).toBe('new_thing');
    expect(actionTone('악보 삭제')).toBe('red');
    expect(actionTone('예배 PPT 서식 변경')).toBe('amber');
    expect(actionTone('등록')).toBe('green');
    expect(actionTone('로그인')).toBeUndefined();
  });
});
