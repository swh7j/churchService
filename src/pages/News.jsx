import { useState } from 'react';
import { api, saveRow } from '../api';
import { Badge, Card, confirmDelete, Form, Modal, PageHeader, useList } from '../components';
import { today } from '../utils';

const CATS = ['공지', '소식', '행사', '기도제목'];
const TONE = { 공지: 'red', 소식: 'blue', 행사: 'green', 기도제목: 'amber' };
const FIELDS = [
  { name: 'title', label: '제목', required: true, full: true },
  { name: 'category', label: '분류', type: 'select', options: CATS },
  { name: 'date', label: '게시일', type: 'date' },
  { name: 'pinned', label: '상단에 고정', type: 'checkbox' },
  { name: 'is_public', label: '성도 화면에 공개', type: 'checkbox' },
  { name: 'content', label: '내용', type: 'textarea', rows: 8, full: true },
];

export default function News() {
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const { rows, reload } = useList('/news', { category: cat, q });
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);

  const save = async (v) => {
    await saveRow('news', v);
    setEditing(null);
    reload();
  };
  const remove = (n) => confirmDelete(`'${n.title}' 소식을 삭제할까요?`, () => api.del(`/news/${n.id}`)).then((ok) => ok && reload());

  return (
    <>
      <PageHeader title="교회 소식" desc="공지, 소식, 기도제목을 올리고 관리합니다.">
        <button className="btn primary" onClick={() => setEditing({ date: today(), category: '공지', pinned: 0, is_public: 1 })}>+ 소식 작성</button>
      </PageHeader>
      <Card>
        <div className="toolbar">
          <div className="seg">
            <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>전체</button>
            {CATS.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <input className="search" placeholder="제목·내용 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="news-list">
          {rows.map((n) => (
            <article key={n.id} className={'news-item' + (n.pinned ? ' pinned' : '')}>
              <div className="news-head">
                <button className="news-title" onClick={() => setOpen(open === n.id ? null : n.id)} aria-expanded={open === n.id}>
                  {!!n.pinned && <Badge tone="red">고정</Badge>} {n.category && <Badge tone={TONE[n.category]}>{n.category}</Badge>} {!n.is_public && <Badge>비공개</Badge>} {n.title}
                </button>
                <span className="muted small">{n.date}</span>
              </div>
              <p className={'news-body' + (open === n.id ? ' open' : '')}>{n.content}</p>
              <div className="row-actions">
                <button className="btn sm" onClick={() => setEditing(n)}>수정</button>
                <button className="btn sm danger" onClick={() => remove(n)}>삭제</button>
              </div>
            </article>
          ))}
          {!rows.length && <p className="empty">등록된 소식이 없습니다.</p>}
        </div>
      </Card>
      {editing && (
        <Modal title={editing.id ? '소식 수정' : '소식 작성'} onClose={() => setEditing(null)} wide>
          <Form fields={FIELDS} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
