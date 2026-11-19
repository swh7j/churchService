import { useContext, useState } from 'react';
import { api } from '../api';
import { AppCtx, Badge, Card, confirmDelete, Form, Modal, PageHeader, ROLE_LABELS, useList } from '../components';

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
const ROLE_TONE = { admin: 'red', finance: 'green', staff: 'blue' };

export default function Users() {
  const { user: me } = useContext(AppCtx);
  const { rows, reload } = useList('/users');
  const [editing, setEditing] = useState(null);

  const fields = editing?.id
    ? [
        { name: 'name', label: '이름', required: true },
        { name: 'role', label: '역할', type: 'select', options: ROLE_OPTIONS, required: true },
        { name: 'password', label: '새 비밀번호 (바꿀 때만 입력)', type: 'password', help: '입력하면 이 사용자는 다시 로그인해야 합니다.' },
        { name: 'active', label: '사용 중 (끄면 로그인할 수 없음)', type: 'checkbox' },
      ]
    : [
        { name: 'name', label: '이름', required: true },
        { name: 'username', label: '아이디', required: true, help: '영문·숫자 3~30자' },
        { name: 'role', label: '역할', type: 'select', options: ROLE_OPTIONS, required: true },
        { name: 'password', label: '처음 비밀번호 (8자 이상)', type: 'password', required: true, help: '본인에게 전달하고, 로그인 후 바꾸도록 안내하세요.' },
      ];

  const save = async (v) => {
    if (v.id) await api.put(`/users/${v.id}`, { name: v.name, role: v.role, active: v.active, password: v.password || undefined });
    else await api.post('/users', v);
    setEditing(null);
    reload();
  };
  const remove = (u) =>
    confirmDelete(`${u.name}(${u.username}) 계정을 삭제할까요?\n잠시 막아두려면 삭제 대신 '사용 중'을 끄세요.`, () => api.del(`/users/${u.id}`)).then(
      (ok) => ok && reload(),
    );

  return (
    <>
      <PageHeader title="사용자 관리" desc="시스템에 로그인할 수 있는 사람과 역할을 관리합니다.">
        <button className="btn primary" onClick={() => setEditing({ role: 'staff' })}>+ 사용자 추가</button>
      </PageHeader>

      <Card title="역할별 권한">
        <div className="role-grid">
          <div><Badge tone="red">관리자</Badge><p>모든 기능 + 사용자 관리, 백업·복원, 활동 기록, 설정</p></div>
          <div><Badge tone="green">재정 담당</Badge><p>헌금 입금, 회계 장부, 결산 보고서, 소모임 회계 (교인 정보는 헌금 입력용 조회만)</p></div>
          <div><Badge tone="blue">교역자·사역 담당</Badge><p>교인 관리, 출석, 교회 소식, 주보, 행사 (재정 정보는 볼 수 없음)</p></div>
        </div>
      </Card>

      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>이름</th><th>아이디</th><th>역할</th><th>상태</th><th>마지막 로그인</th><th>등록일</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}{u.id === me.id && <span className="muted small"> (나)</span>}</td>
                  <td>{u.username}</td>
                  <td><Badge tone={ROLE_TONE[u.role]}>{ROLE_LABELS[u.role]}</Badge></td>
                  <td>{u.active ? <Badge tone="green">사용 중</Badge> : <Badge>중지</Badge>}</td>
                  <td className="muted">{u.last_login || '-'}</td>
                  <td className="muted">{u.created_at?.slice(0, 10)}</td>
                  <td className="row-actions">
                    <button className="btn sm" onClick={() => setEditing({ ...u, password: '' })}>수정</button>
                    {u.id !== me.id && <button className="btn sm danger" onClick={() => remove(u)}>삭제</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <Modal title={editing.id ? `사용자 수정 · ${editing.username}` : '사용자 추가'} onClose={() => setEditing(null)}>
          <Form fields={fields} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
