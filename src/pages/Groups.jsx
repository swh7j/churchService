import { useEffect, useState } from 'react';
import { api, saveRow } from '../api';
import { Card, confirmDelete, Form, Modal, PageHeader, Stat, useList } from '../components';
import { downloadCSV, num, today, won } from '../utils';

const GROUP_FIELDS = [
  { name: 'name', label: '소모임 이름', required: true, placeholder: '예: 청년부, 남선교회' },
  { name: 'leader', label: '회계 담당자' },
  { name: 'description', label: '설명', type: 'textarea', rows: 2, full: true },
];

export default function Groups() {
  const { rows: groups, reload } = useList('/small_groups');
  const [sel, setSel] = useState(null);
  const [editGroup, setEditGroup] = useState(null);

  useEffect(() => {
    if (groups.length && !groups.some((g) => g.id === sel)) setSel(groups[0].id);
  }, [groups, sel]);
  const group = groups.find((g) => g.id === sel);

  const saveGroup = async (v) => {
    const r = await saveRow('small_groups', v);
    setEditGroup(null);
    await reload();
    setSel(r.id);
  };
  const removeGroup = () =>
    confirmDelete(`'${group.name}' 소모임과 장부 기록을 모두 삭제할까요?\n되돌릴 수 없습니다.`, () => api.del(`/small_groups/${group.id}`)).then(
      (ok) => ok && reload(),
    );

  return (
    <>
      <PageHeader title="소모임 회계" desc="부서·선교회 등 소모임별 장부입니다. 교회 회계 장부와 따로 관리됩니다.">
        <button className="btn primary" onClick={() => setEditGroup({})}>+ 소모임 추가</button>
      </PageHeader>
      <div className="split">
        <Card title="소모임" className="side-list">
          <ul className="pick-list">
            {groups.map((g) => (
              <li key={g.id}>
                <button className={g.id === sel ? 'active' : ''} onClick={() => setSel(g.id)}>
                  <span>{g.name}</span>
                  <span className="small">{won(g.balance)}</span>
                </button>
              </li>
            ))}
          </ul>
          {!groups.length && <p className="empty">소모임을 추가해 주세요.</p>}
        </Card>
        {group ? (
          <GroupLedger key={group.id} group={group} onChanged={reload} onEdit={() => setEditGroup(group)} onDelete={removeGroup} />
        ) : (
          <Card><p className="empty">소모임을 선택하세요.</p></Card>
        )}
      </div>
      {editGroup && (
        <Modal title={editGroup.id ? '소모임 수정' : '소모임 추가'} onClose={() => setEditGroup(null)}>
          <Form fields={GROUP_FIELDS} initial={editGroup} onSubmit={saveGroup} onCancel={() => setEditGroup(null)} />
        </Modal>
      )}
    </>
  );
}

function GroupLedger({ group, onChanged, onEdit, onDelete }) {
  const { rows, reload } = useList('/group_transactions', { group_id: group.id });
  const [editing, setEditing] = useState(null);
  const refresh = () => {
    reload();
    onChanged();
  };

  let bal = 0;
  const lines = rows.map((r) => {
    bal += r.kind === 'income' ? r.amount : -r.amount;
    return { ...r, bal };
  });
  const inc = rows.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0);
  const exp = rows.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0);

  const fields = [
    { name: 'date', label: '날짜', type: 'date', required: true },
    { name: 'amount', label: '금액 (원)', type: 'money', required: true },
    { name: 'description', label: '내용', required: true, full: true },
    { name: 'memo', label: '메모', type: 'textarea', rows: 2, full: true },
  ];
  const save = async (v) => {
    await saveRow('group_transactions', { ...v, group_id: group.id });
    setEditing(null);
    refresh();
  };
  const remove = (r) =>
    confirmDelete(`${r.date} ${r.description} ${won(r.amount)} 기록을 삭제할까요?`, () => api.del(`/group_transactions/${r.id}`)).then(
      (ok) => ok && refresh(),
    );
  const exportCsv = () =>
    downloadCSV(`${group.name}_장부_${today()}.csv`, ['날짜', '내용', '입금', '출금', '잔액', '메모'],
      lines.map((r) => [r.date, r.description, r.kind === 'income' ? r.amount : '', r.kind === 'expense' ? r.amount : '', r.bal, r.memo]));

  return (
    <Card
      className="print-area"
      title={`${group.name} 장부`}
      actions={
        <>
          <button className="btn sm" onClick={onEdit}>소모임 수정</button>
          <button className="btn sm danger" onClick={onDelete}>삭제</button>
        </>
      }
    >
      {(group.leader || group.description) && (
        <p className="muted small">
          {group.leader && `회계 담당: ${group.leader}`}
          {group.leader && group.description && ' · '}
          {group.description}
        </p>
      )}
      <div className="stats compact">
        <Stat label="총 입금" value={won(inc)} tone="pos" />
        <Stat label="총 출금" value={won(exp)} tone="neg-soft" />
        <Stat label="잔액" value={won(inc - exp)} tone={inc - exp < 0 ? 'neg' : ''} />
      </div>
      <div className="toolbar no-print">
        <button className="btn primary" onClick={() => setEditing({ kind: 'income', date: today() })}>+ 입금</button>
        <button className="btn primary danger-fill" onClick={() => setEditing({ kind: 'expense', date: today() })}>+ 출금</button>
        <span className="spacer" />
        <button className="btn" onClick={exportCsv}>엑셀(CSV)</button>
        <button className="btn" onClick={() => window.print()}>인쇄</button>
      </div>
      <div className="table-wrap">
        <table className="ledger">
          <thead>
            <tr><th>날짜</th><th>내용</th><th className="num">입금</th><th className="num">출금</th><th className="num">잔액</th><th className="no-print" /></tr>
          </thead>
          <tbody>
            {lines.map((r) => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td>{r.description}{r.memo && <div className="muted small">{r.memo}</div>}</td>
                <td className="num pos">{r.kind === 'income' ? num(r.amount) : ''}</td>
                <td className="num neg">{r.kind === 'expense' ? num(r.amount) : ''}</td>
                <td className="num">{num(r.bal)}</td>
                <td className="row-actions no-print">
                  <button className="btn sm" onClick={() => setEditing(r)}>수정</button>
                  <button className="btn sm danger" onClick={() => remove(r)}>삭제</button>
                </td>
              </tr>
            ))}
            {!lines.length && <tr><td colSpan="6" className="empty">장부 기록이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && (
        <Modal title={`${group.name} · ${editing.kind === 'income' ? '입금' : '출금'} ${editing.id ? '수정' : '등록'}`} onClose={() => setEditing(null)}>
          <Form fields={fields} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </Card>
  );
}
