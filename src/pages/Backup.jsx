import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { withChurch } from '../church';
import { askConfirm, Badge, Card, confirmDelete, PageHeader } from '../components';

const KIND = { auto: ['자동', 'blue'], manual: ['수동', 'green'], 'before-restore': ['복원 직전', 'amber'] };
const size = (n) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

export default function Backup() {
  const [data, setData] = useState({ dir: '', list: [] });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get('/backups').then(setData).catch((e) => alert(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  const backupNow = async () => {
    setBusy(true);
    try {
      await api.post('/backups');
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };
  const restore = async (b) => {
    const msg = `${b.created_at} 시점으로 모든 데이터를 되돌릴까요?\n\n그 이후에 입력한 내용은 사라집니다.\n(지금 상태는 '복원 직전' 백업으로 자동 보관됩니다)`;
    if (!(await askConfirm(msg, { ok: '복원', danger: true, typeToConfirm: '복원' }))) return;
    try {
      const r = await api.post(`/backups/${encodeURIComponent(b.name)}/restore`);
      alert(`복원했습니다. 화면을 새로 불러옵니다.\n복원 직전 상태: ${r.safety}`);
      window.location.reload();
    } catch (e) {
      alert(e.message);
    }
  };
  const remove = (b) => confirmDelete(`${b.created_at} 백업 파일을 삭제할까요?`, () => api.del(`/backups/${encodeURIComponent(b.name)}`)).then((ok) => ok && load());

  return (
    <>
      <PageHeader title="백업·복원" desc="데이터 전체를 파일로 백업하고, 필요하면 그 시점으로 되돌립니다.">
        <button className="btn primary" onClick={backupNow} disabled={busy}>{busy ? '백업 중…' : '지금 백업'}</button>
      </PageHeader>

      <Card title="백업 방식">
        <ul className="info-list">
          <li><strong>자동 백업</strong>: 서버가 켜져 있으면 하루 한 번 자동으로 백업하고, 최근 30개를 보관합니다.</li>
          <li><strong>수동 백업</strong>: 큰 작업(결산, 대량 입력) 전에 '지금 백업'을 눌러 두세요. 자동으로 지워지지 않습니다.</li>
          <li><strong>복원</strong>: 복원하기 직전 상태도 자동으로 따로 저장되므로, 잘못 복원해도 다시 되돌릴 수 있습니다.</li>
          <li>
            <strong>저장 위치</strong>: <code>{data.dir}</code>
            <br />
            <span className="warn">서버가 고장 나면 서버 안의 백업도 함께 사라질 수 있습니다. 한 달에 한 번은 '다운로드'로 받아 USB나 클라우드 드라이브에 따로 보관하세요.</span>
          </li>
          <li>
            <strong>마지막으로 내려받은 날</strong>:{' '}
            {data.reminder?.lastDownload ? `${data.reminder.lastDownload.slice(0, 10)} (${data.reminder.days}일 전)` : '아직 없음'}
            {data.reminder?.due && <span className="warn"> · 대시보드에 알림이 뜹니다. 최근 백업을 내려받아 주세요.</span>}
          </li>
        </ul>
      </Card>

      <Card title={`백업 파일 (${data.list.length}개)`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>백업 시각</th><th>종류</th><th className="num">크기</th><th /></tr>
            </thead>
            <tbody>
              {data.list.map((b) => (
                <tr key={b.name}>
                  <td>{b.created_at}</td>
                  <td><Badge tone={KIND[b.kind][1]}>{KIND[b.kind][0]}</Badge></td>
                  <td className="num">{size(b.size)}</td>
                  <td className="row-actions">
                    <a className="btn sm" href={withChurch(`/api/backups/${encodeURIComponent(b.name)}/download`)} download>다운로드</a>
                    <button className="btn sm" onClick={() => restore(b)}>이 시점으로 복원</button>
                    <button className="btn sm danger" onClick={() => remove(b)}>삭제</button>
                  </td>
                </tr>
              ))}
              {!data.list.length && <tr><td colSpan="4" className="empty">백업 파일이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
