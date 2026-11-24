// 요청·제보 게시판 관리: 성도가 올린 악보 요청·오류 제보에 처리 상태와 답변 달기
// 교회 관리자 화면(/requests)과 전체 관리자 화면(/platform/requests, 모든 교회)이 같이 씀
import { useMemo, useState } from 'react';
import { api } from '../api';
import { churchPath } from '../church';
import { Card, confirmDelete, Loading, PageHeader, useList } from '../components';
import { CATEGORIES, STATUS_TONE } from '../public/RequestBoard';

const STATUSES = ['접수', '처리 중', '완료'];

function RequestRow({ r, showChurch, onSave, onDelete }) {
  const [status, setStatus] = useState(r.status);
  const [answer, setAnswer] = useState(r.answer || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const changed = status !== r.status || answer.trim() !== (r.answer || '');

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await onSave(r, { status, answer });
      setMsg('저장했습니다.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rqa-item">
      <div className="rqa-head">
        {showChurch && <span className="tag blue">{r.church_name}</span>}
        <span className="tag">{r.category}</span>
        <span className={'tag ' + (STATUS_TONE[r.status] || '')}>{r.status}</span>
        {!!r.is_secret && <span className="tag red">비밀</span>}
        <strong>{r.title ?? '비밀 요청'}</strong>
        <span className="muted small rqa-when">{r.nickname || '익명'} · {r.created_at?.slice(0, 16)}</span>
      </div>
      <p className="rqa-content">{r.content ?? <span className="muted">관리자 계정에서만 볼 수 있는 비밀 요청입니다.</span>}</p>
      <div className="rqa-edit">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="처리 상태">
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <textarea rows={2} maxLength={2000} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="답변 (성도 화면에 보입니다. 비우면 답변 없음)" aria-label="답변" />
        <div className="row-actions">
          <button className="btn sm primary" onClick={save} disabled={busy || !changed}>{busy ? '저장 중…' : '저장'}</button>
          <button className="btn sm danger" onClick={() => onDelete(r)} disabled={busy}>삭제</button>
        </div>
      </div>
      {r.answered_at && <div className="muted small">{r.answered_by} 답변 · {r.answered_at.slice(0, 16)}</div>}
      {msg && <div className="small">{msg}</div>}
    </li>
  );
}

/** 요청 목록 + 거르기 (상태·종류·교회) */
export function RequestList({ rows, loading, showChurch, onSave, onDelete }) {
  const [status, setStatus] = useState('open'); // open: 완료 아닌 것
  const [cat, setCat] = useState('');
  const [church, setChurch] = useState('');
  const churches = useMemo(() => [...new Map(rows.map((r) => [r.church, r.church_name])).entries()].filter(([c]) => c), [rows]);
  const shown = rows.filter(
    (r) => (status === 'open' ? r.status !== '완료' : !status || r.status === status) && (!cat || r.category === cat) && (!church || r.church === church),
  );
  const open = rows.filter((r) => r.status !== '완료').length;

  return (
    <Card>
      <div className="rqa-filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="처리 상태로 거르기">
          <option value="open">처리 안 끝난 것 ({open})</option>
          <option value="">전체 ({rows.length})</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="종류로 거르기">
          <option value="">모든 종류</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {showChurch && churches.length > 1 && (
          <select value={church} onChange={(e) => setChurch(e.target.value)} aria-label="교회로 거르기">
            <option value="">모든 교회</option>
            {churches.map(([c, n]) => (
              <option key={c} value={c}>{n}</option>
            ))}
          </select>
        )}
      </div>
      {loading && !rows.length ? (
        <Loading />
      ) : shown.length ? (
        <ul className="rqa-list">
          {shown.map((r) => (
            <RequestRow key={`${r.church || ''}-${r.id}-${r.answered_at || ''}-${r.status}`} r={r} showChurch={showChurch} onSave={onSave} onDelete={onDelete} />
          ))}
        </ul>
      ) : (
        <p className="empty">{status === 'open' ? '처리할 요청이 없습니다.' : '요청이 없습니다.'}</p>
      )}
    </Card>
  );
}

/** 교회 관리자 화면 */
export default function Requests() {
  const { rows, reload, loading } = useList('/requests');
  const save = async (r, v) => {
    await api.put(`/requests/${r.id}`, v);
    reload();
  };
  const remove = (r) => confirmDelete(`이 요청을 삭제할까요? 성도 화면에서도 바로 사라집니다.\n\n${r.title ?? '비밀 요청'}`, () => api.del(`/requests/${r.id}`)).then((ok) => ok && reload());
  return (
    <>
      <PageHeader title="요청·제보 게시판" desc="성도 화면에서 올라온 악보 요청·오류 제보입니다. 처리 상태와 답변을 남기면 성도 화면에 보입니다. 전체 관리자도 같은 글을 보고 답변할 수 있습니다.">
        <a className="btn" href={churchPath('/requests')} target="_blank" rel="noreferrer">성도 화면에서 보기 ↗</a>
      </PageHeader>
      <RequestList rows={rows} loading={loading} onSave={save} onDelete={remove} />
      <p className="muted small">찬송가·교독문·경배와 찬양 악보는 공용 보관함이라 전체 관리자만 올릴 수 있습니다. 악보 요청은 전체 관리자에게도 함께 보입니다.</p>
    </>
  );
}
