import { useState } from 'react';
import { api, saveRow } from '../api';
import { Badge, Card, confirmDelete, Form, Modal, PageHeader, useList } from '../components';
import { downloadCSV, today } from '../utils';

export const POSITIONS = ['목사', '전도사', '장로', '권사', '안수집사', '집사', '성도', '청년', '학생', '아동'];
export const STATUSES = ['재적', '새가족', '장기결석', '전출', '별세'];
const STATUS_TONE = { 재적: 'green', 새가족: 'blue', 장기결석: 'amber', 전출: 'gray', 별세: 'gray' };
const birthText = (m) => (m.birth_month && m.birth_day ? `${m.birth_month}월 ${m.birth_day}일` : '');

const FIELDS = [
  { name: 'name', label: '이름', required: true },
  { name: 'gender', label: '성별', type: 'select', options: ['남', '여'] },
  { name: 'birth_month', label: '생일 (월)', type: 'select', options: Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}월` })) },
  { name: 'birth_day', label: '생일 (일)', type: 'select', options: Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `${i + 1}일` })) },
  { name: 'birth_lunar', label: '양력 / 음력', type: 'select', empty: '양력', options: [{ value: 1, label: '음력' }] },
  { name: 'birth_date', label: '생년월일 (선택, 연도까지 알 때)', type: 'date', help: '입력하면 생일 월·일이 비어 있을 때 자동으로 채워집니다.' },
  { name: 'birthday_public', label: '성도 화면에 생일 공개 (본인 동의 시, 월·일만 표시)', type: 'checkbox', full: true },
  { name: 'phone', label: '연락처', placeholder: '010-0000-0000' },
  { name: 'email', label: '이메일', type: 'email' },
  { name: 'position', label: '직분', type: 'select', options: POSITIONS },
  { name: 'district', label: '구역 / 셀', placeholder: '예: 1구역, 청년부' },
  { name: 'household', label: '가족 (세대주 이름)', help: '같은 가족은 세대주 이름을 똑같이 적어 주세요.' },
  { name: 'status', label: '상태', type: 'select', options: STATUSES, required: true },
  { name: 'registered_date', label: '등록일', type: 'date' },
  { name: 'baptism', label: '세례', type: 'select', options: ['학습', '유아세례', '세례', '입교'] },
  { name: 'address', label: '주소', full: true },
  { name: 'memo', label: '메모 (심방 기록 등)', type: 'textarea', full: true },
];

export default function Members() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [position, setPosition] = useState('');
  const { rows, reload } = useList('/members', { q, status, position });
  const [editing, setEditing] = useState(null);

  const save = async (v) => {
    const d = { ...v, birth_lunar: Number(v.birth_lunar || 0), birthday_public: Number(v.birthday_public || 0) };
    // 생년월일만 입력했으면 생일 월·일을 거기서 채움
    if (d.birth_date && !d.birth_month) {
      d.birth_month = Number(d.birth_date.slice(5, 7));
      d.birth_day = Number(d.birth_date.slice(8, 10));
    }
    if (!!d.birth_month !== !!d.birth_day) throw new Error('생일은 월과 일을 모두 선택해 주세요.');
    await saveRow('members', d);
    setEditing(null);
    reload();
  };
  const remove = (m) =>
    confirmDelete(`${m.name} 님의 정보를 삭제할까요?\n(헌금 기록은 남고, 출석 기록은 함께 삭제됩니다)`, () => api.del(`/members/${m.id}`)).then(
      (ok) => ok && reload(),
    );
  const exportCsv = () =>
    downloadCSV(
      `교인명부_${today()}.csv`,
      ['이름', '성별', '생일', '음력', '생일 공개', '생년월일', '연락처', '이메일', '직분', '구역/셀', '가족', '상태', '등록일', '세례', '주소', '메모'],
      rows.map((m) => [m.name, m.gender, birthText(m), m.birth_lunar ? '음력' : '', m.birthday_public ? '공개' : '', m.birth_date, m.phone, m.email, m.position, m.district, m.household, m.status, m.registered_date, m.baptism, m.address, m.memo]),
    );

  return (
    <>
      <PageHeader title="교인 관리" desc={`조회된 교인 ${rows.length}명`}>
        <button className="btn" onClick={exportCsv}>엑셀(CSV) 내보내기</button>
        <button className="btn primary" onClick={() => setEditing({ status: '재적', registered_date: today(), birth_lunar: 0, birthday_public: 0 })}>
          + 교인 등록
        </button>
      </PageHeader>
      <Card>
        <div className="toolbar">
          <input className="search" placeholder="이름, 연락처, 구역, 가족, 주소로 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">전체 상태</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="">전체 직분</option>
            {POSITIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>직분</th>
                <th>구역/셀</th>
                <th>가족</th>
                <th>연락처</th>
                <th>생일</th>
                <th>등록일</th>
                <th>상태</th>
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <button className="link" onClick={() => setEditing(m)}>{m.name}</button>
                    {m.gender && <span className="muted small"> ({m.gender})</span>}
                  </td>
                  <td>{m.position}</td>
                  <td>{m.district}</td>
                  <td>{m.household}</td>
                  <td>{m.phone}</td>
                  <td className="nowrap">
                    {birthText(m)}
                    {m.birth_month && m.birth_lunar ? <span className="muted small"> (음)</span> : null}
                    {m.birthday_public ? <> <Badge tone="blue">공개</Badge></> : null}
                  </td>
                  <td>{m.registered_date}</td>
                  <td><Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge></td>
                  <td className="row-actions no-print">
                    <button className="btn sm" onClick={() => setEditing(m)}>수정</button>
                    <button className="btn sm danger" onClick={() => remove(m)}>삭제</button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan="9" className="empty">조건에 맞는 교인이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && (
        <Modal title={editing.id ? `교인 정보 수정 · ${editing.name}` : '교인 등록'} onClose={() => setEditing(null)} wide>
          <Form fields={FIELDS} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
