// 전체 관리자: 모든 교회의 요청·제보 게시판을 한곳에서 보고 답변
import { api } from '../api';
import { confirmDelete, PageHeader, useList } from '../components';
import { RequestList } from '../pages/Requests';

export default function PlatformRequests() {
  const { rows, reload, loading } = useList('/platform/requests');
  const save = async (r, v) => {
    await api.put(`/platform/requests/${r.church}/${r.id}`, v);
    reload();
  };
  const remove = (r) =>
    confirmDelete(`${r.church_name}의 이 요청을 삭제할까요? 성도 화면에서도 바로 사라집니다.\n\n${r.title ?? '비밀 요청'}`, () => api.del(`/platform/requests/${r.church}/${r.id}`)).then(
      (ok) => ok && reload(),
    );
  return (
    <>
      <PageHeader title="요청·제보 게시판" desc="모든 교회 성도 화면에서 올라온 악보 요청·오류 제보입니다. 답변은 그 교회 성도 화면에 '전체 관리자 답변'으로 보입니다." />
      <RequestList rows={rows} loading={loading} showChurch onSave={save} onDelete={remove} />
    </>
  );
}
