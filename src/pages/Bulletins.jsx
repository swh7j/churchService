import { useContext, useState } from 'react';
import { api, saveRow } from '../api';
import { AppCtx, Badge, Card, confirmDelete, Form, Modal, PageHeader, useList } from '../components';
import { addDays, kdate, nextSunday } from '../utils';

const TEMPLATE = [
  '예배로 부름 ......... 인도자',
  '찬송 ................. 다같이',
  '대표기도 ............. ',
  '성경봉독 ............. 인도자',
  '찬양 ................. 성가대',
  '설교 ................. ',
  '헌금 ................. 다같이',
  '광고 ................. 인도자',
  '축도 ................. ',
].join('\n');

const FIELDS = [
  { name: 'date', label: '예배일', type: 'date', required: true },
  { name: 'title', label: '예배명', placeholder: '예: 주일 예배' },
  { name: 'sermon_title', label: '설교 제목' },
  { name: 'scripture', label: '본문 말씀', placeholder: '예: 요한복음 3:16' },
  { name: 'preacher', label: '설교자' },
  { name: 'worship_order', label: '예배 순서', type: 'textarea', rows: 10, full: true },
  { name: 'announcements', label: '교회 소식 / 광고', type: 'textarea', rows: 6, full: true },
  { name: 'prayer_requests', label: '기도 제목', type: 'textarea', rows: 4, full: true },
  { name: 'memo', label: '내부 메모 (주보에 표시 안 됨)', type: 'textarea', rows: 2, full: true },
  { name: 'is_public', label: '성도 화면에 공개 (예배일 6일 전부터 보임)', type: 'checkbox', full: true },
];

export default function Bulletins() {
  const { settings } = useContext(AppCtx);
  const { rows, reload } = useList('/bulletins');
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const save = async (v) => {
    const r = await saveRow('bulletins', v);
    setEditing(null);
    reload();
    setViewing(r);
  };
  const remove = (b) => confirmDelete(`${b.date} 주보를 삭제할까요?`, () => api.del(`/bulletins/${b.id}`)).then((ok) => ok && reload());
  const copy = (b) => {
    const { id, ...rest } = b;
    setEditing({ ...rest, date: addDays(b.date, 7), sermon_title: '', scripture: '', memo: '' });
  };

  return (
    <>
      <PageHeader title="주보 관리" desc="주보를 작성하고, 인쇄용 화면으로 출력할 수 있습니다.">
        <button className="btn primary" onClick={() => setEditing({ date: nextSunday(), title: '주일 예배', worship_order: TEMPLATE, is_public: 1 })}>
          + 새 주보
        </button>
      </PageHeader>
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>예배일</th><th>예배명</th><th>설교 제목</th><th>본문</th><th>설교자</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td><button className="link" onClick={() => setViewing(b)}>{kdate(b.date)}</button></td>
                  <td>{b.title} {!b.is_public && <Badge>비공개</Badge>}</td>
                  <td>{b.sermon_title}</td>
                  <td>{b.scripture}</td>
                  <td>{b.preacher}</td>
                  <td className="row-actions">
                    <button className="btn sm" onClick={() => setViewing(b)}>보기·인쇄</button>
                    <button className="btn sm" onClick={() => setEditing(b)}>수정</button>
                    <button className="btn sm" onClick={() => copy(b)} title="이 주보를 바탕으로 다음 주 주보 만들기">다음 주로 복사</button>
                    <button className="btn sm danger" onClick={() => remove(b)}>삭제</button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="6" className="empty">작성된 주보가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <Modal title={editing.id ? '주보 수정' : '주보 작성'} onClose={() => setEditing(null)} wide>
          <Form fields={FIELDS} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {viewing && (
        <Modal title="주보 미리보기" onClose={() => setViewing(null)} wide>
          <div className="form-actions no-print top">
            <button className="btn" onClick={() => { setEditing(viewing); setViewing(null); }}>수정</button>
            <button className="btn primary" onClick={() => window.print()}>인쇄</button>
          </div>
          <BulletinView b={viewing} church={settings.church_name || '우리교회'} />
        </Modal>
      )}
    </>
  );
}

export function BulletinView({ b, church }) {
  return (
    <div className="bulletin print-area">
      <header>
        <div className="b-church">{church}</div>
        <div className="b-date">{kdate(b.date)}</div>
        <h1>{b.title || '주일 예배'}</h1>
      </header>
      <div className="b-cols">
        <section>
          <h3>예배 순서</h3>
          <pre>{b.worship_order}</pre>
        </section>
        <section>
          <h3>말씀</h3>
          <div className="b-sermon">
            <div className="b-sermon-title">{b.sermon_title || '-'}</div>
            <div>{b.scripture}</div>
            <div className="muted">{b.preacher}</div>
          </div>
          {b.prayer_requests && (
            <>
              <h3>기도 제목</h3>
              <pre>{b.prayer_requests}</pre>
            </>
          )}
        </section>
      </div>
      {b.announcements && (
        <section>
          <h3>교회 소식</h3>
          <pre>{b.announcements}</pre>
        </section>
      )}
    </div>
  );
}
