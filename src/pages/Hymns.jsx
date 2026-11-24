// 공용 찬송가 보관함: 찬송가·교독문·경배와 찬양 화면을 모든 교회가 같이 씀
// - 교회 관리자 화면(/hymns): 보기·미리보기만. 예배 PPT를 만들 때 주보의 번호·곡 제목에 맞춰 자동으로 들어감
// - 전체 관리자 화면(/platform/library): 올리기·지우기·제목 고치기·교회 보관함에서 가져오기 (manage)
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { withChurch } from '../church';
import { askConfirm, Card, confirmDelete, Loading, Modal, PageHeader } from '../components';
import { imagesFromFiles, packImages, unpackImages } from './bulletin/pptx';

export const KINDS = {
  hymn: { label: '찬송가', unit: '장', byNo: true },
  reading: { label: '교독문', unit: '번', byNo: true },
  praise: { label: '경배와 찬양', unit: '', byNo: false },
};
const ext = (name) => (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const OK_EXT = ['ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
/** 서버와 같은 열쇠: 띄어쓰기·기호를 빼고 소문자 */
export const songKey = (s) => String(s || '').replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase();

/**
 * 찬송가·교독문 파일 이름 → { no, title }
 *  '301장_지금까지 지내온 것_새찬송가악보_PPT.ppt' → 301, '지금까지 지내온 것'
 *  '찬송가 62장 고요히 머리숙여.pptx' → 62, '고요히 머리숙여'
 *  '301장-2.jpg' → 301 (그림 여러 장은 이름 순서대로 한 곡)
 */
export function parseName(name) {
  const base = name.replace(/\.[^.]+$/, '');
  const m = base.match(/^\D*?(\d{1,4})\s*(장|번)?/);
  if (!m) return null;
  const rest = base.slice(m.index + m[0].length).replace(/^[\s_\-.,)\]]+/, '');
  let title = rest.split('_')[0].trim();
  if (!title || /^\d+$/.test(title) || /ppt|악보|찬송가/i.test(title)) title = '';
  return { no: String(Number(m[1])), title };
}

/**
 * 경배와 찬양 파일 이름 → { no, title }  (번호는 없어도 됨, 제목으로 찾음)
 *  '002_내입술로.ppt' → 2, '내입술로' · '그날.ppt' → '', '그날'
 *  '나_(나가진재물없으나).ppt' → '나 (나가진재물없으나)' · '그날-2.jpg' → '그날' (그림 여러 장)
 */
export function parsePraise(name) {
  let base = name.replace(/\.[^.]+$/, '');
  if (!/^pptx?$/.test(ext(name))) base = base.replace(/[\s_-]+\d{1,2}$/, '');
  const m = base.match(/^(\d{1,4})[\s_.-]+/);
  const title = base.slice(m ? m[0].length : 0).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (!songKey(title)) return null;
  return { no: m ? String(Number(m[1])) : '', title };
}

const natural = (a, b) => a.localeCompare(b, 'ko', { numeric: true });
const mb = (n) => `${(Number(n || 0) / 1024 / 1024).toFixed(1)}MB`;
const enc = encodeURIComponent;
const fileUrl = (manage, r) => (manage ? `/api/platform/library/${r.kind}/${enc(r.key)}/file` : withChurch(`/api/library/${r.kind}/${enc(r.key)}/file`));
const nameOf = (r) => (KINDS[r.kind].byNo ? `${r.no}${KINDS[r.kind].unit}` : r.title);

export default function Hymns({ manage = false }) {
  const [kind, setKind] = useState('hymn');
  const [lib, setLib] = useState(null);
  const [replace, setReplace] = useState(false);
  const [jobs, setJobs] = useState(null); // [{ id, no, title, files, status, msg }]
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState(null);
  const K = KINDS[kind];

  const load = () =>
    api
      .get(manage ? '/platform/library' : '/library')
      .then(setLib)
      .catch((e) => alert(e.message));
  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => (lib || []).filter((r) => r.kind === kind), [lib, kind]);
  const have = useMemo(() => new Set(rows.map((r) => r.key)), [rows]);
  const shown = useMemo(() => {
    const s = q.trim();
    if (!s) return rows;
    return rows.filter((r) => String(r.no || '') === s || String(r.no || '').startsWith(s) || songKey(r.title).includes(songKey(s)));
  }, [rows, q]);
  const busy = jobs?.some((j) => j.status === 'wait' || j.status === 'run');
  const setJob = (id, patch) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  /** 고른 파일들 → 곡별로 묶어서 하나씩 올림 */
  const pick = async (e) => {
    const files = [...e.target.files].sort((a, b) => natural(a.name, b.name));
    e.target.value = '';
    if (!files.length) return;
    const groups = new Map();
    const bad = [];
    for (const f of files) {
      if (f.name.startsWith('~$')) continue; // 파워포인트가 열려 있을 때 생기는 임시 파일
      const p = K.byNo ? parseName(f.name) : parsePraise(f.name);
      if (!OK_EXT.includes(ext(f.name))) bad.push({ id: f.name, label: f.name, files: [], status: 'fail', msg: 'PPT나 그림 파일이 아닙니다.' });
      else if (!p) bad.push({ id: f.name, label: f.name, files: [], status: 'fail', msg: K.byNo ? `파일 이름에 ${K.unit} 번호가 없습니다. 예) 301${K.unit}_제목.ppt` : '파일 이름에 곡 제목이 없습니다.' });
      else {
        const id = K.byNo ? p.no : songKey(p.title);
        const g = groups.get(id) || { id, no: p.no, title: p.title, label: K.byNo ? `${p.no}${K.unit}` : p.title, files: [], dups: [], status: 'wait', msg: '' };
        const isPpt = (x) => /^pptx?$/.test(ext(x.name));
        // 같은 곡 PPT가 두 개면 (번호만 다른 같은 곡 등) 첫 번째만 올림
        if (isPpt(f) && g.files.some(isPpt)) g.dups.push(f.name);
        else g.files.push(f);
        if (!g.title && p.title) g.title = p.title;
        groups.set(id, g);
      }
    }
    const list = [...groups.values()].sort((a, b) => (K.byNo ? Number(a.no) - Number(b.no) : natural(a.title, b.title)));
    for (const g of list) {
      if (!replace && have.has(g.id)) Object.assign(g, { status: 'skip', msg: '이미 있음 (바꾸려면 위의 체크를 켜세요)' });
      else if (g.files.some((f) => /^pptx?$/.test(ext(f.name))) && g.files.length > 1) Object.assign(g, { status: 'fail', msg: 'PPT 파일과 그림을 같은 곡으로 섞어 올릴 수 없습니다.' });
    }
    setJobs([...list, ...bad]);

    for (const g of list) {
      if (g.status !== 'wait') continue;
      setJob(g.id, { status: 'run' });
      try {
        const params = new URLSearchParams();
        if (g.no) params.set('no', g.no);
        if (g.title) params.set('title', g.title);
        let r;
        if (ext(g.files[0].name) === 'ppt') {
          // 옛날 .ppt 는 서버에서 그림을 꺼냄
          const res = await fetch(`/api/platform/library/${kind}/ppt?${params}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: g.files[0] });
          r = await res.json().catch(() => null);
          if (!res.ok) throw new Error(r?.error || '저장하지 못했습니다.');
        } else {
          const { images, skipped } = await imagesFromFiles(g.files);
          if (!images.length) throw new Error('그림을 찾지 못했습니다. 글자로 된 PPT는 파워포인트에서 다른 이름으로 저장 → JPEG 로 그림을 만들어 올려 주세요.');
          const res = await fetch(`/api/platform/library/${kind}?${params}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: await packImages(images) });
          r = await res.json().catch(() => null);
          if (!res.ok) throw new Error(r?.error || '저장하지 못했습니다.');
          r.skipped = skipped;
        }
        setJob(g.id, {
          status: 'done',
          msg: `${r.count}화면 저장` + (r.skipped ? ` (그림 없는 화면 ${r.skipped}개 뺌)` : '') + (g.dups.length ? ` · 같은 곡 파일 ${g.dups.join(', ')} 은 건너뜀` : ''),
        });
      } catch (err) {
        setJob(g.id, { status: 'fail', msg: err.message });
      }
    }
    load();
  };

  const remove = (r) =>
    confirmDelete(`${K.label} ${nameOf(r)} 화면을 지울까요? 모든 교회의 예배 PPT에서 빠집니다.`, () => api.del(`/platform/library/${kind}/${enc(r.key)}`)).then((ok) => ok && load());

  const rename = async (r) => {
    const t = window.prompt(`${K.label} ${r.no}${K.unit} 제목`, r.title || '');
    if (t === null) return;
    await api.put(`/platform/library/${kind}/${enc(r.key)}/title`, { title: t }).catch((e) => alert(e.message));
    load();
  };

  const total = rows.reduce((s, r) => s + Number(r.size || 0), 0);
  const counts = jobs ? { done: jobs.filter((j) => j.status === 'done').length, fail: jobs.filter((j) => j.status === 'fail').length, skip: jobs.filter((j) => j.status === 'skip').length } : null;

  return (
    <>
      <PageHeader
        title="찬송가 보관함"
        desc={
          manage
            ? '모든 교회가 같이 쓰는 찬송가·교독문·경배와 찬양 화면입니다. 여기 올린 곡은 각 교회의 예배 PPT에 자동으로 들어갑니다.'
            : '모든 교회가 같이 쓰는 공용 보관함입니다. 주보 관리 → 예배 PPT를 만들 때 주보에 적힌 번호(예: 301장)나 찬양 제목에 맞춰 해당 화면 바로 뒤에 자동으로 들어갑니다.'
        }
      />
      <div className="tabs">
        {Object.entries(KINDS).map(([k, v]) => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => !busy && (setKind(k), setQ(''))}>{v.label}</button>
        ))}
      </div>

      {manage ? (
        <Card title={`${K.label} 올리기`}>
          <p className="muted small">
            파일을 <strong>여러 개 한 번에</strong> 고르세요.{' '}
            {K.byNo ? (
              <>파일 이름 앞의 번호로 저장합니다. 예) <code>301{K.unit}_지금까지 지내온 것.ppt</code> → {K.label} 301{K.unit}</>
            ) : (
              <>파일 이름의 <strong>곡 제목</strong>으로 저장합니다. 예) <code>002_내입술로.ppt</code>, <code>그날.ppt</code> → 주보에 '내 입술로'라고 쓰면 찾아서 넣음 (띄어쓰기 상관없음)</>
            )}
            <br />
            옛날 파워포인트(.ppt), .pptx, 그림(jpg·png) 모두 됩니다. 그림 여러 장은 이름 끝에 <code>-1</code>, <code>-2</code>… 를 붙여 주세요.
          </p>
          <div className="hymn-upload">
            <label className={'btn primary' + (busy ? ' disabled' : '')}>
              <input type="file" multiple hidden accept=".ppt,.pptx,image/*" onChange={pick} disabled={busy} />+ {K.label} 파일 고르기
            </label>
            <label className="check">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} disabled={busy} /> 이미 있는 곡도 새 파일로 바꾸기
            </label>
          </div>
          {jobs && (
            <div className="hymn-jobs">
              <div className="small">
                {busy ? '올리는 중…' : '끝났습니다.'} 저장 {counts.done} · 건너뜀 {counts.skip} · 실패 {counts.fail}
                {!busy && <button className="link" onClick={() => setJobs(null)}> 닫기</button>}
              </div>
              <ul>
                {jobs.map((j) => (
                  <li key={j.id} className={'job-' + j.status}>
                    <strong>{j.label}</strong>
                    {K.byNo && j.title && <span className="muted">{j.title}</span>}
                    <span className="job-state">{{ wait: '대기', run: '올리는 중…', done: '✓', skip: '건너뜀', fail: '✕' }[j.status]} {j.msg}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ) : (
        <p className="muted small">공용 보관함은 전체 관리자가 관리합니다. 없는 곡이 있으면 전체 관리자에게 파일을 보내 주세요.</p>
      )}

      {manage && <ImportFromChurch onDone={load} />}

      <Card
        title={lib ? `저장된 ${K.label} ${rows.length}곡 (${mb(total)})` : `저장된 ${K.label}`}
        actions={<input className="hymn-search" placeholder={K.byNo ? '번호·제목 찾기' : '제목·번호 찾기'} value={q} onChange={(e) => setQ(e.target.value)} />}
      >
        {!lib ? (
          <Loading />
        ) : shown.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {K.byNo ? <th>번호</th> : <th>곡 제목</th>}
                  {kind === 'hymn' && <th>제목</th>}
                  {kind === 'praise' && <th>번호</th>}
                  <th>화면</th><th>크기</th><th>올린 날</th><th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key}>
                    <td><strong>{nameOf(r)}</strong></td>
                    {kind === 'hymn' && <td>{r.title || <span className="muted">-</span>}</td>}
                    {kind === 'praise' && <td className="muted small">{r.no || '-'}</td>}
                    <td>{r.count}화면</td>
                    <td className="muted small">{mb(r.size)}</td>
                    <td className="muted small">{String(r.updated_at || '').slice(0, 10)}</td>
                    <td className="row-actions">
                      <button className="btn sm" onClick={() => setPreview(r)}>미리보기</button>
                      {manage && kind === 'hymn' && <button className="btn sm" onClick={() => rename(r)} disabled={busy}>제목</button>}
                      {manage && <button className="btn sm danger" onClick={() => remove(r)} disabled={busy}>지우기</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">{q ? '찾는 곡이 없습니다.' : `아직 저장된 ${K.label}가 없습니다.`}</p>
        )}
      </Card>

      {preview && <Preview r={preview} url={fileUrl(manage, preview)} onClose={() => setPreview(null)} />}
    </>
  );
}

/** 전체 관리자: 한 교회의 예전 찬송가 보관함을 공용으로 복사 */
function ImportFromChurch({ onDone }) {
  const [list, setList] = useState([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api.get('/platform/churches').then((l) => setList(l)).catch(() => {});
  }, []);
  const run = async () => {
    const c = list.find((x) => x.code === code);
    if (!c) return;
    const ok = await askConfirm(`${c.name}의 찬송가 보관함(찬송가·교독문)을 공용 보관함으로 복사할까요? 공용에 이미 있는 번호는 건너뜁니다. 곡이 많으면 몇 분 걸립니다.`, { ok: '복사' });
    if (!ok) return;
    setBusy(true);
    setMsg('복사하는 중… 창을 닫지 마세요.');
    try {
      const r = await api.post('/platform/library/import', { church: code });
      setMsg(`복사 ${r.copied}곡 · 이미 있어서 건너뜀 ${r.skipped}곡` + (r.failed ? ` · 실패 ${r.failed}곡` : ''));
      onDone();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="교회 보관함에서 가져오기">
      <p className="muted small">공용 보관함이 생기기 전에 각 교회 관리자 화면에서 올렸던 찬송가·교독문을 공용으로 복사합니다. 찬송 제목도 같이 옵니다.</p>
      <div className="hymn-upload">
        <select value={code} onChange={(e) => setCode(e.target.value)} disabled={busy}>
          <option value="">교회 고르기</option>
          {list.map((c) => (
            <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
          ))}
        </select>
        <button className="btn" onClick={run} disabled={!code || busy}>{busy ? '복사하는 중…' : '공용으로 복사'}</button>
      </div>
      {msg && <p className="small">{msg}</p>}
    </Card>
  );
}

function Preview({ r, url, onClose }) {
  const [urls, setUrls] = useState(null);
  useEffect(() => {
    let made = [];
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('화면을 불러오지 못했습니다.');
        return res.arrayBuffer();
      })
      .then(unpackImages)
      .then((imgs) => {
        made = imgs.map((i) => URL.createObjectURL(new Blob([i.data], { type: i.ext === 'png' ? 'image/png' : 'image/jpeg' })));
        setUrls(made);
      })
      .catch((e) => alert(e.message));
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [url]);
  const K = KINDS[r.kind];
  return (
    <Modal title={`${K.label} ${nameOf(r)}${K.byNo && r.title ? ' · ' + r.title : ''}`} onClose={onClose} wide>
      {!urls ? (
        <Loading />
      ) : (
        <div className="hymn-preview">
          {urls.map((u, i) => (
            <figure key={u}>
              <img src={u} alt={`${i + 1}번째 화면`} />
              <figcaption>{i + 1} / {urls.length}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </Modal>
  );
}
