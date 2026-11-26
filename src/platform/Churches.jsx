// 교회 관리 (전체 관리자): 교회 등록, 이름 변경, 사용 중지, 첫 관리자 등록 코드 안내
import { useState } from 'react';
import { api } from '../api';
import { askConfirm, Badge, Card, Form, Modal, PageHeader, useList } from '../components';

const FIELDS = [
  { name: 'name', label: '교회 이름', required: true, full: true, placeholder: '예) 사랑의교회' },
  { name: 'code', label: '주소 코드 (영문 소문자·숫자·-)', required: true, full: true, placeholder: '예) sarang → 주소 /c/sarang' },
];

const siteUrl = (code, admin) => `${window.location.origin}/c/${code}${admin ? '/admin' : ''}`;

function copy(text) {
  navigator.clipboard?.writeText(text).then(
    () => alert('복사했습니다.'),
    () => window.prompt('아래 내용을 복사해 주세요.', text),
  );
}

/** 새 교회 담당자에게 보낼 안내 글 */
const guide = (c) =>
  `[${c.name}] 교회 관리 시스템 안내\n\n관리자 화면: ${siteUrl(c.code, true)}\n등록 코드: ${c.setup_code}\n\n관리자 화면에 들어가서 등록 코드와 함께 관리자 계정(아이디·비밀번호)을 만들어 주세요.\n성도 화면: ${siteUrl(c.code)}\n\n처음 하실 일\n1. 주보 → 주보 기본 정보에 표어·사명선언문·담임목사 등을 넣어 주세요. 종이 주보와 예배 PPT에 같이 들어갑니다.\n2. 예배 PPT는 공통 양식으로 바로 만들 수 있고, 교회 양식이 있으면 올려서 쓸 수 있습니다.\n3. 휴대폰에서는 '휴대폰 확인용 PDF' 버튼으로 잘 만들어졌는지 먼저 확인해 주세요.`;

export default function Churches() {
  const { rows, reload } = useList('/platform/churches');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [created, setCreated] = useState(null);

  const create = async (v) => {
    const c = await api.post('/platform/churches', { name: v.name, code: v.code.trim().toLowerCase() });
    setAdding(false);
    setCreated(c);
    reload();
  };
  const rename = async (v) => {
    await api.put(`/platform/churches/${editing.code}`, { name: v.name });
    setEditing(null);
    reload();
  };
  const toggle = async (c) => {
    const msg = c.active
      ? `'${c.name}' 사용을 중지할까요?\n\n그 교회의 성도 화면과 관리자 화면에 들어갈 수 없게 됩니다. 데이터는 지워지지 않고, 다시 사용하게 할 수 있습니다.`
      : `'${c.name}' 을(를) 다시 사용하게 할까요?`;
    if (!(await askConfirm(msg, { ok: c.active ? '중지' : '다시 사용', danger: c.active }))) return;
    try {
      await api.put(`/platform/churches/${c.code}`, { active: c.active ? 0 : 1 });
      reload();
    } catch (e) {
      alert(e.message);
    }
  };
  const newCode = async (c) => {
    try {
      setCreated(await api.post(`/platform/churches/${c.code}/setup-code`));
      reload();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <>
      <PageHeader title="교회 관리" desc="이 시스템을 쓰는 교회를 등록합니다. 교회마다 데이터가 따로 저장됩니다.">
        <button className="btn primary" onClick={() => setAdding(true)}>+ 교회 등록</button>
      </PageHeader>
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>교회</th><th>주소</th><th>상태</th><th>등록일</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.code}>
                  <td>
                    <strong>{c.name}</strong> {c.platform && <Badge tone="blue">운영 교회</Badge>}
                  </td>
                  <td className="small"><a href={siteUrl(c.code)} target="_blank" rel="noreferrer">/c/{c.code}</a></td>
                  <td>
                    {!c.active ? <Badge tone="amber">중지</Badge> : c.users ? <Badge tone="green">사용 중 · 계정 {c.users}개</Badge> : <Badge>관리자 계정 만들기 전</Badge>}
                  </td>
                  <td className="small">{String(c.created_at || '').slice(0, 10)}</td>
                  <td className="row-actions">
                    {c.setup_code && <button className="btn sm" onClick={() => setCreated(c)}>등록 안내</button>}
                    {!c.users && !c.platform && !c.setup_code && <button className="btn sm" onClick={() => newCode(c)}>등록 코드 새로</button>}
                    <button className="btn sm" onClick={() => setEditing(c)}>이름 변경</button>
                    {!c.platform && <button className={'btn sm' + (c.active ? ' danger' : '')} onClick={() => toggle(c)}>{c.active ? '사용 중지' : '다시 사용'}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">각 교회의 교인·헌금 정보는 그 교회 관리자만 볼 수 있습니다. 전체 관리자도 다른 교회 데이터는 볼 수 없습니다.</p>
      </Card>

      {adding && (
        <Modal title="교회 등록" onClose={() => setAdding(false)}>
          <Form fields={FIELDS} initial={{}} onSubmit={create} onCancel={() => setAdding(false)} submitLabel="등록" />
        </Modal>
      )}
      {editing && (
        <Modal title="교회 이름 변경" onClose={() => setEditing(null)}>
          <Form fields={FIELDS.slice(0, 1)} initial={{ name: editing.name }} onSubmit={rename} onCancel={() => setEditing(null)} submitLabel="저장" />
        </Modal>
      )}
      {created && (
        <Modal title={`${created.name} 등록 안내`} onClose={() => setCreated(null)}>
          {created.setup_code ? (
            <>
              <p>이 교회 담당자에게 아래 내용을 보내 주세요. 담당자가 관리자 화면에서 <strong>등록 코드</strong>로 직접 관리자 계정을 만듭니다.</p>
              <pre className="church-guide">{guide(created)}</pre>
              <div className="form-actions">
                <button className="btn primary" onClick={() => copy(guide(created))}>안내 글 복사</button>
              </div>
              <p className="muted small">관리자 계정을 만들면 등록 코드는 더 이상 쓸 수 없습니다.</p>
            </>
          ) : (
            <p>이미 관리자 계정이 만들어졌습니다.</p>
          )}
        </Modal>
      )}
    </>
  );
}
