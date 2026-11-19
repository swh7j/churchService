import { useState } from 'react';
import { Badge, Card, PageHeader, useList } from '../components';
import { downloadCSV, today } from '../utils';

const TARGET = {
  members: '교인', offerings: '헌금', transactions: '회계 장부', categories: '계정과목', offering_types: '헌금 종류',
  services: '예배 종류', small_groups: '소모임', group_transactions: '소모임 장부', news: '교회 소식', bulletins: '주보',
  events: '행사', attendance: '출석', users: '사용자', backups: '백업', settings: '설정', auth: '로그인',
};
const TONE = { 삭제: 'red', 복원: 'red', '계정 삭제': 'red', 수정: 'amber', 등록: 'green' };

export default function Audit() {
  const [q, setQ] = useState('');
  const { rows } = useList('/audit', { q });
  const exportCsv = () =>
    downloadCSV(`활동기록_${today()}.csv`, ['시각', '사용자', '작업', '대상', '번호', '내용'],
      rows.map((r) => [r.at, r.user_name, r.action, TARGET[r.target] || r.target, r.target_id, r.detail]));

  return (
    <>
      <PageHeader title="활동 기록" desc="누가 언제 무엇을 등록·수정·삭제했는지 기록됩니다. 삭제된 내용도 남습니다.">
        <button className="btn" onClick={exportCsv}>엑셀(CSV)</button>
      </PageHeader>
      <Card>
        <div className="toolbar">
          <input className="search" placeholder="사용자, 작업, 내용 검색 (최근 300건)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>시각</th><th>사용자</th><th>작업</th><th>대상</th><th>내용</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap muted">{r.at}</td>
                  <td className="nowrap">{r.user_name || '-'}</td>
                  <td><Badge tone={TONE[r.action]}>{r.action}</Badge></td>
                  <td className="nowrap">{TARGET[r.target] || r.target}{r.target_id && <span className="muted small"> #{r.target_id}</span>}</td>
                  <td className="detail">{r.detail}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="5" className="empty">기록이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
