// 성도 화면: 익명 기도제목 게시판 (로그인 없이 작성, 작성할 때 정한 비밀번호로 삭제)
import { useEffect, useState } from 'react';
import { api } from '../api';
import './prayer.css';

const when = (s) => {
  if (!s) return '';
  const [d, t] = s.split(' ');
  const [, m, day] = d.split('-').map(Number);
  return `${m}월 ${day}일 ${t ? t.slice(0, 5) : ''}`;
};

function PrayerForm({ onDone }) {
  const [v, setV] = useState({ nickname: '', content: '', password: '', secret: false });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/public/prayers', v);
      setV({ nickname: '', content: '', password: '', secret: false });
      onDone();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="pr-form" onSubmit={submit}>
      <textarea rows={4} maxLength={1000} required value={v.content} onChange={set('content')} placeholder="함께 기도하고 싶은 제목을 적어 주세요. 이름 없이 올릴 수 있습니다." aria-label="기도제목" />
      <div className="pr-form-row">
        <input value={v.nickname} onChange={set('nickname')} maxLength={20} placeholder="이름 (비우면 익명)" aria-label="이름 또는 별명" />
        <input type="password" value={v.password} onChange={set('password')} minLength={4} maxLength={30} required placeholder="삭제 비밀번호 4자+" aria-label="삭제용 비밀번호" autoComplete="new-password" />
        <button className="pub-btn small" disabled={busy}>올리기</button>
      </div>
      <label className="pr-secret">
        <input type="checkbox" checked={v.secret} onChange={(e) => setV((x) => ({ ...x, secret: e.target.checked }))} />
        🔒 비밀로 올리기 <span>(관리자만 볼 수 있고, 교회 소식에도 나가지 않습니다)</span>
      </label>
      <p className="pr-help">비밀이 아닌 기도제목은 교회 소식에도 함께 올라갑니다. 비밀번호는 나중에 이 글을 지울 때 필요하며, 잊어버리면 교회 사무실에 말씀해 주세요.</p>
    </form>
  );
}

function PrayerItem({ p, onDeleted }) {
  const [asking, setAsking] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  const remove = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/public/prayers/${p.id}/delete`, { password: pw });
      onDeleted();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="pr-item">
      <div className="pr-meta">
        <strong>{p.is_secret ? '🔒 비밀 기도제목' : p.nickname || '익명'}</strong>
        <span className="pub-date">{when(p.created_at)}</span>
      </div>
      {p.is_secret ? <p className="pr-content pr-muted">관리자만 볼 수 있는 기도제목입니다.</p> : <p className="pr-content">{p.content}</p>}
      {asking ? (
        <form className="pr-del" onSubmit={remove}>
          <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="작성할 때 정한 비밀번호" aria-label="삭제용 비밀번호" autoComplete="off" />
          <button className="pr-link danger" disabled={busy || !pw}>삭제</button>
          <button type="button" className="pr-link" onClick={() => { setAsking(false); setPw(''); }}>취소</button>
        </form>
      ) : (
        <button className="pr-link" onClick={() => setAsking(true)}>삭제</button>
      )}
    </li>
  );
}

export default function PrayerBoard() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const load = () =>
    api
      .get('/public/prayers')
      .then((r) => {
        setRows(r);
        setError(false);
      })
      .catch(() => setError(true));
  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <section className="pub-card">
        <h2 className="pub-title">기도제목 나누기</h2>
        <PrayerForm onDone={load} />
      </section>
      <section className="pub-card">
        <h2 className="pub-title">함께 기도해 주세요</h2>
        {!rows ? (
          <p className="pub-empty">{error ? '불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' : '불러오는 중…'}</p>
        ) : rows.length ? (
          <ul className="pr-list">
            {rows.map((p) => (
              <PrayerItem key={p.id} p={p} onDeleted={load} />
            ))}
          </ul>
        ) : (
          <p className="pub-empty">아직 올라온 기도제목이 없습니다.</p>
        )}
      </section>
    </>
  );
}
