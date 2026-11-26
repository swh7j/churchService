import { useContext, useEffect, useState } from 'react';
import { api, saveRow } from '../api';
import { AppCtx, Badge, Card, confirmDelete, Modal, PageHeader, useList } from '../components';
import { addDays, kdate, nextSunday } from '../utils';
import BulletinSheets, { FlipBackOption } from './bulletin/BulletinSheets';
import { BulletinEditor, TemplateEditor } from './bulletin/Editors';
import { parseLayout, parseTemplate } from './bulletin/layout';
import WorshipPpt from './bulletin/WorshipPpt';

export default function Bulletins() {
  const { settings } = useContext(AppCtx);
  const { rows, reload } = useList('/bulletins');
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [template, setTemplate] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [ppt, setPpt] = useState(null);
  const church = settings.church_name || '우리교회';

  useEffect(() => {
    api.get('/bulletin-template').then((r) => setTemplate(parseTemplate(r.template))).catch(() => setTemplate(parseTemplate('')));
  }, []);

  // 편집할 때는 layout 을 객체로 다룸
  const edit = (b) => setEditing({ ...b, layout: parseLayout(b.layout) });
  const save = async (v) => {
    const r = await saveRow('bulletins', v);
    setEditing(null);
    reload();
    setViewing(r);
  };
  const saveTemplate = async (t) => {
    await api.put('/bulletin-template', { template: JSON.stringify(t) });
    setTemplate(t);
    setEditingTemplate(false);
  };
  const remove = (b) => confirmDelete(`${b.date} 주보를 삭제할까요?`, () => api.del(`/bulletins/${b.id}`)).then((ok) => ok && reload());
  // 지난 주보를 바탕으로 다음 주 주보 (헌금자 명단·교회 소식·메모는 비움, 권·주는 자동 계산으로)
  const copy = (b) => {
    const { id: _id, ...rest } = b; // 번호는 빼고 복사 (새 주보로 저장)
    const layout = parseLayout(b.layout);
    edit({ ...rest, date: addDays(b.date, 7), announcements: '', offering_names: '', memo: '', layout: { ...layout, vol: '', week: '' } });
  };

  return (
    <>
      <PageHeader title="주보 관리" desc="4면 주보(A4 가로)를 작성하고 인쇄하거나 PDF로 저장합니다.">
        <button className="btn" onClick={() => setEditingTemplate(true)} disabled={!template}>주보 기본 정보</button>
        <button className="btn primary" onClick={() => edit({ date: nextSunday(), title: '', is_public: 1 })}>
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
                    <button className="btn sm" onClick={() => setPpt(b)} title="서식 PPT에 이 주보 내용을 채워 내려받기">예배 PPT</button>
                    <button className="btn sm" onClick={() => edit(b)}>수정</button>
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

      {editing && template && (
        <Modal title={editing.id ? '주보 수정' : '주보 작성'} onClose={() => setEditing(null)} wide>
          <BulletinEditor initial={editing} template={template} onSave={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {ppt && (
        <Modal title={`예배 PPT 만들기 · ${kdate(ppt.date)}`} onClose={() => setPpt(null)} wide>
          <WorshipPpt b={ppt} fixed={template} />
        </Modal>
      )}
      {editingTemplate && (
        <Modal title="주보 기본 정보 (매주 바뀌지 않는 내용)" onClose={() => setEditingTemplate(false)} wide>
          <TemplateEditor initial={template} onSave={saveTemplate} onCancel={() => setEditingTemplate(false)} />
        </Modal>
      )}
      {viewing && template && (
        <Modal title="주보 미리보기" onClose={() => setViewing(null)} wide>
          <div className="form-actions no-print top">
            <span className="muted small be-print-tip">인쇄 창에서 용지 A4·가로, '배경 그래픽' 켜기 → PDF로 저장도 가능</span>
            {viewing.layout && <FlipBackOption />}
            <button className="btn" onClick={() => { edit(viewing); setViewing(null); }}>수정</button>
            <button className="btn primary" onClick={() => window.print()}>인쇄</button>
          </div>
          {viewing.layout ? (
            <div className="bp-preview">
              <BulletinSheets b={viewing} t={template} L={parseLayout(viewing.layout)} church={church} />
            </div>
          ) : (
            <BulletinView b={viewing} church={church} />
          )}
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
