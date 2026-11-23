import { useContext, useEffect, useState } from 'react';
import { api } from '../api';
import { AppCtx, Card, confirmDelete, PageHeader, useList } from '../components';

export default function Settings() {
  const { settings, reloadSettings } = useContext(AppCtx);
  const [name, setName] = useState(settings.church_name || '');
  useEffect(() => setName(settings.church_name || ''), [settings.church_name]);

  const saveName = async (e) => {
    e.preventDefault();
    try {
      await api.put('/settings', { church_name: name.trim() });
      await reloadSettings();
      alert('저장했습니다.');
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <>
      <PageHeader title="설정" desc="교회 정보와 분류 항목을 관리합니다. 이름은 칸을 눌러 바로 고칠 수 있습니다." />
      <Card title="교회 정보">
        <form className="inline-form" onSubmit={saveName}>
          <div className="field grow">
            <label htmlFor="church_name">교회 이름</label>
            <input id="church_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 사랑의교회" />
          </div>
          <button className="btn primary">저장</button>
        </form>
      </Card>
      <div className="grid2">
        <SimpleList title="헌금 종류" path="/offering_types" grouped />
        <SimpleList title="예배 종류 (출석용)" path="/services" />
        <SimpleList title="수입 계정과목 (헌금 외)" path="/categories" extra={{ kind: 'income' }} grouped />
        <SimpleList title="지출 계정과목" path="/categories" extra={{ kind: 'expense' }} grouped />
      </div>
    </>
  );
}

/** grouped: 결산보고서에서 같은 '소계 묶음'끼리 모아 소계를 냄 (예: 목회비 → 목회자사례·목회활동비) */
function SimpleList({ title, path, extra, grouped }) {
  const { rows, reload } = useList(path, extra);
  const [name, setName] = useState('');

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.post(path, { ...extra, name: name.trim(), sort: Math.max(0, ...rows.map((r) => r.sort || 0)) + 1 });
      setName('');
      reload();
    } catch (err) {
      alert(err.message);
    }
  };
  const rename = async (r, v) => {
    if (!v.trim() || v.trim() === r.name) return;
    try {
      await api.put(`${path}/${r.id}`, { name: v.trim() });
      reload();
    } catch (err) {
      alert(err.message);
    }
  };
  const regroup = async (r, v) => {
    if (v.trim() === (r.grp || '')) return;
    try {
      await api.put(`${path}/${r.id}`, { grp: v.trim() || null });
      reload();
    } catch (err) {
      alert(err.message);
    }
  };
  const remove = (r) => confirmDelete(`'${r.name}' 항목을 삭제할까요?`, () => api.del(`${path}/${r.id}`)).then((ok) => ok && reload());

  return (
    <Card title={title}>
      {grouped && <p className="muted small">오른쪽 칸에 묶음 이름(예: 목회비)을 적으면 결산보고서에서 그 묶음끼리 모아 소계를 냅니다.</p>}
      <ul className="edit-list">
        {rows.map((r) => (
          <li key={r.id}>
            <input
              aria-label={`${title} 이름`}
              defaultValue={r.name}
              onBlur={(e) => rename(r, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            {grouped && (
              <input
                className="grp-input"
                aria-label={`${r.name} 소계 묶음`}
                placeholder="소계 묶음"
                defaultValue={r.grp || ''}
                onBlur={(e) => regroup(r, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            )}
            <button className="btn sm danger" onClick={() => remove(r)}>삭제</button>
          </li>
        ))}
      </ul>
      <form className="add-row" onSubmit={add}>
        <input placeholder="새 항목 이름" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn">추가</button>
      </form>
    </Card>
  );
}
