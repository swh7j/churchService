// 4면 주보(A4 가로 2장, 반으로 접는 주보)의 데이터 구조와 기본값
import { addDays } from '../../utils';

// 매주 바뀌지 않는 교회 기본 정보 (주보 기본 정보 화면에서 수정, settings.bulletin_template 에 저장)
export const DEFAULT_TEMPLATE = {
  denomination: '대한예수교장로회',
  churchName: '',
  motto: '',
  coverPhoto: '',
  volBaseYear: '', // 제1권이 나온 해 (예: 1995 → 2022년은 제28권)
  visions: ['', '', ''],
  mission: '',
  pastor: '',
  staffLine: '',
  address: '',
  contact: '',
  homepage: '',
  welcome:
    '오늘 본 교회에 처음으로 나오신 분(초신자, 이사, 방문)을 진심으로 환영합니다. 주님의 사랑안에서 교제의 나눔이 있기를 바라며, 한 식구가 되실 분은 등록카드를 적어 안내위원에게 내주시면 됩니다.',
  serviceTimes: [
    { name: '주일낮예배', time: '오전 11:00' },
    { name: '오후찬양예배', time: '오후 2:15' },
    { name: '수요예배', time: '오후 7:30' },
    { name: '새벽기도회', time: '오전 5:30' },
    { name: '금요심야기도회', time: '금요오후 9:00' },
    { name: '유·초등부', time: '주일오전 11:00' },
  ],
  verseLeft: '하나님은 영이시니 예배하는 자가 신령과 진정으로 예배할지니라 (요 4:24)',
  verseRight: '할렐루야! 우리 하나님께 찬양함이 선함이여 찬송함이 아름답고 마땅하도다 (시 147:1)',
  dawn: { title: '새벽기도회', time: '매일 새벽 5:30', leader: '' },
  night: { title: '심야 기도회', time: '금요일 밤 9:00', leader: '' },
  prayerVerse: '',
  prayerItems: ['교회 : 전도와 재정자립, 각 기관활성화를 위하여', '성도가정 : 가족전도와 직장, 사업장을 위하여', '담임목사 : 가정과 사역을 위하여'],
  dutyVerse: '선한 청지기같이 서로 봉사하라 (벧전 4:10)',
  worshipNotes: ['예배시간전 미리 오셔서 기도와 찬송으로 준비하시기 바랍니다.', '헌금은 들어오실때 헌금함에 넣어주십시오.'],
  boxTitle: '',
  boxItems: [],
};

const row = (item, content = '', who = '', stand = false) => ({ item, content, who, stand });

// 매주 바뀌는 내용 (bulletins.layout 에 JSON 으로 저장)
export const DEFAULT_LAYOUT = {
  vol: '', // 비워 두면 예배일로 자동 계산
  week: '',
  main: {
    time: '오전 11:00',
    leader: '',
    sections: [
      {
        title: '영광과 감사',
        rows: [
          row('묵도', '', '다함께', true),
          row('예배의기원', '', '사회자', true),
          row('영광송', '', '다함께', true),
          row('성시교독', '', '다함께', true),
          row('신앙고백', '사도신경', '다함께', true),
          row('찬송', '', '다함께'),
          row('기도', '', ''),
          row('특송', '', ''),
          row('교회소식', '', '사회자'),
          row('찬송', '', '다함께'),
          row('봉헌기도', '', '담임목사'),
        ],
      },
      { title: '말씀과 교제', rows: [row('성경봉독', '', '사회자'), row('사명선언문', '', '다함께'), row('말씀강론', '', '담임목사')] },
      { title: '헌신의 결단과 파송', rows: [row('폐회송', '', '다함께', true), row('축도', '', '담임목사', true)] },
    ],
  },
  pm: { title: '오후찬양예배', time: '오후 2:15', leader: '', rows: ['묵상기도', '찬송', '기도', '성경봉독', '설교', '광고', '축도'].map((i) => ({ item: i, content: '' })) },
  wed: { title: '수요예배', time: '저녁 7:30', leader: '', rows: ['묵상기도', '찬송', '성경봉독', '설교', '통성기도', '주기도문'].map((i) => ({ item: i, content: '' })) },
  duty: { month: '', guide: '', offering: '', prayDay: '', prayPm: '' },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

/** 저장된 JSON 을 읽어 빠진 칸은 기본값으로 채움 */
export function parseTemplate(s) {
  let t = {};
  try {
    t = s ? JSON.parse(s) : {};
  } catch {
    t = {};
  }
  return { ...clone(DEFAULT_TEMPLATE), ...t };
}

export function parseLayout(s) {
  let l = {};
  try {
    l = s ? (typeof s === 'string' ? JSON.parse(s) : s) : {};
  } catch {
    l = {};
  }
  const d = clone(DEFAULT_LAYOUT);
  return { ...d, ...l, main: { ...d.main, ...l.main }, pm: { ...d.pm, ...l.pm }, wed: { ...d.wed, ...l.wed }, duty: { ...d.duty, ...l.duty } };
}

/** 권·주 자동 계산: 권 = 올해 - 제1권 연도 + 1, 주 = 올해 첫 주일부터 몇 번째 주일인지 */
export function volWeek(date, baseYear) {
  if (!date) return { vol: '', week: '' };
  const d = new Date(date + 'T00:00:00');
  const y = d.getFullYear();
  const jan1 = new Date(y, 0, 1);
  const firstSunday = new Date(y, 0, 1 + ((7 - jan1.getDay()) % 7));
  const week = Math.max(1, Math.floor((d - firstSunday) / 86400000 / 7) + 1);
  const base = Number(baseYear);
  return { vol: base ? y - base + 1 : '', week };
}

/** 주보 날짜 표기: 2022. 9. 25 */
export const dotDate = (s) => (s ? s.split('-').map(Number).join('. ') : '');

/**
 * 교회 소식 메뉴의 글 → 주보 소식 문단.
 * 상단 고정 글 + 예배일 전 7일(월~주일) 사이에 올린 글을 번호 붙여 정리
 */
export function newsToAnnouncements(news, date) {
  const from = addDays(date, -6);
  const picked = news
    .filter((n) => Number(n.pinned) || (n.date >= from && n.date <= date))
    // 고정 글 먼저, 그다음 올린 날짜 순
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(a.date).localeCompare(String(b.date)) || a.id - b.id);
  const seen = new Set();
  return picked
    .filter((n) => !seen.has(n.id) && seen.add(n.id))
    .map((n, i) => `${i + 1}. ${(n.content || n.title || '').trim().replace(/\n+/g, '\n   ')}`)
    .join('\n');
}

/** 4면 주보 내용에서 목록·성도 화면용 칸(설교 제목, 본문, 설교자, 예배 순서)을 뽑음 */
export function deriveSummary(layout) {
  const rows = layout.main.sections.flatMap((s) => s.rows);
  const sermon = rows.find((r) => /말씀|설교/.test(r.item));
  const reading = rows.find((r) => /성경봉독|본문/.test(r.item));
  const order = layout.main.sections
    .map((s) => [s.title && `◐ ${s.title} ◑`, ...s.rows.map((r) => `${r.stand ? '¶' : ' '}${r.item}${r.content ? ' · ' + r.content : ''}${r.who ? ' ......... ' + r.who : ''}`)].filter(Boolean).join('\n'))
    .join('\n\n');
  return {
    sermon_title: sermon?.content || '',
    preacher: sermon?.who || '',
    scripture: reading?.content || '',
    worship_order: order,
  };
}

/** 이미지 파일을 긴 변 maxPx 이하 JPEG 로 줄여 data URL 로 */
export function shrinkImage(file, maxPx = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽지 못했습니다.'));
    };
    img.src = url;
  });
}
