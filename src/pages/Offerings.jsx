import { useEffect, useMemo, useRef, useState } from 'react';
import { api, saveRow } from '../api';
import { Card, confirmDelete, Form, Modal, PageHeader, useList } from '../components';
import { downloadCSV, lastSunday, monthEnd, monthStart, num, won } from '../utils';

export const METHODS = ['현금', '계좌이체', '카드', '기타'];
const memberLabel = (m) => `${m.name}${m.position ? ' ' + m.position : ''}${m.district ? ' · ' + m.district : ''} #${m.id}`;

// 헌금 입금: 연속으로 빠르게 입력하는 폼
function QuickEntry({ members, types, onSaved }) {
  const [f, setF] = useState({ date: lastSunday(), who: '', type_id: '', amount: '', method: '현금', memo: '' });
  const [recent, setRecent] = useState([]);
  const whoRef = useRef(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (!f.type_id && types.length) setF((s) => ({ ...s, type_id: String(types[0].id) }));
  }, [types, f.type_id]);

  const match = useMemo(() => {
    const id = f.who.match(/#(\d+)$/)?.[1];
    if (id) return members.find((m) => m.id === Number(id)) || null;
    const same = members.filter((m) => m.name === f.who.trim());
    return same.length === 1 ? same[0] : null;
  }, [f.who, members]);
  const duplicateName = !match && members.filter((m) => m.name === f.who.trim()).length > 1;

  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(f.amount) > 0)) return alert('금액을 입력해 주세요.');
    if (duplicateName) return alert('같은 이름의 교인이 여러 명입니다. 목록에서 선택해 주세요.');
    try {
      const row = await api.post('/offerings', {
        date: f.date,
        member_id: match?.id ?? null,
        donor_name: match ? null : f.who.trim() || '무기명',
        type_id: Number(f.type_id),
        amount: Number(f.amount),
        method: f.method,
        memo: f.memo,
      });
      setRecent((r) => [row, ...r].slice(0, 5));
      setF((s) => ({ ...s, who: '', amount: '', memo: '' }));
      whoRef.current?.focus();
      onSaved();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <Card title="헌금 입금" className="quick">
      <form className="quick-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="q_date">헌금일</label>
          <input id="q_date" type="date" value={f.date} onChange={set('date')} required />
        </div>
        <div className="field grow">
          <label htmlFor="q_who">헌금자</label>
          <input id="q_who" ref={whoRef} list="member-list" placeholder="이름 입력 (비우면 무기명)" value={f.who} onChange={set('who')} autoComplete="off" />
          <datalist id="member-list">
            {members.map((m) => <option key={m.id} value={memberLabel(m)} />)}
          </datalist>
          <small className={match ? 'ok' : 'muted'}>
            {match
              ? `✓ 교인: ${match.name} ${match.position || ''}`
              : duplicateName
                ? '같은 이름이 여러 명입니다. 목록에서 골라 주세요.'
                : f.who.trim()
                  ? '교인 명부에 없는 이름 → 비교인으로 저장됩니다.'
                  : '무기명으로 저장됩니다.'}
          </small>
        </div>
        <div className="field">
          <label htmlFor="q_type">헌금 종류</label>
          <select id="q_type" value={f.type_id} onChange={set('type_id')} required>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="q_amount">금액 (원)</label>
          <input id="q_amount" type="number" min="1" step="1" inputMode="numeric" value={f.amount} onChange={set('amount')} required />
          <div className="quick-amounts">
            {[10000, 30000, 50000, 100000].map((a) => (
              <button type="button" key={a} className="btn xs" onClick={() => setF((s) => ({ ...s, amount: String((Number(s.amount) || 0) + a) }))}>
                +{a / 10000}만
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="q_method">방법</label>
          <select id="q_method" value={f.method} onChange={set('method')}>
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="field grow">
          <label htmlFor="q_memo">메모</label>
          <input id="q_memo" value={f.memo} onChange={set('memo')} placeholder="선택 사항" />
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <button className="btn primary">입금 등록</button>
        </div>
      </form>
      {recent.length > 0 && (
        <p className="muted small recent">
          방금 입력: {recent.map((r) => `${r.member_name || r.donor_name} ${r.type_name} ${num(r.amount)}원`).join(' · ')}
        </p>
      )}
    </Card>
  );
}

export default function Offerings() {
  const { rows: members } = useList('/members');
  const { rows: types } = useList('/offering_types');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [typeId, setTypeId] = useState('');
  const [q, setQ] = useState('');
  const { rows, reload } = useList('/offerings', { from, to, type_id: typeId, q });
  const [editing, setEditing] = useState(null);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byType = useMemo(() => {
    const m = {};
    rows.forEach((r) => (m[r.type_name] = (m[r.type_name] || 0) + r.amount));
    return Object.entries(m);
  }, [rows]);

  const fields = [
    { name: 'date', label: '헌금일', type: 'date', required: true },
    { name: 'type_id', label: '헌금 종류', type: 'select', required: true, options: types.map((t) => ({ value: t.id, label: t.name })) },
    { name: 'member_id', label: '헌금자 (교인)', type: 'select', empty: '교인 아님 / 무기명', options: members.map((m) => ({ value: m.id, label: memberLabel(m) })) },
    { name: 'donor_name', label: '교인이 아닌 경우 이름', placeholder: '무기명' },
    { name: 'amount', label: '금액 (원)', type: 'money', required: true },
    { name: 'method', label: '방법', type: 'select', options: METHODS },
    { name: 'memo', label: '메모', full: true },
  ];
  const save = async (v) => {
    await saveRow('offerings', { ...v, donor_name: v.member_id ? null : v.donor_name || '무기명' });
    setEditing(null);
    reload();
  };
  const remove = (r) =>
    confirmDelete(`${r.date} ${r.member_name || r.donor_name} ${r.type_name} ${won(r.amount)} 기록을 삭제할까요?`, () => api.del(`/offerings/${r.id}`)).then(
      (ok) => ok && reload(),
    );
  const exportCsv = () =>
    downloadCSV(
      `헌금내역_${from}_${to}.csv`,
      ['헌금일', '헌금자', '직분', '헌금 종류', '금액', '방법', '메모'],
      rows.map((r) => [r.date, r.member_name || r.donor_name, r.member_position, r.type_name, r.amount, r.method, r.memo]),
    );

  return (
    <>
      <PageHeader title="헌금 입금·관리" desc="입력한 헌금은 회계 장부의 수입으로 자동 반영됩니다." />
      <QuickEntry members={members} types={types} onSaved={reload} />

      <Card title="헌금 내역" actions={<button className="btn" onClick={exportCsv}>엑셀(CSV) 내보내기</button>}>
        <div className="toolbar">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="muted">~</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">전체 종류</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input className="search" placeholder="헌금자·메모 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="sum-chips">
          <span className="sum-chip strong">합계 {won(total)} · {rows.length}건</span>
          {byType.map(([n, v]) => <span key={n} className="sum-chip">{n} {won(v)}</span>)}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>헌금일</th><th>헌금자</th><th>종류</th><th className="num">금액</th><th>방법</th><th>메모</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>
                    {r.member_name ? (
                      <>{r.member_name} <span className="muted small">{r.member_position}</span></>
                    ) : (
                      <span className="muted">{r.donor_name || '무기명'}</span>
                    )}
                  </td>
                  <td>{r.type_name}</td>
                  <td className="num">{num(r.amount)}</td>
                  <td>{r.method}</td>
                  <td className="muted">{r.memo}</td>
                  <td className="row-actions">
                    <button className="btn sm" onClick={() => setEditing(r)}>수정</button>
                    <button className="btn sm danger" onClick={() => remove(r)}>삭제</button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="7" className="empty">기간 내 헌금 기록이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <Modal title="헌금 기록 수정" onClose={() => setEditing(null)}>
          <Form fields={fields} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
