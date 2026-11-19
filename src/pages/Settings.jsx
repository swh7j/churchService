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
        <SimpleList title="헌금 종류" path="/offering_types" />
        <SimpleList title="예배 종류 (출석용)" path="/services" />
        <SimpleList title="수입 계정과목 (헌금 외)" path="/categories" extra={{ kind: 'income' }} />
        <SimpleList title="지출 계정과목" path="/categories" extra={{ kind: 'expense' }} />
      </div>
    </>
  );
}

function SimpleList({ title, path, extra }) {
  const { rows, reload } = useList(path, extra);
  const [name, setName] = useState('');

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.post(path, { ...extra, name: name.trim(), sort: rows.length + 1 });
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
  const remove = (r) => confirmDelete(`'${r.name}' 항목을 삭제할까요?`, () => api.del(`${path}/${r.id}`)).then((ok) => ok && reload());

  return (
    <Card title={title}>
      <ul className="edit-list">
        {rows.map((r) => (
          <li key={r.id}>
            <input
              aria-label={`${title} 이름`}
              defaultValue={r.name}
              onBlur={(e) => rename(r, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
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
