// 처음 실행할 때 들어가는 기본 항목과 샘플 데이터 (모두 가짜 데이터입니다)
const ymd = (d) => d.toLocaleDateString('sv-SE');

function recentSundays(n) {
  const out = [];
  const t = new Date();
  t.setDate(t.getDate() - t.getDay());
  for (let i = 0; i < n; i++) {
    out.push(ymd(t));
    t.setDate(t.getDate() - 7);
  }
  return out;
}

export function seed(db) {
  const ins = (table, obj) => {
    const keys = Object.keys(obj);
    const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
    return Number(db.prepare(sql).run(...keys.map((k) => obj[k] ?? null)).lastInsertRowid);
  };
  let s = 42;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const sundays = recentSundays(10);

  db.exec('BEGIN');
  try {
    ins('settings', { key: 'church_name', value: '샘플교회' });

    // 기본 분류 항목
    const typeIds = {};
    ['십일조', '주일헌금', '감사헌금', '건축헌금', '선교헌금', '절기헌금'].forEach((name, i) => {
      typeIds[name] = ins('offering_types', { name, sort: i + 1 });
    });
    const cat = {};
    ['전기이월금', '이자수입', '기타수입'].forEach((name, i) => (cat[name] = ins('categories', { kind: 'income', name, sort: i + 1 })));
    ['사례비', '관리비', '교육비', '선교비', '구제비', '행사비', '비품비', '기타지출'].forEach(
      (name, i) => (cat[name] = ins('categories', { kind: 'expense', name, sort: i + 1 })),
    );
    const svc = ['주일 1부 예배', '주일 2부 예배', '수요 예배', '금요 기도회'].map((name, i) =>
      ins('services', { name, sort: i + 1 }),
    );

    // 샘플 교인
    const people = [
      ['김민수', '남', '1968-03-12', '장로', '1구역', '김민수'],
      ['이영희', '여', '1971-' + mm + '-05', '권사', '1구역', '김민수'],
      ['박준호', '남', '1979-07-21', '안수집사', '2구역', '박준호'],
      ['최서연', '여', '1982-' + mm + '-27', '집사', '2구역', '박준호'],
      ['정우진', '남', '1985-01-30', '집사', '3구역', '정우진'],
      ['강지은', '여', '1988-09-14', '집사', '3구역', '정우진'],
      ['조현우', '남', '1975-05-08', '집사', '1구역', '조현우'],
      ['윤미경', '여', '1959-11-19', '권사', '2구역', '윤미경'],
      ['장성호', '남', '1990-04-02', '성도', '3구역', '장성호'],
      ['임하늘', '여', '1998-' + mm + '-11', '청년', '청년부', '임하늘'],
      ['한도윤', '남', '2000-08-25', '청년', '청년부', '한도윤'],
      ['오수빈', '여', '2001-02-17', '청년', '청년부', '오수빈'],
      ['서재원', '남', '1965-12-01', '목사', '교역자', '서재원'],
      ['신예린', '여', '1994-06-09', '성도', '3구역', '신예린'],
    ];
    const memberIds = people.map(([name, gender, birth, position, district, household], i) =>
      ins('members', {
        name,
        gender,
        birth_date: birth,
        phone: `010-0000-${String(1001 + i)}`,
        position,
        district,
        household,
        status: i === 13 ? '새가족' : '재적',
        registered_date: i === 13 ? ymd(now) : `20${String(5 + (i % 15)).padStart(2, '0')}-03-01`,
        baptism: i < 9 ? '세례' : '',
        address: '샘플시 샘플구 샘플로 ' + (10 + i),
      }),
    );
    const givers = memberIds.slice(0, 13);

    // 지난 10주 헌금
    for (const date of sundays) {
      for (const mid of givers) {
        if (rnd() < 0.55) ins('offerings', { date, member_id: mid, type_id: typeIds['주일헌금'], amount: pick([5000, 10000, 10000, 20000]), method: '현금' });
        if (rnd() < 0.3) ins('offerings', { date, member_id: mid, type_id: typeIds['십일조'], amount: pick([150000, 200000, 300000, 450000]), method: pick(['현금', '계좌이체']) });
        if (rnd() < 0.08) ins('offerings', { date, member_id: mid, type_id: typeIds['감사헌금'], amount: pick([30000, 50000, 100000]), method: '현금', memo: '감사' });
        if (rnd() < 0.05) ins('offerings', { date, member_id: mid, type_id: typeIds['선교헌금'], amount: pick([20000, 50000]), method: '계좌이체' });
      }
      ins('offerings', { date, donor_name: '무기명', type_id: typeIds['주일헌금'], amount: pick([23000, 41000, 37000]), method: '현금' });
    }

    // 장부 시작 잔액 + 지난 3개월 지출/기타수입
    ins('transactions', {
      date: ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)),
      kind: 'income',
      category_id: cat['전기이월금'],
      amount: 18500000,
      description: '장부 시작 잔액 (이전 장부에서 이월)',
      method: '계좌이체',
    });
    for (let k = 2; k >= 0; k--) {
      const base = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const day = (d) => ymd(new Date(base.getFullYear(), base.getMonth(), d));
      if (k > 0 || now.getDate() >= 10) ins('transactions', { date: day(10), kind: 'expense', category_id: cat['사례비'], amount: 3200000, description: '담임목사 사례비', method: '계좌이체' });
      if (k > 0 || now.getDate() >= 15) ins('transactions', { date: day(15), kind: 'expense', category_id: cat['관리비'], amount: 480000 + k * 30000, description: '전기·수도·가스 요금', method: '계좌이체' });
      if (k > 0 || now.getDate() >= 5) ins('transactions', { date: day(5), kind: 'expense', category_id: cat['교육비'], amount: 150000, description: '교회학교 교재 구입', method: '카드' });
      if (k > 0 || now.getDate() >= 12) ins('transactions', { date: day(12), kind: 'expense', category_id: cat['선교비'], amount: 300000, description: '협력 선교사 후원', method: '계좌이체' });
      if (k > 0) ins('transactions', { date: day(25), kind: 'income', category_id: cat['이자수입'], amount: 12000 + k * 500, description: '예금 이자', method: '계좌이체' });
    }
    ins('transactions', { date: sundays[1], kind: 'expense', category_id: cat['구제비'], amount: 200000, description: '이웃돕기 쌀 구입', method: '현금' });

    // 소모임 회계
    const youth = ins('small_groups', { name: '청년부', leader: '임하늘', description: '청년부 회비 및 모임 경비' });
    const women = ins('small_groups', { name: '여전도회', leader: '윤미경', description: '여전도회 회비, 바자회 수익' });
    ins('group_transactions', { group_id: youth, date: sundays[6], kind: 'income', amount: 150000, description: '월 회비 (10명)' });
    ins('group_transactions', { group_id: youth, date: sundays[4], kind: 'expense', amount: 68000, description: '모임 간식' });
    ins('group_transactions', { group_id: youth, date: sundays[2], kind: 'income', amount: 150000, description: '월 회비 (10명)' });
    ins('group_transactions', { group_id: youth, date: sundays[1], kind: 'expense', amount: 120000, description: '수련회 장소 예약금' });
    ins('group_transactions', { group_id: women, date: sundays[7], kind: 'income', amount: 520000, description: '바자회 수익' });
    ins('group_transactions', { group_id: women, date: sundays[3], kind: 'expense', amount: 200000, description: '양로원 방문 선물' });

    // 교회 소식
    ins('news', { title: '추수감사절 예배 안내', category: '공지', pinned: 1, date: sundays[0], content: '추수감사절 연합예배를 드립니다.\n감사헌금 봉투는 안내석에 있습니다.' });
    ins('news', { title: '새가족 환영', category: '소식', date: sundays[0], content: '신예린 성도님이 새가족으로 등록하셨습니다. 따뜻하게 맞아주세요.' });
    ins('news', { title: '중보기도 제목', category: '기도제목', date: sundays[1], content: '병상에 계신 성도님들의 회복을 위해 기도해 주세요.' });

    // 행사
    const later = (d) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + d));
    ins('events', { title: '청년부 겨울 수련회', start_date: later(30), end_date: later(32), location: '샘플 수양관', description: '2박 3일 일정' });
    ins('events', { title: '성탄 축하 발표회', start_date: `${now.getFullYear()}-12-24`, location: '본당', description: '교회학교 발표회' });
    ins('events', { title: '제직회', start_date: later(10), location: '소예배실', description: '연말 결산 및 내년 예산 논의' });

    // 주보
    ins('bulletins', {
      date: sundays[0],
      title: '주일 예배',
      preacher: '서재원 목사',
      sermon_title: '감사의 사람',
      scripture: '데살로니가전서 5:16-18',
      worship_order:
        '예배로 부름 ......... 인도자\n찬송 ................. 다같이\n대표기도 ............. 김민수 장로\n성경봉독 ............. 인도자\n찬양 ................. 성가대\n설교 ................. 서재원 목사\n헌금 ................. 다같이\n광고 ................. 인도자\n축도 ................. 서재원 목사',
      announcements: '1. 추수감사절 연합예배가 있습니다.\n2. 새가족 신예린 성도님을 환영합니다.\n3. 다음 주 제직회가 있습니다.',
      prayer_requests: '병상에 계신 성도님들의 회복\n다음 세대를 위하여',
    });

    // 출석 (최근 6주, 주일 1·2부)
    for (const date of sundays.slice(0, 6)) {
      for (const mid of memberIds) {
        if (rnd() < 0.75) ins('attendance', { date, service_id: rnd() < 0.4 ? svc[0] : svc[1], member_id: mid });
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
