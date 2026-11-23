// 교회 앨범 관리: 앨범을 만들고 행사 사진을 여러 장 한 번에 올림 → 성도 화면 '교회 소식 → 교회 앨범'
import { useEffect, useState } from 'react';
import { api } from '../api';
import { withChurch } from '../church';
import { Badge, Card, confirmDelete, Form, Loading, Modal, PageHeader, useList } from '../components';
import { kdate, today } from '../utils';
import { coverUrl, mb, photoUrl, shrink } from './album/photo';

const FIELDS = [
  { name: 'title', label: '앨범 제목', required: true, full: true, placeholder: '예) 2026 추수감사절 예배' },
  { name: 'date', label: '날짜', type: 'date', required: true },
  { name: 'is_public', label: '성도 화면에 공개', type: 'checkbox' },
  { name: 'description', label: '설명 (선택)', type: 'textarea', full: true, rows: 3 },
];

export default function Albums() {
  const { rows, reload, loading } = useList('/albums');
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);

  const save = async (v) => {
    const body = { ...v, is_public: Number(v.is_public) ? 1 : 0 };
    const r = v.id ? await api.put(`/albums/${v.id}`, body) : await api.post('/albums', body);
    setEditing(null);
    await reload();
    if (!v.id) setOpenId(r.id); // 새 앨범이면 바로 사진 올리기 화면으로
  };
  const total = rows.reduce((s, a) => s + Number(a.size || 0), 0);

  return (
    <>
      <PageHeader title="교회 앨범" desc="행사 사진을 앨범으로 올리면 성도 화면 '교회 소식 → 교회 앨범'에 보입니다. 사진은 올릴 때 자동으로 줄여서 저장합니다.">
        <button className="btn primary" onClick={() => setEditing({ date: today(), title: '', is_public: 1 })}>+ 앨범 만들기</button>
      </PageHeader>
      {loading && !rows.length ? (
        <Loading />
      ) : (
        <Card title={rows.length ? `앨범 ${rows.length}개 · 사진 ${rows.reduce((s, a) => s + a.count, 0)}장 (${mb(total)})` : undefined}>
          {rows.length ? (
            <div className="album-grid">
              {rows.map((a) => (
                <button key={a.id} className="album-card" onClick={() => setOpenId(a.id)}>
                  <span className="album-cover">
                    {coverUrl(a) ? <img src={coverUrl(a)} alt="" loading="lazy" /> : <span className="album-empty">사진 없음</span>}
                  </span>
                  <span className="album-meta">
                    <strong>{!a.is_public && <Badge>비공개</Badge>} {a.title}</strong>
                    <span className="muted small">{kdate(a.date)} · {a.count}장</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty">아직 앨범이 없습니다. '앨범 만들기'로 시작하세요.</p>
          )}
        </Card>
      )}
      {editing && (
        <Modal title={editing.id ? '앨범 정보 수정' : '앨범 만들기'} onClose={() => setEditing(null)}>
          <Form fields={FIELDS} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} submitLabel={editing.id ? '저장' : '만들고 사진 올리기'} />
        </Modal>
      )}
      {openId && !editing && (
        <AlbumDetail
          id={openId}
          onClose={() => {
            setOpenId(null);
            reload();
          }}
          onEdit={(a) => setEditing(a)}
          onDeleted={() => {
            setOpenId(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function AlbumDetail({ id, onClose, onEdit, onDeleted }) {
  const [a, setA] = useState(null);
  const [progress, setProgress] = useState(null); // { done, total, failed: [] }
  const load = () => api.get(`/albums/${id}`).then(setA).catch((e) => alert(e.message));
  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const failed = [];
    setProgress({ done: 0, total: files.length, failed });
    // 한 장씩 차례로 (작은 서버에 무리가 가지 않게)
    for (let i = 0; i < files.length; i++) {
      try {
        const s = await shrink(files[i]);
        await api.post(`/albums/${id}/photos`, s);
      } catch (err) {
        failed.push(`${files[i].name}: ${err.message}`);
        if (/저장 공간|300장/.test(err.message)) break;
      }
      setProgress({ done: i + 1, total: files.length, failed: [...failed] });
      if ((i + 1) % 5 === 0 || i === files.length - 1) await load();
    }
    await load();
    setProgress((p) => (p && p.failed.length ? p : null));
  };

  const removePhoto = (p) => confirmDelete('이 사진을 삭제할까요?', () => api.del(`/albums/${id}/photos/${p.id}`)).then((ok) => ok && load());
  const setCover = async (p) => {
    try {
      await api.put(`/albums/${id}`, { ...a, cover_id: p.id });
      load();
    } catch (err) {
      alert(err.message);
    }
  };
  const removeAlbum = () =>
    confirmDelete(`'${a.title}' 앨범과 사진 ${a.count}장을 모두 삭제할까요?`, () => api.del(`/albums/${id}`)).then((ok) => ok && onDeleted());

  const busy = progress && progress.done < progress.total;
  const coverId = a && (a.cover_id || a.photos[0]?.id);

  return (
    <Modal title={a ? `${kdate(a.date)} · ${a.title}` : '앨범'} onClose={() => !busy && onClose()} wide>
      {!a ? (
        <Loading />
      ) : (
        <>
          <div className="album-toolbar">
            <span className="muted small">
              {!a.is_public && <Badge>비공개</Badge>} 사진 {a.count}장 · {mb(a.size)}
              {a.description && <> · {a.description}</>}
            </span>
            <span className="album-actions">
              <label className={'btn primary' + (busy ? ' disabled' : '')}>
                <input type="file" accept="image/*" multiple hidden onChange={upload} disabled={busy} />+ 사진 올리기
              </label>
              <button className="btn" onClick={() => onEdit(a)} disabled={busy}>정보 수정</button>
              {a.count > 0 && <a className="btn" href={withChurch(`/api/albums/${id}/zip`)}>사진 모두 내려받기</a>}
              <button className="btn danger" onClick={removeAlbum} disabled={busy}>앨범 삭제</button>
            </span>
          </div>

          {progress && (
            <div className="album-progress">
              {busy ? `사진 줄여서 올리는 중… ${progress.done} / ${progress.total}장` : `올리기 끝 (${progress.done - progress.failed.length}장 성공)`}
              <span className="bar"><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></span>
              {progress.failed.length > 0 && (
                <ul className="album-failed">
                  {progress.failed.map((f, i) => <li key={i}>{f}</li>)}
                  {!busy && <li><button className="link" onClick={() => setProgress(null)}>닫기</button></li>}
                </ul>
              )}
            </div>
          )}

          {a.photos.length ? (
            <div className="photo-grid">
              {a.photos.map((p) => (
                <div key={p.id} className="photo-cell">
                  <a href={photoUrl(id, p)} target="_blank" rel="noreferrer">
                    <img src={photoUrl(id, p, { thumb: true })} alt="" loading="lazy" />
                  </a>
                  {p.id === coverId && <span className="photo-cover-tag">대표</span>}
                  <span className="photo-tools">
                    {p.id !== coverId && <button className="btn sm" onClick={() => setCover(p)} title="대표 사진으로">★</button>}
                    <button className="btn sm danger" onClick={() => removePhoto(p)} title="삭제" aria-label="사진 삭제">×</button>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            !progress && <p className="empty">'사진 올리기'를 눌러 사진을 여러 장 한 번에 고르세요. 휴대폰에서도 됩니다.</p>
          )}
          <p className="muted small">사진은 긴 쪽 1600px로 줄여서 저장합니다(한 장 약 0.3MB). 앨범 하나에 300장까지 올릴 수 있습니다. 원본은 따로 보관해 주세요.</p>
        </>
      )}
    </Modal>
  );
}
