// 악보 관리: 사진 여러 장을 골라 순서를 정하면 세로로 이어 붙인 한 장으로 올림
import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Card, confirmDelete, Field, Modal, PageHeader, useList } from '../components';
import { kdate, nextSunday } from '../utils';

const FIELDS = [
  { name: 'title', label: '제목 (곡 이름)', required: true, full: true, placeholder: '예) 주일 찬양 - 은혜 외 3곡' },
  { name: 'date', label: '날짜', type: 'date', required: true },
  { name: 'is_public', label: '성도 화면에 공개', type: 'checkbox' },
];

const WIDTH = 1400; // 합친 사진 폭 (휴대폰 확대해도 음표가 보일 정도)
const MAX_AREA = 16_000_000; // 아이폰 사파리 캔버스 한도 근처

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`'${file.name}' 사진을 읽지 못했습니다.`));
    img.src = URL.createObjectURL(file);
  });

export const LAYOUTS = [
  { cols: 2, label: '4장씩 (2×2)' },
  { cols: 1, label: '한 줄로 세로' },
];

/**
 * pages: [{ img, rot }] → 한 장으로 합친 JPEG data URL
 * cols 2: 2칸씩 줄을 채움 → 4장이면 2×2, 8장이면 2×2 두 묶음이 위아래로
 */
export function mergePages(pages, cols = 2) {
  cols = Math.min(cols, pages.length);
  const GAP = cols > 1 ? 16 : 0;
  const dims = pages.map(({ img, rot }) => (rot % 180 ? [img.height, img.width] : [img.width, img.height]));
  let cell = Math.min(WIDTH, Math.max(...dims.map(([w]) => w)));
  // 줄마다 높이 = 그 줄에서 가장 긴 사진
  const rowHeights = (c) => {
    const rows = [];
    dims.forEach(([w, h], i) => {
      const r = Math.floor(i / cols);
      rows[r] = Math.max(rows[r] || 0, (h * c) / w);
    });
    return rows;
  };
  const size = (c) => [c * cols + GAP * (cols - 1), rowHeights(c).reduce((a, b) => a + b, 0) + GAP * (rowHeights(c).length - 1)];
  let [W, H] = size(cell);
  if (W * H > MAX_AREA) {
    cell *= Math.sqrt(MAX_AREA / (W * H));
    [W, H] = size(cell);
  }
  const rows = rowHeights(cell);
  const c = document.createElement('canvas');
  c.width = Math.round(W);
  c.height = Math.round(H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  let y = 0;
  pages.forEach(({ img, rot }, i) => {
    const r = Math.floor(i / cols);
    const col = i % cols;
    const [w, h0] = dims[i];
    const h = (h0 * cell) / w;
    ctx.save();
    ctx.translate(col * (cell + GAP) + cell / 2, y + h / 2);
    ctx.rotate((rot * Math.PI) / 180);
    // 돌린 뒤 그릴 크기: 90·270도면 가로·세로가 바뀜
    const [dw, dh] = rot % 180 ? [h, cell] : [cell, h];
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    if (col === cols - 1 || i === pages.length - 1) y += rows[r] + GAP;
  });
  return c.toDataURL('image/jpeg', 0.85);
}

export const sheetImage = (s, pub) => `/api/${pub ? 'public/' : ''}sheets/${s.id}/image?v=${encodeURIComponent(s.updated_at || '')}`;

function SheetEditor({ initial, onSaved, onCancel }) {
  const [v, setV] = useState(initial);
  const [pages, setPages] = useState([]); // [{ key, img, rot }]
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cols, setCols] = useState(2);

  useEffect(() => {
    setPreview(pages.length ? mergePages(pages, cols) : null);
  }, [pages, cols]);

  const add = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    try {
      const imgs = await Promise.all(files.map(loadImage));
      setPages((p) => [...p, ...imgs.map((img) => ({ key: Math.random(), img, rot: 0 }))]);
    } catch (err) {
      alert(err.message);
    }
  };
  const move = (i, d) =>
    setPages((p) => {
      const n = [...p];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  const rotate = (i) => setPages((p) => p.map((x, j) => (j === i ? { ...x, rot: (x.rot + 90) % 360 } : x)));
  const drop = (i) => setPages((p) => p.filter((_, j) => j !== i));

  const save = async (e) => {
    e.preventDefault();
    if (!v.id && !preview) return alert('악보 사진을 골라 주세요.');
    setBusy(true);
    try {
      const body = { ...v, ...(preview ? { image: preview, pages: pages.length } : {}) };
      const r = v.id ? await api.put(`/sheets/${v.id}`, body) : await api.post('/sheets', body);
      onSaved(r);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save}>
      <div className="form-grid">
        {FIELDS.map((f) => (
          <Field key={f.name} f={f} value={v[f.name]} onChange={(x) => setV((s) => ({ ...s, [f.name]: x }))} />
        ))}
      </div>

      <div className="sheet-layout">
        <span className="muted small">합치는 방식</span>
        <div className="seg">
          {LAYOUTS.map((l) => (
            <button key={l.cols} type="button" className={cols === l.cols ? 'on' : ''} onClick={() => setCols(l.cols)}>{l.label}</button>
          ))}
        </div>
      </div>
      <div className="sheet-pages">
        {pages.map((p, i) => (
          <div key={p.key} className="sheet-page">
            <div className="sheet-thumb">
              <img src={p.img.src} alt={`${i + 1}장`} style={{ transform: `rotate(${p.rot}deg)` }} />
            </div>
            <div className="sheet-page-bar">
              <strong>{i + 1}</strong>
              <button type="button" className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="앞으로">↑</button>
              <button type="button" className="btn sm" onClick={() => move(i, 1)} disabled={i === pages.length - 1} aria-label="뒤로">↓</button>
              <button type="button" className="btn sm" onClick={() => rotate(i)} aria-label="돌리기">⟳</button>
              <button type="button" className="btn sm danger" onClick={() => drop(i)} aria-label="빼기">×</button>
            </div>
          </div>
        ))}
        <label className="sheet-add">
          <input type="file" accept="image/*" multiple onChange={add} hidden />
          + 사진 {pages.length ? '더 ' : ''}고르기
          <span className="muted small">{v.id && !pages.length ? '고르면 지금 사진을 바꿉니다' : '여러 장을 한 번에 고를 수 있습니다'}</span>
        </label>
      </div>

      {(preview || v.id) && (
        <div className="sheet-preview">
          <div className="muted small">{preview ? `합친 모습 (${pages.length}장 → 한 장)` : '지금 올라가 있는 악보'}</div>
          <img src={preview || sheetImage(v)} alt="합친 악보 미리보기" />
        </div>
      )}

      <p className="muted small">4장씩은 2×2로 한 장에 담고, 5장부터는 다음 4장이 아래에 이어집니다. ↑↓로 순서를, ⟳로 방향을 바꿀 수 있습니다. 찬양 악보는 저작권이 있는 경우가 많으니, 교회 안에서 예배용으로만 쓰도록 안내해 주세요.</p>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>취소</button>
        <button className="btn primary" disabled={busy}>{busy ? '올리는 중…' : '저장'}</button>
      </div>
    </form>
  );
}

export default function Sheets() {
  const { rows, reload } = useList('/sheets');
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const saved = (r) => {
    setEditing(null);
    reload();
    setViewing(r);
  };
  const remove = (s) => confirmDelete(`'${s.title}' 악보를 삭제할까요?`, () => api.del(`/sheets/${s.id}`)).then((ok) => ok && reload());

  return (
    <>
      <PageHeader title="악보" desc="악보 사진 여러 장을 한 장으로 합쳐 성도 화면에 올립니다.">
        <button className="btn primary" onClick={() => setEditing({ date: nextSunday(), title: '', is_public: 1 })}>+ 악보 올리기</button>
      </PageHeader>
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>날짜</th><th>제목</th><th>장 수</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td style={{ whiteSpace: 'nowrap' }}><button className="link" onClick={() => setViewing(s)}>{kdate(s.date)}</button></td>
                  <td>{!s.is_public && <Badge>비공개</Badge>} {s.title}</td>
                  <td>{s.pages}장</td>
                  <td className="row-actions">
                    <button className="btn sm" onClick={() => setViewing(s)}>보기</button>
                    <button className="btn sm" onClick={() => setEditing(s)}>수정</button>
                    <button className="btn sm danger" onClick={() => remove(s)}>삭제</button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan="4" className="empty">올라온 악보가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && (
        <Modal title={editing.id ? '악보 수정' : '악보 올리기'} onClose={() => setEditing(null)} wide>
          <SheetEditor initial={editing} onSaved={saved} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {viewing && (
        <Modal title={`${kdate(viewing.date)} · ${viewing.title}`} onClose={() => setViewing(null)} wide>
          <img className="sheet-full" src={sheetImage(viewing)} alt={viewing.title} />
        </Modal>
      )}
    </>
  );
}
