// 주보 내용 계산 (권·주, 저장된 값 읽기, 교회 소식 → 주보 소식, 목록용 요약)
import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, dataUrlBytes, deriveSummary, dotDate, newsToAnnouncements, parseLayout, parseTemplate, volWeek } from './layout';

describe('volWeek: 권·주 자동 계산', () => {
  it('2026년 첫 주일(1월 4일)이 1주, 11월 22일은 47주', () => {
    expect(volWeek('2026-01-04', 2000)).toEqual({ vol: 27, week: 1 });
    expect(volWeek('2026-11-22', 2000)).toEqual({ vol: 27, week: 47 });
  });
  it('첫 주일 전 날짜도 1주, 제1권 연도가 없으면 권은 빈칸', () => {
    expect(volWeek('2026-01-01', '')).toEqual({ vol: '', week: 1 });
    expect(volWeek('', 2000)).toEqual({ vol: '', week: '' });
  });
});

describe('저장된 값 읽기', () => {
  it('깨진 JSON 이나 빈 값이면 기본값', () => {
    expect(parseLayout('{깨짐')).toEqual(parseLayout(null));
    expect(parseLayout(null).main.sections).toEqual(DEFAULT_LAYOUT.main.sections);
    expect(parseTemplate('').churchName).toBe(parseTemplate(null).churchName);
  });
  it('저장된 칸만 바꾸고 나머지는 기본값 유지 (안쪽 묶음도)', () => {
    const l = parseLayout(JSON.stringify({ vol: '27', main: { title: '주일 낮 예배' } }));
    expect(l.vol).toBe('27');
    expect(l.main.title).toBe('주일 낮 예배');
    expect(l.main.sections).toEqual(DEFAULT_LAYOUT.main.sections);
    expect(l.pm).toEqual(DEFAULT_LAYOUT.pm);
  });
  it('기본값을 바꿔도 원본(DEFAULT_LAYOUT)은 그대로', () => {
    parseLayout(null).main.sections[0].rows[0].item = '바뀜';
    expect(DEFAULT_LAYOUT.main.sections[0].rows[0].item).not.toBe('바뀜');
  });
  it('dotDate: 2022-09-25 → 2022. 9. 25', () => {
    expect(dotDate('2022-09-25')).toBe('2022. 9. 25');
    expect(dotDate('')).toBe('');
  });
});

describe('newsToAnnouncements: 교회 소식 → 주보 소식', () => {
  const news = [
    { id: 1, title: '지난달 글', date: '2026-10-01', pinned: 0 },
    { id: 2, title: '고정 공지', date: '2026-09-01', pinned: 1 },
    { id: 3, title: '이번 주 글', content: '김장 봉사\n여전도회 신청', date: '2026-11-20', pinned: 0 },
    { id: 4, title: '월요일 글', date: '2026-11-16', pinned: 0 },
    { id: 5, title: '예배 다음 날 글', date: '2026-11-23', pinned: 0 },
  ];
  it('고정 글 먼저, 그다음 예배일 전 7일 글을 날짜 순으로 번호 붙임', () => {
    expect(newsToAnnouncements(news, '2026-11-22')).toBe('1. 고정 공지\n2. 월요일 글\n3. 김장 봉사\n   여전도회 신청');
  });
});

describe('deriveSummary: 목록·성도 화면용 요약', () => {
  it('말씀·성경봉독 줄에서 설교 제목, 설교자, 본문을 뽑음', () => {
    const layout = { main: { sections: [{ title: '', rows: [
      { item: '성경봉독', content: '요한복음 3:16', who: '사회자' },
      { item: '말씀', content: '하나님의 사랑', who: '담임 목사' },
    ] }] } };
    const s = deriveSummary(layout);
    expect(s).toMatchObject({ sermon_title: '하나님의 사랑', preacher: '담임 목사', scripture: '요한복음 3:16' });
    expect(s.worship_order).toContain('말씀 · 하나님의 사랑');
  });
  it('말씀 줄이 없으면 빈칸', () => {
    expect(deriveSummary({ main: { sections: [{ rows: [{ item: '찬송' }] }] } }).sermon_title).toBe('');
  });
});

describe('dataUrlBytes: data 주소를 바이트로 (fetch 없이)', () => {
  it('base64 내용을 그대로 풂', () => {
    const bytes = dataUrlBytes('data:image/jpeg;base64,' + btoa(String.fromCharCode(0xff, 0xd8, 0x00, 0x41)));
    expect([...bytes]).toEqual([0xff, 0xd8, 0x00, 0x41]);
  });
});
