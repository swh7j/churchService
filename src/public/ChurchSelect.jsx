// 교회 선택: 주소에 교회가 없을 때 (예전 주소 /admin, /news 등도 여기로 와서 교회를 고른 뒤 이어서 이동)
import { useEffect, useState } from 'react';
import { lastChurch } from '../church';

export default function ChurchSelect() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const params = new URLSearchParams(window.location.search);
  const pick = params.has('pick');
  // 예전 주소로 들어온 경우 교회를 고른 뒤 그 화면으로 (예: /admin/members → /c/코드/admin/members)
  const rest = window.location.pathname === '/' ? '' : window.location.pathname;
  const go = (code, path = rest) => window.location.replace(`/c/${code}${path}`);

  useEffect(() => {
    document.title = '교회 선택';
    fetch('/api/churches')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((l) => {
        // '다른 교회' 를 누른 게 아니면, 지난번 교회나 하나뿐인 교회로 바로 이동
        const last = lastChurch();
        if (!pick && last && l.some((c) => c.code === last)) return go(last);
        if (!pick && l.length === 1) return go(l[0].code);
        setList(l);
      })
      .catch(() => setErr('교회 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = (list || []).filter((c) => !q || c.name.includes(q.trim()));
  const toAdmin = rest.startsWith('/admin');

  return (
    <div className="login-wrap">
      <div className="login-card church-select">
        <div className="brand-mark big">✝</div>
        <h1>교회 선택</h1>
        <p className="muted">{toAdmin ? '관리할 교회를 골라 주세요.' : '우리 교회를 골라 주세요. 다음부터는 바로 들어갑니다.'}</p>
        {err && <p className="login-error">{err}</p>}
        {!list && !err && <p className="muted">불러오는 중…</p>}
        {list && list.length > 5 && <input className="search" placeholder="교회 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />}
        {list && (
          <ul className="church-list">
            {shown.map((c) => (
              <li key={c.code}>
                <button className="church-item" onClick={() => go(c.code)}>
                  <strong>{c.name}</strong>
                  <span className="muted small">{toAdmin ? '관리자 화면' : '성도 화면'} →</span>
                </button>
                {!toAdmin && (
                  <a className="muted small" href={`/c/${c.code}/admin`}>관리자</a>
                )}
              </li>
            ))}
            {!shown.length && <li className="muted">찾는 교회가 없습니다.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
