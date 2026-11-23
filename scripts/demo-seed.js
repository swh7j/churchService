// =====================================================================
//  데모 교회 가짜 데이터 채우기 (포트폴리오·면접 시연용)
//
//  사용법: 데모 교회(주소 /c/demo/admin)에 관리자로 로그인한 브라우저에서
//          개발자 도구 콘솔에 이 파일 내용을 붙여 넣고 실행
//  - 교회 코드가 demo 로 시작하지 않거나, 이미 교인이 있으면 아무것도 하지 않고 멈춤 (실제 교회 보호)
//  - 모든 이름·연락처·금액은 만든 값입니다 (실제 인물 아님, 전화번호 010-0000-xxxx)
// =====================================================================
(async () => {
  const CODE = (location.pathname.match(/^\/c\/([a-z][a-z0-9-]{1,29})\//) || [])[1] || '';
  if (!CODE.startsWith('demo')) return '중단: 데모 교회(/c/demo/admin)에서만 실행할 수 있습니다. 지금 교회: ' + (CODE || '없음');

  // ---------- 요청 도우미 ----------
  const call = async (method, url, body) => {
    const res = await fetch('/api' + url, {
      method,
      headers: { 'X-Church': CODE, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${data?.error || ''}`);
    return data;
  };
  const get = (u) => call('GET', u);
  const post = (u, b) => call('POST', u, b);
  const put = (u, b) => call('PUT', u, b);
  const del = (u) => call('DELETE', u);
  /** 여러 요청을 동시에 4개씩 */
  const pool = async (tasks, n = 4) => {
    let i = 0;
    const out = [];
    await Promise.all(Array.from({ length: n }, async () => {
      while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); }
    }));
    return out;
  };

  const me = await get('/auth/me');
  if (me.user?.role !== 'admin') return '중단: 관리자로 로그인해 주세요.';
  const existing = await get('/members');
  if (existing.length) return `중단: 이미 교인이 ${existing.length}명 있습니다. 빈 데모 교회에서만 실행합니다.`;

  // ---------- 늘 같은 결과가 나오는 난수 ----------
  let seed = 20261123;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const round = (v, unit = 10000) => Math.max(unit, Math.round(v / unit) * unit);
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 시간
  const sundays = [];
  for (let d = '2025-01-05'; d <= today; d = addDays(d, 7)) sundays.push(d);
  const log = [];

  // ---------- 1. 주보 기본 정보 ----------
  await put('/bulletin-template', {
    template: JSON.stringify({
      denomination: '대한예수교장로회',
      churchName: '데모교회',
      motto: '말씀으로 세워지고 사랑으로 섬기는 교회',
      volBaseYear: '2001',
      visions: ['예배가 살아있는 교회', '말씀으로 양육하는 교회', '이웃을 섬기는 교회'],
      mission: '우리는 하나님을 예배하고, 말씀으로 제자를 세우며, 지역을 섬기는 공동체입니다.',
      pastor: '담임목사 김은혜',
      staffLine: '전도사 이소망 · 사모 박사랑',
      address: '○○시 ○○구 데모로 123 (시연용 주소)',
      contact: '교회 사무실 000-0000-0000',
      homepage: '',
      prayerVerse: '쉬지 말고 기도하라 (살전 5:17)',
      boxTitle: '이달의 섬김',
      boxItems: ['안내: 1구역', '헌금위원: 2구역'],
    }),
  });
  log.push('주보 기본 정보');

  // ---------- 2. 헌금 종류·계정과목 (예결산서 소계 묶음 포함) ----------
  for (const t of await get('/offering_types')) await del('/offering_types/' + t.id).catch(() => {});
  for (const c of await get('/categories')) await del('/categories/' + c.id).catch(() => {});
  const INCOME = [
    ['전기이월', 'c', null], ['주일헌금', 'o', '기본헌금'], ['십일조', 'o', '기본헌금'], ['감사헌금', 'o', '기본헌금'],
    ['부활절감사', 'o', '절기헌금'], ['맥추감사', 'o', '절기헌금'], ['추수감사', 'o', '절기헌금'], ['성탄감사', 'o', '절기헌금'],
    ['건축헌금', 'o', '목적헌금'], ['선교헌금', 'o', '목적헌금'], ['구제헌금', 'o', '목적헌금'], ['이자수입', 'c', null],
  ];
  const EXPENSE = [
    ['목회자 사례비', '목회비', 2_500_000], ['목회자 연금', '목회비', 300_000], ['전도사 사례비', '목회비', 1_000_000],
    ['전기요금', '관리비', 120_000], ['수도요금', '관리비', 40_000], ['통신요금', '관리비', 60_000], ['난방비', '관리비', 150_000],
    ['교회학교', '교육비', 150_000], ['청년부', '교육비', 100_000],
    ['국내선교', '선교비', 300_000], ['해외선교', '선교비', 300_000],
    ['구제비', null, 200_000], ['행사비', null, 150_000], ['사무비품', null, 80_000], ['예비비', null, 0],
  ];
  const type = {}, cat = {};
  let sort = 1;
  for (const [name, t, grp] of INCOME) {
    if (t === 'o') type[name] = (await post('/offering_types', { name, grp, sort })).id;
    else cat[name] = (await post('/categories', { kind: 'income', name, grp, sort })).id;
    sort++;
  }
  sort = 1;
  for (const [name, grp] of EXPENSE) cat[name] = (await post('/categories', { kind: 'expense', name, grp, sort: sort++ })).id;
  log.push(`헌금 종류 ${Object.keys(type).length}, 계정과목 ${Object.keys(cat).length}`);

  // ---------- 3. 교인 40명 (가짜 이름·번호) ----------
  const SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'];
  const GIVEN_M = ['민준', '도윤', '하준', '시우', '주원', '건우', '현우', '성민', '영수', '상훈', '동현', '정호', '재석', '태양', '은찬'];
  const GIVEN_F = ['서윤', '지안', '하은', '수아', '채원', '서연', '유나', '지우', '영희', '정숙', '미경', '은정', '다은', '예린', '소희'];
  const POS = ['장로', '장로', '권사', '권사', '권사', '권사', '안수집사', '안수집사', '안수집사', ...Array(10).fill('집사'), ...Array(8).fill('성도'), '청년', '청년', '청년', '청년', '학생', '학생', '아동', '성도', '성도'];
  const used = new Set();
  const people = [
    { name: '김은혜', gender: '남', position: '목사', district: '교역자' },
    { name: '이소망', gender: '여', position: '전도사', district: '교역자' },
    { name: '박사랑', gender: '여', position: '사모', district: '교역자' },
  ];
  people.forEach((p) => used.add(p.name));
  while (people.length < 40) {
    const g = rnd() < 0.5 ? '남' : '여';
    const name = pick(SUR) + pick(g === '남' ? GIVEN_M : GIVEN_F);
    if (used.has(name)) continue;
    used.add(name);
    people.push({ name, gender: g, position: POS[(people.length - 3) % POS.length], district: `${1 + (people.length % 4)}구역` });
  }
  const members = await pool(people.map((p, i) => () => {
    const lunar = i % 7 === 3;
    return post('/members', {
      ...p,
      phone: `010-0000-${String(1000 + i * 37).slice(-4)}`,
      birth_month: between(1, 12), birth_day: between(1, 28), birth_lunar: lunar ? 1 : 0,
      birthday_public: i % 3 === 0 ? 1 : 0,
      household: i > 3 && i % 3 !== 0 ? people[i - (i % 3)].name : p.name,
      status: i >= 37 ? '새가족' : '재적',
      registered_date: i >= 37 ? addDays(today, -between(10, 60)) : `20${between(10, 24)}-0${between(1, 9)}-1${between(0, 9)}`,
      baptism: p.position === '아동' ? '유아세례' : p.position === '학생' ? '학습' : '세례',
      memo: i % 9 === 0 ? '심방: 가정 예배 (시연용 메모)' : '',
    }).then((r) => ({ ...p, id: r.id }));
  }));
  log.push(`교인 ${members.length}명`);

  // ---------- 4. 출석 (최근 12주, 주일 1부·2부·수요) ----------
  const services = await get('/services');
  const att = [];
  for (const d of sundays.slice(-12)) {
    for (const s of services.slice(0, 3)) {
      const ratio = /수요/.test(s.name) ? 0.35 : /1부/.test(s.name) ? 0.3 : 0.55;
      const ids = members.filter(() => rnd() < ratio).map((m) => m.id);
      const date = /수요/.test(s.name) ? addDays(d, -4) : d;
      att.push(() => put('/attendance', { date, service_id: s.id, member_ids: ids }));
    }
  }
  await pool(att);
  log.push(`출석 ${att.length}회`);

  // ---------- 5. 헌금 (2025년 1월 ~ 오늘) ----------
  const givers = members.filter((m) => !['아동', '학생'].includes(m.position) && m.district !== '교역자');
  // 작은 교회 규모: 1년 수입과 지출이 비슷하게 (잔액이 너무 쌓이지 않게)
  const tithers = givers.filter(() => rnd() < 0.5).map((m) => ({ id: m.id, base: round(between(8, 30) * 10000) }));
  const FEAST = { '04-20': '부활절감사', '04-05': '부활절감사', '07-06': '맥추감사', '07-05': '맥추감사', '11-16': '추수감사', '11-15': '추수감사', '12-21': '성탄감사', '12-20': '성탄감사' };
  const off = [];
  for (const d of sundays) {
    off.push({ date: d, type_id: type['주일헌금'], donor_name: '주일헌금 (무기명 합계)', amount: round(between(28, 52) * 10000, 1000) });
    if (d.slice(8) <= '07') tithers.forEach((t) => off.push({ date: d, type_id: type['십일조'], member_id: t.id, amount: t.base }));
    for (let k = between(0, 3); k > 0; k--) off.push({ date: d, type_id: type['감사헌금'], member_id: pick(givers).id, amount: round(between(1, 10) * 10000) });
    const feast = FEAST[d.slice(5)];
    if (feast) givers.filter(() => rnd() < 0.7).forEach((m) => off.push({ date: d, type_id: type[feast], member_id: m.id, amount: round(between(2, 10) * 10000) }));
    if (d.slice(8) <= '07') {
      off.push({ date: d, type_id: type['선교헌금'], member_id: pick(givers).id, amount: 100000 });
      off.push({ date: d, type_id: type['건축헌금'], member_id: pick(givers).id, amount: round(between(5, 30) * 10000) });
      off.push({ date: d, type_id: type['구제헌금'], donor_name: '구제함', amount: round(between(5, 20) * 10000, 1000) });
    }
  }
  await pool(off.map((o) => () => post('/offerings', { method: '현금', ...o })));
  log.push(`헌금 ${off.length}건`);

  // ---------- 6. 지출·기타 수입 (매달) ----------
  const tx = [{ date: '2025-01-01', kind: 'income', category_id: cat['전기이월'], amount: 8_350_000, description: '2024년 이월금' }];
  const months = [];
  for (let m = new Date(Date.UTC(2025, 0, 1)); iso(m) <= today; m.setUTCMonth(m.getUTCMonth() + 1)) months.push(iso(m).slice(0, 7));
  for (const ym of months) {
    for (const [name, , base] of EXPENSE) {
      if (!base) continue;
      const winter = ['01', '02', '12'].includes(ym.slice(5));
      let amount = base;
      if (name === '난방비') amount = winter ? base * 2 : ym.slice(5) >= '05' && ym.slice(5) <= '09' ? 0 : base;
      if (name === '행사비' && ['04', '07', '11', '12'].includes(ym.slice(5))) amount = base * 4;
      if (['전기요금', '수도요금', '통신요금'].includes(name)) amount = round(base * (0.85 + rnd() * 0.3), 10);
      if (!amount) continue;
      const day = name.includes('사례비') || name.includes('연금') ? '25' : String(between(5, 20)).padStart(2, '0');
      if (`${ym}-${day}` > today) continue;
      tx.push({ date: `${ym}-${day}`, kind: 'expense', category_id: cat[name], amount, description: name });
    }
    if (['03', '06', '09', '12'].includes(ym.slice(5)) && `${ym}-28` <= today) tx.push({ date: `${ym}-28`, kind: 'income', category_id: cat['이자수입'], amount: between(2000, 9000), description: '예금 이자' });
  }
  await pool(tx.map((t) => () => post('/transactions', { method: '계좌이체', ...t })));
  log.push(`장부 ${tx.length}건`);

  // ---------- 7. 예산 (2025·2026·2027, 비고 포함) ----------
  const summary = await get('/reports/summary?year=2025');
  for (const [y, k] of [[2025, 1], [2026, 1.05], [2027, 1.1]]) {
    const items = [...summary.income, ...summary.expense].filter((r) => r.key).map((r) => {
      const base = r.total || 0;
      const memo = r.name === '목회자 사례비' ? `${(Math.round((base * k) / 12 / 10000) * 10000).toLocaleString()}*12` : r.name === '해외선교' ? '선교사 2가정 후원' : '';
      return { item: r.key, amount: Math.round((base * k) / 10000) * 10000, memo };
    });
    items.push({ item: 'c:' + cat['예비비'], amount: Math.round(1_000_000 * k), memo: '' });
    await put('/reports/budgets', { year: y, items });
  }
  log.push('예산 2025~2027');

  // ---------- 8. 소모임 회계 ----------
  for (const [name, leader, rows] of [
    ['청년부', '정하은', [['income', 300000, '회비'], ['expense', 120000, '수련회 간식'], ['income', 150000, '찬양 사역 후원'], ['expense', 90000, '성경공부 교재']]],
    ['여전도회', '최영희', [['income', 500000, '바자회 수익'], ['expense', 200000, '경로잔치 식재료'], ['expense', 80000, '꽃꽂이 재료']]],
  ]) {
    const g = await post('/small_groups', { name, leader, description: `${name} 회계 (시연용)` });
    let d = '2026-03-10';
    for (const [kind, amount, description] of rows) { await post('/group_transactions', { group_id: g.id, date: d, kind, amount, description }); d = addDays(d, 35); }
  }
  log.push('소모임 2개');

  // ---------- 9. 교회 소식 · 행사 ----------
  const next = sundays[sundays.length - 1];
  for (const n of [
    { title: '성탄절 연합 예배 안내', category: '공지', pinned: 1, date: addDays(next, -3), content: '12월 25일 오전 11시 성탄절 연합 예배를 드립니다. 예배 후 다 함께 식사합니다.' },
    { title: '추수감사절 예배를 은혜롭게 마쳤습니다', category: '소식', pinned: 0, date: addDays(next, -7), content: '감사의 열매를 함께 나눈 모든 성도님께 감사드립니다. 교회 앨범에 사진이 올라갔습니다.' },
    { title: '새가족 환영', category: '소식', pinned: 0, date: addDays(next, -7), content: '이번 달 새가족 세 분을 환영합니다. 따뜻하게 맞아 주세요.' },
    { title: '김장 나눔 봉사자 모집', category: '행사', pinned: 0, date: addDays(next, -10), content: '지역 어르신께 김장을 나눕니다. 봉사하실 분은 여전도회에 신청해 주세요.' },
    { title: '중보기도 제목', category: '기도제목', pinned: 0, date: addDays(next, -14), content: '1. 교회학교 교사들을 위해\n2. 투병 중인 성도님들의 회복을 위해\n3. 해외 선교사 가정을 위해' },
    { title: '주차 안내', category: '공지', pinned: 0, date: addDays(next, -21), content: '주일에는 교회 옆 공영주차장을 이용해 주세요.' },
  ]) await post('/news', { ...n, is_public: 1 });
  for (const e of [
    { title: '제직회', start_date: addDays(next, 7), location: '소예배실', description: '연말 결산 및 내년 예산 논의' },
    { title: '청년부 겨울 수련회', start_date: addDays(next, 27), end_date: addDays(next, 29), location: '데모 수양관', description: '2박 3일' },
    { title: '성탄 축하 발표회', start_date: addDays(next, 31), location: '본당', description: '교회학교 발표회' },
    { title: '송구영신 예배', start_date: addDays(next, 38), location: '본당', description: '밤 11시' },
    { title: '추수감사절 예배', start_date: addDays(next, -7), location: '본당', description: '감사 예배 후 애찬' },
  ]) await post('/events', { ...e, is_public: 1 });
  log.push('소식 6, 행사 5');

  // ---------- 10. 4면 주보 (최근 4주) ----------
  const row = (item, content = '', who = '', stand = false) => ({ item, content, who, stand });
  const SERMONS = [
    ['감사의 사람', '데살로니가전서 5:16-18', '301장', '15번'],
    ['낮은 곳으로 오신 예수', '빌립보서 2:5-8', '115장', '22번'],
    ['기다림의 은혜', '이사야 40:31', '370장', '30번'],
    ['빛으로 오신 주님', '요한복음 1:9-14', '122장', '41번'],
  ];
  for (let w = 0; w < 4; w++) {
    const date = addDays(next, (w - 2) * 7);
    const [title, scripture, hymn, reading] = SERMONS[w];
    const L = {
      vol: '', week: '',
      main: {
        time: '오전 11:00', leader: '이소망 전도사',
        sections: [
          { title: '영광과 감사', rows: [row('묵도', '', '다함께', true), row('예배의기원', '', '사회자', true), row('영광송', '1장', '다함께', true), row('성시교독', reading, '다함께', true), row('신앙고백', '사도신경', '다함께', true), row('찬송', hymn, '다함께'), row('기도', '', members[3 + w].name + ' ' + members[3 + w].position), row('교회소식', '', '사회자'), row('찬송', '50장', '다함께'), row('봉헌기도', '', '담임목사')] },
          { title: '말씀과 교제', rows: [row('성경봉독', scripture, '사회자'), row('사명선언문', '', '다함께'), row('말씀강론', title, '김은혜 목사')] },
          { title: '헌신의 결단과 파송', rows: [row('폐회송', '', '다함께', true), row('축도', '', '담임목사', true)] },
        ],
      },
      pm: { title: '오후찬양예배', time: '오후 2:15', leader: '', rows: ['묵상기도', '찬송', '기도', '성경봉독', '설교', '광고', '축도'].map((i) => ({ item: i, content: '' })) },
      wed: { title: '수요예배', time: '저녁 7:30', leader: '', rows: ['묵상기도', '찬송', '성경봉독', '설교', '통성기도', '주기도문'].map((i) => ({ item: i, content: '' })) },
      duty: { month: '', guide: '1구역', offering: '2구역', prayDay: '', prayPm: '' },
    };
    const order = L.main.sections.map((s) => [`◐ ${s.title} ◑`, ...s.rows.map((r) => `${r.stand ? '¶' : ' '}${r.item}${r.content ? ' · ' + r.content : ''}${r.who ? ' ......... ' + r.who : ''}`)].join('\n')).join('\n\n');
    await post('/bulletins', {
      date, title: '주일 낮 예배', preacher: '김은혜 목사', sermon_title: title, scripture, worship_order: order,
      announcements: '1. 성탄절 연합 예배: 12월 25일 오전 11시\n2. 김장 나눔 봉사자를 모집합니다.\n3. 새가족을 환영합니다.',
      offering_names: '• 십일조 : ' + members.slice(5, 11).map((m) => m.name).join(' ') + '\n• 감사 : ' + members.slice(12, 15).map((m) => m.name).join(' '),
      layout: JSON.stringify(L), is_public: 1,
    });
  }
  log.push('주보 4주');

  // ---------- 11. 교회 앨범 (그림으로 만든 사진) ----------
  const fakePhoto = (label, hue, i, w = 1600, h = 1200) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, `hsl(${hue + i * 12}, 70%, 70%)`);
    g.addColorStop(1, `hsl(${hue + 40 + i * 12}, 60%, 35%)`);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 14; k++) { x.fillStyle = `hsla(${hue + k * 20}, 80%, 85%, 0.25)`; x.beginPath(); x.arc(rnd() * w, rnd() * h, 60 + rnd() * 220, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, h - 220, w, 220);
    x.fillStyle = '#fff'; x.font = `bold ${Math.round(h / 12)}px sans-serif`; x.fillText(label, 70, h - 120);
    x.font = `${Math.round(h / 24)}px sans-serif`; x.fillText(`시연용 사진 ${i + 1}`, 74, h - 55);
    const thumb = document.createElement('canvas');
    thumb.width = 480; thumb.height = Math.round((480 * h) / w);
    thumb.getContext('2d').drawImage(c, 0, 0, thumb.width, thumb.height);
    return { image: c.toDataURL('image/jpeg', 0.82), thumb: thumb.toDataURL('image/jpeg', 0.72), width: w, height: h };
  };
  for (const [title, date, hue, n, desc] of [
    ['추수감사절 예배', addDays(next, -7), 25, 6, '감사의 열매를 함께 나누었습니다.'],
    ['여름성경학교', '2026-07-25', 190, 5, '교회학교 아이들과 함께한 2박 3일'],
  ]) {
    const a = await post('/albums', { title, date, description: desc, is_public: 1 });
    for (let i = 0; i < n; i++) await post(`/albums/${a.id}/photos`, fakePhoto(title, hue, i));
  }
  log.push('앨범 2개');

  // ---------- 12. 익명 기도제목 (성도 화면) ----------
  for (const [nickname, content] of [
    ['', '수술을 앞둔 어머니의 회복을 위해 기도 부탁드립니다.'],
    ['청년', '취업 준비 중입니다. 지혜와 인내를 주시도록 기도해 주세요.'],
    ['', '가정의 화목을 위해 기도합니다.'],
  ]) await post('/public/prayers', { nickname, content, password: 'demo-' + between(1000, 9999), secret: false });
  log.push('기도제목 3');

  return '완료 — ' + log.join(', ');
})();
