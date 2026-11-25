import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Card, Modal, PageHeader } from '../components';
import { downloadCSV, today } from '../utils';
import { actionTone, targetLabel } from './auditLabels';

const SIZE = 30;

/** 내용이 JSON 이면 보기 좋게 줄 바꿈 */
function pretty(detail) {
  if (!detail) return '';
  try {
    const v = JSON.parse(detail);
    if (v && typeof v === 'object') return JSON.stringify(v, null, 2);
  } catch {
    /* 그냥 글 */
  }
  return detail;
}

/** 1 … 4 5 [6] 7 8 … 20 처럼 현재 페이지 주변만 */
function pageNumbers(page, pages) {
  const out = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(pages, page + 2);
  if (from > 1) out.push(1);
  if (from > 2) out.push('…a');
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pages - 1) out.push('…b');
  if (to < pages) out.push(pages);
  return out;
}

export default function Audit() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pages: 1 });
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api.get('/audit/page', { q, page, size: SIZE })
        .then((d) => alive && setData(d))
        .catch((e) => alert(e.message));
    }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, page]);

  const search = (v) => { setQ(v); setPage(1); };
  const go = (p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const exportCsv = async () => {
    try {
      const rows = await api.get('/audit', { q, limit: 2000 });
      downloadCSV(`활동기록_${today()}.csv`, ['시각', '사용자', '작업', '대상', '번호', '내용'],
        rows.map((r) => [r.at, r.user_name, r.action, targetLabel(r.target), r.target_id, r.detail]));
    } catch (e) {
      alert(e.message);
    }
  };

  const { rows, total, pages } = data;
  const cur = data.page;

  return (
    <>
      <PageHeader title="활동 기록" desc="누가 언제 무엇을 등록·수정·삭제했는지 기록됩니다. 삭제된 내용도 남습니다. 줄을 누르면 내용 전체를 봅니다.">
        <button className="btn" onClick={exportCsv}>엑셀(CSV)</button>
      </PageHeader>
      <Card>
        <div className="toolbar">
          <input className="search" placeholder="사용자, 작업, 내용 검색" value={q} onChange={(e) => search(e.target.value)} />
          <span className="muted small">총 {total.toLocaleString()}건</span>
        </div>
        <div className="table-wrap">
          <table className="audit-table">
            <thead>
              <tr><th>시각</th><th>사용자</th><th>작업</th><th>대상</th><th>내용</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                  <td className="nowrap muted">{r.at}</td>
                  <td className="nowrap">{r.user_name || '-'}</td>
                  <td><Badge tone={actionTone(r.action)}>{r.action}</Badge></td>
                  <td className="nowrap">{targetLabel(r.target)}{r.target_id && <span className="muted small"> #{r.target_id}</span>}</td>
                  <td className="detail"><div className="clamp">{r.detail}</div></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="5" className="empty">기록이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <nav className="pager" aria-label="페이지">
            <button className="btn sm" disabled={cur <= 1} onClick={() => go(cur - 1)}>이전</button>
            {pageNumbers(cur, pages).map((p) =>
              typeof p === 'number'
                ? <button key={p} className={'btn sm' + (p === cur ? ' primary' : '')} aria-current={p === cur ? 'page' : undefined} onClick={() => go(p)}>{p}</button>
                : <span key={p} className="muted">…</span>)}
            <button className="btn sm" disabled={cur >= pages} onClick={() => go(cur + 1)}>다음</button>
          </nav>
        )}
      </Card>

      {open && (
        <Modal title="활동 기록 자세히" onClose={() => setOpen(null)}>
          <dl className="audit-detail">
            <dt>시각</dt><dd>{open.at}</dd>
            <dt>사용자</dt><dd>{open.user_name || '-'}</dd>
            <dt>작업</dt><dd><Badge tone={actionTone(open.action)}>{open.action}</Badge></dd>
            <dt>대상</dt><dd>{targetLabel(open.target)}{open.target_id && ` #${open.target_id}`}</dd>
          </dl>
          <pre className="audit-pre">{pretty(open.detail) || '(내용 없음)'}</pre>
        </Modal>
      )}
    </>
  );
}
