import { useContext, useEffect, useState } from 'react';
import { api } from '../api';
import { AppCtx, Card, Loading, PageHeader, Stat } from '../components';
import { downloadCSV, num, today } from '../utils';
import { makeXlsx, saveBlob } from './report/xlsx';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const sumArr = (arr) => arr.reduce((a, b) => a + b, 0);
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '');

export default function Reports() {
  const [tab, setTab] = useState('month');
  const now = today();
  const thisYear = Number(now.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState(Number(now.slice(5, 7)));
  const tabs = [
    ['month', '월별 결산'],
    ['annual', '연간 결산'],
    ['trend', '월별 추이표'],
    ['donations', '교인별 연간 헌금'],
  ];

  return (
    <>
      <PageHeader title="결산 보고서" desc="월별 결산, 연간 결산(예산 대비), 교인별 헌금 합계(기부금 영수증 자료)를 봅니다.">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="연도">
          {Array.from({ length: 6 }, (_, i) => thisYear + 1 - i).map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        {tab === 'month' && (
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="월">
            {MONTHS.map((m) => <option key={m} value={m}>{m}월</option>)}
          </select>
        )}
        <button className="btn" onClick={() => window.print()}>인쇄</button>
      </PageHeader>
      <div className="tabs no-print">
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === 'month' && <MonthReport year={year} month={month} />}
      {tab === 'annual' && <AnnualReport year={year} />}
      {tab === 'trend' && <Trend year={year} />}
      {tab === 'donations' && <Donations year={year} />}
    </>
  );
}

/* ---------- 공통: 결산 자료 · 예산 불러오기, 소계 묶기 ---------- */

function useSummary(year) {
  const [d, setD] = useState(null);
  useEffect(() => {
    setD(null);
    api.get('/reports/summary', { year }).then(setD).catch((e) => alert(e.message));
  }, [year]);
  return d;
}

function useBudgets(year) {
  const [b, setB] = useState(null);
  const [ver, setVer] = useState(0);
  useEffect(() => {
    setB(null);
    api.get('/reports/budgets', { year }).then((r) => setB(r.budgets)).catch((e) => alert(e.message));
  }, [year, ver]);
  return [b, () => setVer((v) => v + 1)];
}

/**
 * 같은 '소계 묶음'(설정에서 입력)끼리 모아서 [항목들..., 소계] 순서로 돌려줌.
 * 묶음은 그 묶음의 첫 항목 자리에 나옴. 묶음이 없는 항목은 그대로.
 */
function withSubtotals(rows) {
  const out = [];
  const groups = {};
  for (const r of rows) {
    if (!r.grp) {
      out.push({ type: 'item', r });
    } else if (groups[r.grp]) {
      groups[r.grp].rows.push(r);
    } else {
      groups[r.grp] = { type: 'group', name: r.grp, rows: [r] };
      out.push(groups[r.grp]);
    }
  }
  return out.flatMap((e) =>
    e.type === 'item' ? [e] : [...e.rows.map((r) => ({ type: 'item', r, indent: true })), { type: 'sub', name: `${e.name} 소계`, rows: e.rows }],
  );
}

/* ---------- 월별 결산: 그 달 금액 + 1월부터 누계 + 올해 예산 대비 ---------- */

function MonthReport({ year, month }) {
  const d = useSummary(year);
  const [budgets] = useBudgets(year);
  if (!d || !budgets) return <Loading />;
  const bud = budgets[year] || {};
  const m = month - 1;
  const val = (r) => ({
    cur: r.months[m],
    acc: sumArr(r.months.slice(0, month)),
    budget: r.key ? bud[r.key]?.amount || 0 : 0,
  });
  const sumOf = (rows) => rows.map(val).reduce((a, v) => ({ cur: a.cur + v.cur, acc: a.acc + v.acc, budget: a.budget + v.budget }), { cur: 0, acc: 0, budget: 0 });
  const inc = sumOf(d.income);
  const exp = sumOf(d.expense);

  const line = (key, name, v, cls = '', indent = false) => (
    <tr key={key} className={cls}>
      <td className={indent ? 'indent' : ''}>{name}</td>
      <td className="num">{v.cur ? num(v.cur) : ''}</td>
      <td className="num">{v.acc ? num(v.acc) : ''}</td>
      <td className="num">{v.budget ? num(v.budget) : ''}</td>
      <td className="num muted">{pct(v.acc, v.budget)}</td>
    </tr>
  );
  const section = (title, rows, total, totalName) => [
    <tr key={title} className="section"><td colSpan="5">{title}</td></tr>,
    ...withSubtotals(rows).map((e, i) =>
      e.type === 'item' ? line(`${title}${i}`, e.r.name, val(e.r), '', e.indent) : line(`${title}${i}`, e.name, sumOf(e.rows), 'subtotal-sm'),
    ),
    line(`${title}-t`, totalName, total, 'subtotal'),
  ];
  const net = { cur: inc.cur - exp.cur, acc: inc.acc - exp.acc, budget: inc.budget - exp.budget };

  const exportCsv = () =>
    downloadCSV(`월별결산_${year}_${month}월.csv`, ['구분', '항목', `${month}월`, `누계(1~${month}월)`, `${year} 예산`], [
      ...d.income.map((r) => ['수입', r.name, ...Object.values(val(r))]),
      ['수입', '수입 합계', inc.cur, inc.acc, inc.budget],
      ...d.expense.map((r) => ['지출', r.name, ...Object.values(val(r))]),
      ['지출', '지출 합계', exp.cur, exp.acc, exp.budget],
      ['', '수지 차액', net.cur, net.acc, net.budget],
    ]);

  return (
    <Card className="print-area" title={`${year}년 ${month}월 결산`} actions={<button className="btn no-print" onClick={exportCsv}>엑셀(CSV)</button>}>
      <div className="stats compact">
        <Stat label={`${month}월 수입`} value={`${num(inc.cur)}원`} />
        <Stat label={`${month}월 지출`} value={`${num(exp.cur)}원`} />
        <Stat label={`${month}월 차액`} value={`${num(net.cur)}원`} tone={net.cur < 0 ? 'neg' : ''} />
      </div>
      <div className="table-wrap">
        <table className="report">
          <thead>
            <tr>
              <th>항목</th>
              <th className="num">{month}월</th>
              <th className="num">누계 (1~{month}월)</th>
              <th className="num">{year} 예산</th>
              <th className="num">집행률</th>
            </tr>
          </thead>
          <tbody>
            {section('수입', d.income, inc, '수입 합계')}
            {section('지출', d.expense, exp, '지출 합계')}
            {line('net', '수지 차액', net, 'grand')}
          </tbody>
        </table>
      </div>
      <p className="muted small">집행률 = 누계 ÷ 올해 예산. 예산은 '연간 결산' 탭에서 입력합니다.</p>
    </Card>
  );
}

/* ---------- 연간 결산: 교회 예결산서 양식 (수입 | 지출, 올해 예산 · 결산 · 다음 해 예산 · 비고) ---------- */

function AnnualReport({ year }) {
  const { settings } = useContext(AppCtx);
  const d = useSummary(year);
  const [budgets, reloadBudgets] = useBudgets(year);
  const [edit, setEdit] = useState(null); // { [year]: { key: {amount, memo} } }
  const [saving, setSaving] = useState(false);
  useEffect(() => setEdit(null), [year]);
  if (!d || !budgets) return <Loading />;
  const next = year + 1;
  const src = edit || budgets;
  const b = (y, key) => (key ? src[y]?.[key] : null) || { amount: 0, memo: '' };

  const startEdit = () => setEdit(JSON.parse(JSON.stringify(budgets)));
  const setVal = (y, key, field, v) =>
    setEdit((e) => ({ ...e, [y]: { ...e[y], [key]: { ...b(y, key), [field]: v } } }));
  const save = async () => {
    setSaving(true);
    try {
      const keys = [...d.income, ...d.expense].map((r) => r.key).filter(Boolean);
      for (const y of [year, next]) {
        await api.put('/reports/budgets', { year: y, items: keys.map((k) => ({ item: k, amount: Number(b(y, k).amount) || 0, memo: b(y, k).memo || '' })) });
      }
      setEdit(null);
      reloadBudgets();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const sumOf = (rows) => ({
    bud: sumArr(rows.map((r) => Number(b(year, r.key).amount) || 0)),
    act: sumArr(rows.map((r) => r.total)),
    next: sumArr(rows.map((r) => Number(b(next, r.key).amount) || 0)),
  });
  const inc = sumOf(d.income);
  const exp = sumOf(d.expense);
  // 올해 예산을 하나도 입력하지 않았으면 그 열은 숨김 (교회 예결산서처럼 결산 | 다음 해 예산 | 비고)
  const showBud = !!edit || Object.keys(budgets[year] || {}).length > 0;
  const cols = showBud ? 5 : 4;

  const money = (y, r) => {
    const v = Number(b(y, r.key).amount) || 0;
    if (!edit || !r.key) return v ? num(v) : '';
    return (
      <input
        className="budget-input"
        inputMode="numeric"
        aria-label={`${r.name} ${y}년 예산`}
        value={v ? num(v) : ''}
        onChange={(e) => setVal(y, r.key, 'amount', Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
      />
    );
  };
  const memo = (r) => {
    const v = b(next, r.key).memo || '';
    if (!edit || !r.key) return v;
    return <input className="budget-memo" aria-label={`${r.name} 비고`} value={v} onChange={(e) => setVal(next, r.key, 'memo', e.target.value)} />;
  };

  // 입력칸 포커스가 유지되도록 컴포넌트가 아닌 함수로 호출
  const table = (title, rows, total) => (
    <div className="table-wrap">
      <table className="report annual">
        <thead>
          <tr className="section"><td colSpan={cols}>{title}</td></tr>
          <tr>
            <th>항목</th>
            {showBud && <th className="num">{year} 예산</th>}
            <th className="num">{year} 결산</th>
            <th className="num">{next} 예산</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {withSubtotals(rows).map((e, i) => {
            if (e.type === 'sub') {
              const s = sumOf(e.rows);
              return (
                <tr key={i} className="subtotal-sm">
                  <td>{e.name}</td>
                  {showBud && <td className="num">{s.bud ? num(s.bud) : ''}</td>}
                  <td className="num">{s.act ? num(s.act) : ''}</td>
                  <td className="num">{s.next ? num(s.next) : ''}</td>
                  <td />
                </tr>
              );
            }
            const r = e.r;
            return (
              <tr key={i}>
                <td className={e.indent ? 'indent' : ''}>{r.name}</td>
                {showBud && <td className="num">{money(year, r)}</td>}
                <td className="num">{r.total ? num(r.total) : ''}</td>
                <td className="num">{money(next, r)}</td>
                <td className="memo">{memo(r)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>합계</td>
            {showBud && <td className="num">{num(total.bud)}</td>}
            <td className="num">{num(total.act)}</td>
            <td className="num">{num(total.next)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const exportCsv = () => {
    const rowsOf = (kind, rows) => rows.map((r) => [kind, r.grp || '', r.name, Number(b(year, r.key).amount) || 0, r.total, Number(b(next, r.key).amount) || 0, b(next, r.key).memo || '']);
    downloadCSV(`연간결산_${year}.csv`, ['구분', '소계 묶음', '항목', `${year} 예산`, `${year} 결산`, `${next} 예산`, '비고'], [
      ...rowsOf('수입', d.income),
      ['수입', '', '수입 합계', inc.bud, inc.act, inc.next, ''],
      ...rowsOf('지출', d.expense),
      ['지출', '', '지출 합계', exp.bud, exp.act, exp.next, ''],
      ['', '', '수지 차액', inc.bud - exp.bud, inc.act - exp.act, inc.next - exp.next, ''],
    ]);
  };

  // 교회 예결산서 양식 그대로 엑셀 한 장: 왼쪽 수입(항목·결산·다음 해 예산) | 오른쪽 지출(항목·결산·다음 해 예산·비고)
  const exportXlsx = async () => {
    const side = (rows) =>
      withSubtotals(rows).map((e) => {
        if (e.type === 'sub') {
          const s = sumOf(e.rows);
          return { name: e.name, act: s.act, next: s.next, memo: '', sub: true };
        }
        return { name: e.r.name, act: e.r.total, next: Number(b(next, e.r.key).amount) || 0, memo: b(next, e.r.key).memo || '', indent: e.indent };
      });
    const L = side(d.income);
    const R = side(d.expense);
    const n = Math.max(L.length, R.length);
    const cell = (v, st) => ({ v, s: st });
    const left = (x) =>
      x ? [cell(x.name, x.sub ? 'subText' : x.indent ? 'indent' : 'text'), cell(x.act, x.sub ? 'subNum' : 'num'), cell(x.next, x.sub ? 'subNum' : 'num')] : [cell('', 'blank'), cell('', 'blank'), cell('', 'blank')];
    const right = (x) => (x ? [...left(x), cell(x.memo, x.sub ? 'subText' : 'memo')] : [...left(null), cell('', 'blank')]);
    const church = settings.church_name ? `${settings.church_name} ` : '';
    const rows = [
      [cell(`${church}${year}년 결산 / ${next}년 예산`, 'title'), null, null, null, null, null, null],
      [],
      [cell('수입', 'head'), cell('', 'head'), cell('', 'head'), cell('지출', 'head'), cell('', 'head'), cell('', 'head'), cell('', 'head')],
      ['항목', `${year}년 수입`, `${next}년 예산`, '항목', `${year}년 지출`, `${next}년 예산`, '비고'].map((v) => cell(v, 'head')),
      ...Array.from({ length: n }, (_, i) => [...left(L[i]), ...right(R[i])]),
      [cell('합계', 'totText'), cell(inc.act, 'totNum'), cell(inc.next, 'totNum'), cell('합계', 'totText'), cell(exp.act, 'totNum'), cell(exp.next, 'totNum'), cell('', 'totText')],
      [],
      [cell(`수지 차액 (${year}년 수입 − 지출) : ${num(inc.act - exp.act)}원`, 'note'), null, null, null, null, null, null],
    ];
    const last = rows.length;
    const blob = await makeXlsx({
      sheetName: `${year}년 결산`,
      widths: [16, 13, 13, 18, 13, 13, 17],
      rows,
      merges: ['A1:G1', 'A3:C3', 'D3:G3', `A${last}:G${last}`],
      heights: { 0: 30 },
    });
    saveBlob(blob, `${church}${year}년 결산_${next}년 예산.xlsx`.trim());
  };

  const actions = edit ? (
    <>
      <button className="btn" onClick={() => setEdit(null)} disabled={saving}>취소</button>
      <button className="btn primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '예산 저장'}</button>
    </>
  ) : (
    <>
      <button className="btn" onClick={startEdit}>예산 입력</button>
      <button className="btn" onClick={() => exportXlsx().catch((e) => alert(e.message))}>엑셀 (예결산서 한 장)</button>
      <button className="btn" onClick={exportCsv}>CSV</button>
    </>
  );
  const diff = inc.act - exp.act;

  return (
    <Card className="print-area annual-card" title={`${year}년 결산 / ${next}년 예산`} actions={<span className="no-print card-actions">{actions}</span>}>
      {edit && <p className="muted small no-print">{year}년·{next}년 예산 금액과 비고를 입력하고 '예산 저장'을 누르세요. 결산 금액은 헌금·회계 장부 기록에서 자동으로 계산됩니다.</p>}
      <div className="annual-grid">
        {table('수입', d.income, inc)}
        {table('지출', d.expense, exp)}
      </div>
      <div className="annual-foot">
        <span>{year}년 수입 {num(inc.act)}원 − 지출 {num(exp.act)}원</span>
        <strong className={diff < 0 ? 'neg' : ''}>수지 차액 {num(diff)}원</strong>
      </div>
    </Card>
  );
}

/* ---------- 월별 추이표: 1~12월 한눈에 ---------- */

function Trend({ year }) {
  const d = useSummary(year);
  if (!d) return <Loading />;
  const net = d.incomeMonths.map((v, i) => v - d.expenseMonths[i]);
  const row = (key, name, months, cls = '', indent = false) => (
    <tr key={key} className={cls}>
      <td className={indent ? 'indent' : ''}>{name}</td>
      {months.map((v, i) => <td key={i} className="num">{v ? num(v) : ''}</td>)}
      <td className="num strong">{num(sumArr(months))}</td>
    </tr>
  );
  const groupMonths = (rows) => MONTHS.map((_, i) => sumArr(rows.map((r) => r.months[i])));
  const section = (title, rows) =>
    withSubtotals(rows).map((e, i) =>
      e.type === 'item' ? row(`${title}${i}`, e.r.name, e.r.months, '', e.indent) : row(`${title}${i}`, e.name, groupMonths(e.rows), 'subtotal-sm'),
    );
  const exportCsv = () =>
    downloadCSV(`월별추이_${year}.csv`, ['구분', '항목', ...MONTHS.map((m) => `${m}월`), '합계'], [
      ...d.income.map((r) => ['수입', r.name, ...r.months, r.total]),
      ['수입', '수입 합계', ...d.incomeMonths, sumArr(d.incomeMonths)],
      ...d.expense.map((r) => ['지출', r.name, ...r.months, r.total]),
      ['지출', '지출 합계', ...d.expenseMonths, sumArr(d.expenseMonths)],
      ['', '수지 차액', ...net, sumArr(net)],
    ]);

  return (
    <Card className="print-area" title={`${year}년 월별 추이표`} actions={<button className="btn no-print" onClick={exportCsv}>엑셀(CSV)</button>}>
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
            {section('수입', d.income)}
            {row('inc', '수입 합계', d.incomeMonths, 'subtotal')}
            <tr className="section"><td colSpan="14">지출</td></tr>
            {section('지출', d.expense)}
            {row('exp', '지출 합계', d.expenseMonths, 'subtotal')}
            {row('net', '수지 차액', net, 'grand')}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------- 교인별 연간 헌금 ---------- */

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
    <Card className="print-area" title={`${year}년 교인별 헌금 합계`} actions={<button className="btn no-print" onClick={exportCsv}>엑셀(CSV)</button>}>
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
