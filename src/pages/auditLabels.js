// 활동 기록의 "대상" 이름표: 서버가 남기는 영어 이름 → 화면에 보일 한국어
// 서버에 새 대상이 생기면 여기에도 추가 (빠지면 auditLabels.test.js 가 실패해서 알려 줌)
export const TARGET = {
  members: '교인', offerings: '헌금', transactions: '회계 장부', categories: '계정과목', offering_types: '헌금 종류',
  services: '예배 종류', small_groups: '소모임', group_transactions: '소모임 장부', news: '교회 소식', bulletins: '주보',
  events: '행사', attendance: '출석', users: '사용자', backups: '백업', settings: '설정', auth: '로그인',
  prayer_requests: '기도제목', prayers: '기도제목', albums: '앨범', budgets: '예산', sheets: '악보',
  support_requests: '요청·제보', worship_ppt: '예배 PPT', worship_ppt_bg: '예배 PPT 배경',
};

export const targetLabel = (t) => TARGET[t] || t;

// 작업 이름에 이 낱말이 들어 있으면 그 색 (예: "악보 삭제" → 빨강)
const TONES = [[/삭제|복원/, 'red'], [/수정|변경/, 'amber'], [/등록|올리기|저장/, 'green']];
export const actionTone = (a) => TONES.find(([re]) => re.test(a || ''))?.[1];
