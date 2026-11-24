// 성도 화면: 요청·제보 게시판 (악보 요청, 오류 제보 등). 로그인 없이 작성, 도배 방지로 10분에 20개까지
// 관리자(교회·전체)가 처리 상태와 답변을 달면 여기에 보임. 비밀글은 작성자가 비밀번호로 볼 수 있음
import { useEffect, useState } from 'react';
import { api } from '../api';
import './prayer.css';

export const CATEGORIES = ['악보 요청', '오류 제보', '기타 문의'];
export const STATUS_TONE = { 접수: '', '처리 중': 'blue', 완료: 'green' };

const when = (s) => {
  if (!s) return '';
  const [d, t] = s.split(' ');
  const [, m, day] = d.split('-').map(Number);
  return `${m}월 ${day}일 ${t ? t.slice(0, 5) : ''}`;
};

function RequestForm({ quota, onDone }) {
  const empty = { category: '악보 요청', title: '', content: '', nickname: '', password: '', secret: false };
  const [v, setV] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const full = quota && quota.left <= 0;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/public/requests', v);
      setV(empty);
      onDone();
    } catch (err) {
      alert(err.message);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const hint = {
    '악보 요청': '예) 찬송가 301장 악보가 없어요 / 경배와 찬양 "주님 마음 내게 주소서" 추가해 주세요',
    '오류 제보': '어느 화면에서 무엇을 눌렀을 때 어떻게 되었는지 적어 주세요. (휴대폰 종류도 적어 주시면 좋아요)',
    '기타 문의': '궁금한 점이나 바라는 점을 적어 주세요.',
  }[v.category];

  return (
    <form className="pr-form rq-form" onSubmit={submit}>
      <div className="pub-chips" role="radiogroup" aria-label="종류">
        {CATEGORIES.map((c) => (
          <button type="button" key={c} className={v.category === c ? 'on' : ''} aria-pressed={v.category === c} onClick={() => setV((x) => ({ ...x, category: c }))}>
            {c}
          </button>
        ))}
      </div>
      <input value={v.title} onChange={set('title')} maxLength={100} required placeholder="제목" aria-label="제목" />
      <textarea rows={4} maxLength={2000} required value={v.content} onChange={set('content')} placeholder={hint} aria-label="내용" />
      <div className="pr-form-row">
        <input value={v.nickname} onChange={set('nickname')} maxLength={20} placeholder="이름 (비우면 익명)" aria-label="이름 또는 별명" />
        <input type="password" value={v.password} onChange={set('password')} minLength={4} maxLength={30} required placeholder="비밀번호 4자+" aria-label="비밀번호" autoComplete="new-password" />
        <button className="pub-btn small" disabled={busy || full}>올리기</button>
      </div>
      <label className="pr-secret">
        <input type="checkbox" checked={v.secret} onChange={(e) => setV((x) => ({ ...x, secret: e.target.checked }))} />
        🔒 비밀로 올리기 <span>(관리자와 나만 볼 수 있습니다)</span>
      </label>
      <p className="pr-help">
        {full && `짧은 시간에 너무 많이 올렸습니다. 잠시 후 다시 올려 주세요. (${quota.minutes}분에 ${quota.limit}개까지) `}
        비밀번호는 글을 지우거나 비밀글의 답변을 볼 때 필요합니다.
      </p>
    </form>
  );
}

function Answer({ r }) {
  if (!r.answer) return null;
  return (
    <div className="rq-answer">
      <div className="rq-answer-head">
        💬 {r.answered_by || '관리자'} 답변 <span className="pub-date">{when(r.answered_at)}</span>
      </div>
      <p className="pr-content">{r.answer}</p>
    </div>
  );
}

function RequestItem({ r: row, onChanged }) {
  const [mode, setMode] = useState(''); // '' | 'view' | 'delete'
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(null); // 비밀번호로 연 비밀글
  const r = opened || row;
  const hidden = !!row.is_secret && !opened;

  const go = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'view') setOpened(await api.post(`/public/requests/${row.id}/view`, { password: pw }));
      else {
        await api.post(`/public/requests/${row.id}/delete`, { password: pw });
        onChanged();
      }
      setMode('');
      setPw('');
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="pr-item">
      <div className="pr-meta">
        <span>
          <span className="tag">{r.category}</span>
          <span className={'tag ' + (STATUS_TONE[r.status] || '')}>{r.status}</span>
          <strong>{hidden ? '🔒 비밀 요청' : r.title}</strong>
        </span>
        <span className="pub-date">{when(r.created_at)}</span>
      </div>
      {hidden ? (
        <p className="pr-content pr-muted">관리자와 작성자만 볼 수 있는 글입니다.{row.answered_at ? ' 답변이 달렸습니다.' : ''}</p>
      ) : (
        <>
          <p className="pr-content">{r.content}</p>
          <div className="pub-date">— {r.nickname || '익명'}{r.is_secret ? ' · 🔒 비밀글' : ''}</div>
          <Answer r={r} />
        </>
      )}
      {mode ? (
        <form className="pr-del" onSubmit={go}>
          <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="작성할 때 정한 비밀번호" aria-label="비밀번호" autoComplete="off" />
          <button className={'pr-link' + (mode === 'delete' ? ' danger' : '')} disabled={busy || !pw}>{mode === 'view' ? '보기' : '삭제'}</button>
          <button type="button" className="pr-link" onClick={() => { setMode(''); setPw(''); }}>취소</button>
        </form>
      ) : (
        <div className="rq-actions">
          {hidden && <button className="pr-link" onClick={() => setMode('view')}>내 글 보기</button>}
          <button className="pr-link" onClick={() => setMode('delete')}>삭제</button>
        </div>
      )}
    </li>
  );
}

export default function RequestBoard() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const [quota, setQuota] = useState(null);
  const [cat, setCat] = useState('');
  const load = () => {
    api.get('/public/requests/quota').then(setQuota).catch(() => {});
    return api
      .get('/public/requests')
      .then((r) => {
        setRows(r);
        setError(false);
      })
      .catch(() => setError(true));
  };
  useEffect(() => {
    load();
  }, []);
  const shown = rows && cat ? rows.filter((r) => r.category === cat) : rows;

  return (
    <>
      <section className="pub-card">
        <h2 className="pub-title">요청·제보하기</h2>
        <p className="pr-help" style={{ marginTop: 0, marginBottom: 10 }}>필요한 악보, 화면 오류, 바라는 점을 남겨 주세요. 관리자가 확인하고 답변을 달아 드립니다.</p>
        <RequestForm quota={quota} onDone={load} />
      </section>
      <section className="pub-card">
        <h2 className="pub-title">올라온 요청</h2>
        <div className="pub-chips">
          <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>전체</button>
          {CATEGORIES.map((c) => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        {!shown ? (
          <p className="pub-empty">{error ? '불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' : '불러오는 중…'}</p>
        ) : shown.length ? (
          <ul className="pr-list">
            {shown.map((r) => (
              <RequestItem key={r.id} r={r} onChanged={load} />
            ))}
          </ul>
        ) : (
          <p className="pub-empty">아직 올라온 요청이 없습니다.</p>
        )}
      </section>
    </>
  );
}
