// 예배 PPT 자리 표시 채우기: 주보 고정 정보(표어·사명선언문 등)
import { describe, expect, it } from 'vitest';
import { fixedValues, lookup } from './WorshipPpt';

const fixed = {
  motto: '표어 : 앞서 나아가는 2026년 (수 3:6)',
  mission: '우리는 하나님 나라 확장을\n최고의 가치로 여기며',
  visions: ['예배하는 교회', '', '전도하는 교회'],
  pastor: '홍길동',
};

describe('fixedValues: 주보 고정 정보 → 자리 표시 값', () => {
  it("표어는 앞의 '표어 :' 를 빼고, 비전은 빈 줄 없이 한 줄에 하나", () => {
    const v = fixedValues(fixed);
    expect(v.표어).toBe('앞서 나아가는 2026년 (수 3:6)');
    expect(v.올해표어).toBe(v.표어);
    expect(v.사명선언문).toBe('우리는 하나님 나라 확장을\n최고의 가치로 여기며');
    expect(v.비전).toBe('예배하는 교회\n전도하는 교회');
    expect(v.담임목사).toBe('홍길동');
  });
  it('고정 정보가 없으면 빈 값', () => {
    expect(fixedValues(undefined).표어).toBe('');
    expect(fixedValues({}).비전).toBe('');
  });
});

describe('lookup: {표어}·{올해 표어}·{사명선언문} 은 고정 정보에서', () => {
  const b = { date: '2026-11-29' };
  it('띄어쓰기가 달라도 같은 칸', () => {
    expect(lookup('표어', b, [], {}, fixed)).toBe('앞서 나아가는 2026년 (수 3:6)');
    expect(lookup('올해 표어', b, [], {}, fixed)).toBe('앞서 나아가는 2026년 (수 3:6)');
    expect(lookup('사명선언문', b, [], {}, fixed)).toContain('최고의 가치로');
  });
  it('고정 정보가 없으면 빈 칸 (주보 순서에서 찾지 않음)', () => {
    expect(lookup('표어', b, [{ item: '표어', content: '엉뚱한 값' }], {})).toBe('');
  });
});
