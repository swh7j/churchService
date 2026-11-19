import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, saveRow } from '../api';
import { Badge, Card, confirmDelete, Form, Loading, Modal, PageHeader, Stat, useList } from '../components';
import { downloadCSV, monthEnd, num, today, won, ymd } from '../utils';
import { METHODS } from './Offerings';

export default function Ledger() {
  const [ym, setYm] = useState(today().slice(0, 7));
  const from = ym + '-01';
  const to = monthEnd(from);
  const [data, setData] = useState(null);
  const { rows: cats } = useList('/categories');
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => api.get('/ledger', { from, to }).then(setData).catch((e) => alert(e.message)), [from, to]);
  useEffect(() => {
    load();
  }, [load]);

  const shift = (d) => {
    const [y, m] = ym.split('-').map(Number);
    setYm(ymd(new Date(y, m - 1 + d, 1)).slice(0, 7));
  };

  const fields = (kind) => [
    { name: 'date', label: '날짜', type: 'date', required: true },
    { name: 'category_id', label: '계정과목', type: 'select', required: true, options: cats.filter((c) => c.kind === kind).map((c) => ({ value: c.id, label: c.name })) },
    { name: 'amount', label: '금액 (원)', type: 'money', required: true },
    { name: 'method', label: '방법', type: 'select', options: METHODS },
    { name: 'description', label: '내용', required: true, full: true, placeholder: kind === 'income' ? '예: 예금 이자' : '예: 11월 전기요금' },
    { name: 'memo', label: '메모 (영수증 번호 등)', type: 'textarea', rows: 2, full: true },
  ];
  const save = async (v) => {
    await saveRow('transactions', v);
    setEditing(null);
    load();
  };
  const remove = (r) =>
    confirmDelete(`${r.date} ${r.description} ${won(r.amount)} 기록을 삭제할까요?`, () => api.del(`/transactions/${r.id}`)).then((ok) => ok && load());

  if (!data) return <Loading />;
  let bal = data.carry;
  const lines = data.rows.map((r) => {
    bal += r.kind === 'income' ? r.amount : -r.amount;
    return { ...r, bal };
  });
  const exportCsv = () =>
    downloadCSV(
      `회계장부_${ym}.csv`,
      ['날짜', '구분', '계정과목', '내용', '수입', '지출', '잔액', '방법', '메모'],
      [
        ['', '', '', '전월 이월', '', '', data.carry, '', ''],
        ...lines.map((r) => [r.date, r.kind === 'income' ? '수입' : '지출', r.category_name, r.description, r.kind === 'income' ? r.amount : '', r.kind === 'expense' ? r.amount : '', r.bal, r.method, r.memo]),
      ],
    );

  return (
    <>
      <PageHeader title="회계 장부" desc="헌금은 헌금 입금 메뉴에서 입력하면 날짜·종류별로 자동 집계됩니다.">
        <button className="btn" onClick={exportCsv}>엑셀(CSV)</button>
        <button className="btn" onClick={() => window.print()}>인쇄</button>
        <button className="btn primary" onClick={() => setEditing({ kind: 'income', date: today() })}>+ 수입</button>
        <button className="btn primary danger-fill" onClick={() => setEditing({ kind: 'expense', date: today() })}>+ 지출</button>
      </PageHeader>

      <div className="print-area">
        <div className="toolbar month-nav no-print">
          <button className="btn" onClick={() => shift(-1)}>← 이전 달</button>
          <input type="month" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} />
          <button className="btn" onClick={() => shift(1)}>다음 달 →</button>
        </div>
        <h2 className="print-only">{ym.replace('-', '년 ')}월 회계 장부</h2>
        <div className="stats">
          <Stat label="전월 이월" value={won(data.carry)} />
          <Stat label="이번 달 수입" value={won(data.income)} tone="pos" />
          <Stat label="이번 달 지출" value={won(data.expense)} tone="neg-soft" />
          <Stat label="월말 잔액" value={won(data.balance)} tone={data.balance < 0 ? 'neg' : ''} />
        </div>
        <Card>
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th>날짜</th><th>구분</th><th>계정과목</th><th>내용</th>
                  <th className="num">수입</th><th className="num">지출</th><th className="num">잔액</th><th className="no-print" />
                </tr>
              </thead>
              <tbody>
                <tr className="carry">
                  <td colSpan="4">전월 이월</td><td /><td /><td className="num">{num(data.carry)}</td><td className="no-print" />
                </tr>
                {lines.map((r, i) => (
                  <tr key={r.source + (r.id ?? i)}>
                    <td>{r.date}</td>
                    <td><Badge tone={r.kind === 'income' ? 'green' : 'red'}>{r.kind === 'income' ? '수입' : '지출'}</Badge></td>
                    <td>{r.category_name || <span className="muted">미분류</span>}</td>
                    <td>
                      {r.description}
                      {r.memo && <div className="muted small">{r.memo}</div>}
                    </td>
                    <td className="num pos">{r.kind === 'income' ? num(r.amount) : ''}</td>
                    <td className="num neg">{r.kind === 'expense' ? num(r.amount) : ''}</td>
                    <td className="num">{num(r.bal)}</td>
                    <td className="row-actions no-print">
                      {r.source === 'manual' ? (
                        <>
                          <button className="btn sm" onClick={() => setEditing(r)}>수정</button>
                          <button className="btn sm danger" onClick={() => remove(r)}>삭제</button>
                        </>
                      ) : (
                        <Link className="btn sm" to="/offerings">헌금 내역</Link>
                      )}
                    </td>
                  </tr>
                ))}
                {!lines.length && <tr><td colSpan="8" className="empty">이번 달 기록이 없습니다.</td></tr>}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4">합계</td>
                  <td className="num">{num(data.income)}</td>
                  <td className="num">{num(data.expense)}</td>
                  <td className="num">{num(data.balance)}</td>
                  <td className="no-print" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </div>

      {editing && (
        <Modal title={`${editing.kind === 'income' ? '수입' : '지출'} ${editing.id ? '수정' : '등록'}`} onClose={() => setEditing(null)}>
          <Form fields={fields(editing.kind)} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
