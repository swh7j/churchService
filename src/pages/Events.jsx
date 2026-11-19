import { useState } from 'react';
import { api, saveRow } from '../api';
import { Badge, Card, confirmDelete, Form, Modal, PageHeader, useList } from '../components';
import { dday, kdate, today } from '../utils';

const FIELDS = [
  { name: 'title', label: '행사명', required: true, full: true },
  { name: 'start_date', label: '시작일', type: 'date', required: true },
  { name: 'end_date', label: '종료일', type: 'date', help: '하루 행사면 비워 두세요.' },
  { name: 'location', label: '장소', full: true },
  { name: 'description', label: '내용', type: 'textarea', rows: 4, full: true },
  { name: 'is_public', label: '성도 화면에 공개', type: 'checkbox', full: true },
];

export default function Events() {
  const [showPast, setShowPast] = useState(false);
  const { rows, reload } = useList('/events');
  const [editing, setEditing] = useState(null);
  const t = today();
  const upcoming = rows.filter((e) => (e.end_date || e.start_date) >= t).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = rows.filter((e) => (e.end_date || e.start_date) < t);
  const list = showPast ? past : upcoming;

  const save = async (v) => {
    await saveRow('events', v);
    setEditing(null);
    reload();
  };
  const remove = (e) => confirmDelete(`'${e.title}' 일정을 삭제할까요?`, () => api.del(`/events/${e.id}`)).then((ok) => ok && reload());

  return (
    <>
      <PageHeader title="행사 일정" desc="교회 행사와 모임 일정을 관리합니다.">
        <button className="btn primary" onClick={() => setEditing({ start_date: t, is_public: 1 })}>+ 일정 추가</button>
      </PageHeader>
      <Card>
        <div className="toolbar">
          <div className="seg">
            <button className={!showPast ? 'on' : ''} onClick={() => setShowPast(false)}>예정 ({upcoming.length})</button>
            <button className={showPast ? 'on' : ''} onClick={() => setShowPast(true)}>지난 일정 ({past.length})</button>
          </div>
        </div>
        <ul className="event-list">
          {list.map((e) => (
            <li key={e.id}>
              <div className="event-date">
                <div className="event-day">{Number(e.start_date.slice(8))}</div>
                <div className="small">{Number(e.start_date.slice(5, 7))}월</div>
              </div>
              <div className="event-info">
                <div className="event-title">
                  {!showPast && <Badge tone="blue">{dday(e.start_date)}</Badge>} {!e.is_public && <Badge>비공개</Badge>} {e.title}
                </div>
                <div className="muted small">
                  {kdate(e.start_date)}
                  {e.end_date && e.end_date !== e.start_date && ` ~ ${kdate(e.end_date)}`}
                  {e.location && ` · ${e.location}`}
                </div>
                {e.description && <div className="small">{e.description}</div>}
              </div>
              <div className="row-actions">
                <button className="btn sm" onClick={() => setEditing(e)}>수정</button>
                <button className="btn sm danger" onClick={() => remove(e)}>삭제</button>
              </div>
            </li>
          ))}
          {!list.length && <li className="empty">{showPast ? '지난 일정이 없습니다.' : '예정된 일정이 없습니다.'}</li>}
        </ul>
      </Card>
      {editing && (
        <Modal title={editing.id ? '일정 수정' : '일정 추가'} onClose={() => setEditing(null)}>
          <Form fields={FIELDS} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
