import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { askConfirm, Card, PageHeader, useList } from '../components';
import { addDays, groupBy, kdate, lastSunday } from '../utils';

export default function Attendance() {
  const { rows: services } = useList('/services');
  const [date, setDate] = useState(lastSunday());
  const [sid, setSid] = useState('');
  const [list, setList] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState('');
  const [stats, setStats] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sid && services.length) setSid(String(services[0].id));
  }, [services, sid]);

  const loadStats = () => api.get('/attendance-stats').then(setStats).catch(() => {});
  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (!sid) return;
    api.get('/attendance', { date, service_id: sid }).then((r) => {
      setList(r);
      setChecked(new Set(r.filter((x) => x.attended).map((x) => x.id)));
      setDirty(false);
    });
  }, [date, sid]);

  const guard = (fn) => async (...a) => {
    if (dirty && !(await askConfirm('저장하지 않은 출석 체크가 있습니다. 저장하지 않고 이동할까요?', { ok: '이동' }))) return;
    fn(...a);
  };
  const toggle = (id) => {
    setChecked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    setDirty(true);
  };
  const setAll = (on) => {
    setChecked(on ? new Set(list.map((m) => m.id)) : new Set());
    setDirty(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.put('/attendance', { date, service_id: Number(sid), member_ids: [...checked] });
      setDirty(false);
      loadStats();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const visible = list.filter((m) => !q || m.name.includes(q) || (m.district || '').includes(q));
  const groups = useMemo(() => groupBy(visible, (m) => m.district || '구역 미지정'), [visible]);

  return (
    <>
      <PageHeader title="출석 관리" desc="예배를 고르고, 출석한 교인을 눌러 체크한 뒤 저장하세요." />
      <Card>
        <div className="toolbar">
          <button className="btn" onClick={guard(() => setDate(addDays(date, -7)))}>← 지난주</button>
          <input type="date" value={date} onChange={guard((e) => setDate(e.target.value))} />
          <button className="btn" onClick={guard(() => setDate(addDays(date, 7)))}>다음주 →</button>
          <select value={sid} onChange={guard((e) => setSid(e.target.value))}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input className="search" placeholder="이름·구역 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="att-summary">
          <span>{kdate(date)}</span>
          <strong>출석 {checked.size}명</strong>
          <span className="muted">/ 대상 {list.length}명</span>
          <span className="spacer" />
          <button className="btn sm" onClick={() => setAll(true)}>전체 선택</button>
          <button className="btn sm" onClick={() => setAll(false)}>전체 해제</button>
          <button className="btn primary" onClick={save} disabled={!dirty || saving}>
            {dirty ? '출석 저장' : '저장됨'}
          </button>
        </div>
        {Object.entries(groups).map(([g, ms]) => (
          <div key={g} className="att-group">
            <div className="att-group-title">
              {g} <span className="muted small">{ms.filter((m) => checked.has(m.id)).length}/{ms.length}</span>
            </div>
            <div className="chips">
              {ms.map((m) => (
                <button key={m.id} className={'chip' + (checked.has(m.id) ? ' on' : '')} onClick={() => toggle(m.id)} aria-pressed={checked.has(m.id)}>
                  {checked.has(m.id) ? '✓ ' : ''}
                  {m.name}
                  {m.position && <span className="chip-sub">{m.position}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!list.length && <p className="empty">출석 대상 교인이 없습니다. 교인 관리에서 먼저 등록해 주세요.</p>}
      </Card>

      <Card title="최근 출석 현황">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>날짜</th><th>예배</th><th className="num">출석</th></tr>
            </thead>
            <tbody>
              {stats.map((s, i) => (
                <tr key={i}>
                  <td>{kdate(s.date)}</td>
                  <td>{s.service}</td>
                  <td className="num">{s.cnt}명</td>
                </tr>
              ))}
              {!stats.length && <tr><td colSpan="3" className="empty">아직 출석 기록이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
