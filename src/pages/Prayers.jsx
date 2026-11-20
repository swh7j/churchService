// 성도 화면 익명 기도제목 관리: 비밀번호를 잊은 글, 부적절한 글을 비밀번호 없이 삭제
import { api } from '../api';
import { Card, confirmDelete, PageHeader, useList } from '../components';

export default function Prayers() {
  const { rows, reload } = useList('/prayers');
  const remove = (p) =>
    confirmDelete(`이 기도제목을 삭제할까요? 성도 화면에서도 바로 사라집니다.\n\n${p.content.slice(0, 80)}`, () => api.del(`/prayers/${p.id}`)).then(
      (ok) => ok && reload(),
    );

  return (
    <>
      <PageHeader title="기도제목 게시판" desc={`성도 화면에서 익명으로 올린 기도제목 ${rows.length}개`}>
        <a className="btn" href="/prayers" target="_blank" rel="noreferrer">성도 화면에서 보기 ↗</a>
      </PageHeader>
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>올린 때</th>
                <th>이름</th>
                <th>기도제목</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{p.created_at?.slice(0, 16)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{p.nickname || '익명'}</td>
                  <td style={{ whiteSpace: 'pre-wrap', minWidth: 220 }}>{p.content}</td>
                  <td className="row-actions">
                    <button className="btn sm danger" onClick={() => remove(p)}>강제 삭제</button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan="4" className="empty">올라온 기도제목이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="muted small">작성자는 글을 올릴 때 정한 비밀번호로 직접 지울 수 있습니다. 비밀번호를 잊었거나 부적절한 글은 여기서 지우세요. 지운 내용은 활동 기록에 남습니다.</p>
      </Card>
    </>
  );
}
