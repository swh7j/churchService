// 날짜·금액 도우미
import { describe, expect, it } from 'vitest';
import { addDays, groupBy, kdate, monthEnd, monthStart, num, weekday, won } from './utils';

describe('날짜', () => {
  it('addDays: 달·해를 넘어가도 맞게', () => {
    expect(addDays('2026-11-29', 7)).toBe('2026-12-06');
    expect(addDays('2026-12-27', 7)).toBe('2027-01-03');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('monthStart / monthEnd: 윤년 2월 포함', () => {
    expect(monthStart('2026-11-22')).toBe('2026-11-01');
    expect(monthEnd('2026-11-22')).toBe('2026-11-30');
    expect(monthEnd('2028-02-10')).toBe('2028-02-29');
  });
  it('weekday / kdate', () => {
    expect(weekday('2026-11-22')).toBe('일');
    expect(kdate('2026-11-22')).toBe('2026년 11월 22일 (일)');
    expect(kdate('')).toBe('');
  });
});

describe('금액·묶기', () => {
  it('num / won: 세 자리마다 쉼표, 숫자가 아니면 0', () => {
    expect(won(1234567)).toBe('1,234,567원');
    expect(num('abc')).toBe('0');
  });
  it('groupBy', () => {
    expect(groupBy([{ k: 'a', v: 1 }, { k: 'b', v: 2 }, { k: 'a', v: 3 }], (x) => x.k)).toEqual({
      a: [{ k: 'a', v: 1 }, { k: 'a', v: 3 }],
      b: [{ k: 'b', v: 2 }],
    });
  });
});
