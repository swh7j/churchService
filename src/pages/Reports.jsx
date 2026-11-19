import { useEffect, useState } from 'react';
import { api } from '../api';
import { Card, Loading, PageHeader } from '../components';
import { downloadCSV, num, today } from '../utils';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function Reports() {
  const [tab, setTab] = useState('summary');
  const thisYear = Number(today().slice(0, 4));
  const [year, setYear] = useState(thisYear);

  return (
    <>
      <PageHeader title="결산 보고서" desc="연간 월별 결산과 교인별 헌금 합계(기부금 영수증 자료)를 봅니다.">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {Array.from({ length: 6 }, (_, i) => thisYear - i).map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        <button className="btn" onClick={() => window.print()}>인쇄</button>
      </PageHeader>
      <div className="tabs no-print">
        <button className={tab === 'summary' ? 'on' : ''} onClick={() => setTab('summary')}>월별 결산</button>
        <button className={tab === 'donations' ? 'on' : ''} onClick={() => setTab('donations')}>교인별 연간 헌금</button>
      </div>
      {tab === 'summary' ? <Summary year={year} /> : <Donations year={year} />}
    </>
  );
}

function Summary({ year }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    setD(null);
    api.get('/reports/summary', { year }).then(setD).catch((e) => alert(e.message));
  }, [year]);
  if (!d) return <Loading />;
  const total = (arr) => arr.reduce((a, b) => a + b, 0);
  const net = d.incomeMonths.map((v, i) => v - d.expenseMonths[i]);
  const row = (r, cls = '') => (
    <tr key={r.group + r.name} className={cls}>
      <td>{r.name}</td>
      {r.months.map((v, i) => <td key={i} className="num">{v ? num(v) : ''}</td>)}
      <td className="num strong">{num(r.total ?? total(r.months))}</td>
    </tr>
  );
  const exportCsv = () =>
    downloadCSV(`결산_${year}.csv`, ['구분', '항목', ...MONTHS.map((m) => `${m}월`), '합계'], [
      ...d.income.map((r) => ['수입', r.name, ...r.months, r.total]),
      ['수입', '수입 합계', ...d.incomeMonths, total(d.incomeMonths)],
      ...d.expense.map((r) => ['지출', r.name, ...r.months, r.total]),
      ['지출', '지출 합계', ...d.expenseMonths, total(d.expenseMonths)],
      ['', '수지 차액', ...net, total(net)],
    ]);

  return (
    <Card className="print-area" title={`${year}년 월별 결산`} actions={<button className="btn" onClick={exportCsv}>엑셀(CSV)</button>}>
      <div className="table-wrap">
        <table className="report">
          <thead>
            <tr>
              <th>항목</th>
              {MONTHS.map((m) => <th key={m} className="num">{m}월</th>)}
              <th className="num">합계</th>
            </tr>
          </thead>
          <tbody>
            <tr className="section"><td colSpan="14">수입</td></tr>
            {d.income.map((r) => row(r))}
            {row({ group: 'sum', name: '수입 합계', months: d.incomeMonths }, 'subtotal')}
            <tr className="section"><td colSpan="14">지출</td></tr>
            {d.expense.map((r) => row(r))}
            {row({ group: 'sum2', name: '지출 합계', months: d.expenseMonths }, 'subtotal')}
            {row({ group: 'net', name: '수지 차액', months: net }, 'grand')}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Donations({ year }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    setD(null);
    api.get('/reports/donations', { year }).then(setD).catch((e) => alert(e.message));
  }, [year]);
  if (!d) return <Loading />;
  const grand = d.rows.reduce((s, r) => s + r.total, 0);
  const exportCsv = () =>
    downloadCSV(`교인별헌금_${year}.csv`, ['이름', '직분', '구역', ...d.types.map((t) => t.name), '합계'], d.rows.map((r) => [r.name, r.position, r.district, ...d.types.map((t) => r.byType[t.id] || 0), r.total]));

  return (
    <Card className="print-area" title={`${year}년 교인별 헌금 합계`} actions={<button className="btn" onClick={exportCsv}>엑셀(CSV)</button>}>
      <p className="muted small">기부금 영수증 발급 시 참고 자료입니다. 무기명·비교인 헌금 합계: {num(d.anonymous)}원</p>
      <div className="table-wrap">
        <table className="report">
          <thead>
            <tr>
              <th>이름</th><th>직분</th><th>구역</th>
              {d.types.map((t) => <th key={t.id} className="num">{t.name}</th>)}
              <th className="num">합계</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.position}</td>
                <td>{r.district}</td>
                {d.types.map((t) => <td key={t.id} className="num">{r.byType[t.id] ? num(r.byType[t.id]) : ''}</td>)}
                <td className="num strong">{num(r.total)}</td>
              </tr>
            ))}
            {!d.rows.length && <tr><td colSpan={d.types.length + 4} className="empty">{year}년 헌금 기록이 없습니다.</td></tr>}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="3">합계 ({d.rows.length}명)</td>
              {d.types.map((t) => <td key={t.id} className="num">{num(d.rows.reduce((s, r) => s + (r.byType[t.id] || 0), 0))}</td>)}
              <td className="num">{num(grand)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
