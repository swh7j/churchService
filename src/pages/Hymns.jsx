// 찬송가 보관함: 찬송가·교독문 PPT를 번호별로 서버에 저장해 두면, 예배 PPT를 만들 때 주보의 번호에 맞춰 자동으로 들어감
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { withChurch } from '../church';
import { Card, confirmDelete, Loading, Modal, PageHeader } from '../components';
import { imagesFromFiles, packImages, unpackImages } from './bulletin/pptx';

const KINDS = { hymn: { label: '찬송가', unit: '장' }, reading: { label: '교독문', unit: '번' } };
const ext = (name) => (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const OK_EXT = ['ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];

/**
 * 파일 이름 → { no, title }
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

const natural = (a, b) => a.localeCompare(b, 'ko', { numeric: true });
const mb = (n) => `${(Number(n || 0) / 1024 / 1024).toFixed(1)}MB`;

export default function Hymns() {
  const [kind, setKind] = useState('hymn');
  const [lib, setLib] = useState(null); // 저장된 목록 (전체 종류)
  const [titles, setTitles] = useState({}); // 찬송 제목 모음 { '301': '지금까지 지내온 것' }
  const [replace, setReplace] = useState(false);
  const [jobs, setJobs] = useState(null); // [{ no, title, files, status, msg }]
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState(null);
  const K = KINDS[kind];

  const load = () =>
    Promise.all([api.get('/worship-ppt/inserts'), api.get('/worship-ppt/hymns')])
      .then(([rows, h]) => {
        setLib(rows);
        setTitles(JSON.parse(h.hymns || '{}'));
      })
      .catch((e) => alert(e.message));
  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => (lib || []).filter((r) => r.kind === kind), [lib, kind]);
  const have = useMemo(() => new Set(rows.map((r) => String(r.no))), [rows]);
  const shown = q.trim() ? rows.filter((r) => String(r.no).includes(q.trim()) || (kind === 'hymn' && (titles[r.no] || '').includes(q.trim()))) : rows;
  const busy = jobs?.some((j) => j.status === 'wait' || j.status === 'run');

  const setJob = (no, patch) => setJobs((js) => js.map((j) => (j.no === no ? { ...j, ...patch } : j)));

  /** 고른 파일들 → 번호별로 묶어서 하나씩 올림 */
  const pick = async (e) => {
    const files = [...e.target.files].sort((a, b) => natural(a.name, b.name));
    e.target.value = '';
    if (!files.length) return;
    const groups = new Map();
    const bad = [];
    for (const f of files) {
      const p = parseName(f.name);
      if (!OK_EXT.includes(ext(f.name))) bad.push({ no: f.name, title: '', files: [], status: 'fail', msg: 'PPT나 그림 파일이 아닙니다.' });
      else if (!p) bad.push({ no: f.name, title: '', files: [], status: 'fail', msg: `파일 이름에 ${K.unit} 번호가 없습니다. 예) 301${K.unit}_제목.ppt` });
      else {
        const g = groups.get(p.no) || { no: p.no, title: p.title, files: [], status: 'wait', msg: '' };
        g.files.push(f);
        if (!g.title && p.title) g.title = p.title;
        groups.set(p.no, g);
      }
    }
    const list = [...groups.values()].sort((a, b) => Number(a.no) - Number(b.no));
    for (const g of list) {
      if (!replace && have.has(g.no)) Object.assign(g, { status: 'skip', msg: '이미 있음 (바꾸려면 위의 체크를 켜세요)' });
      else if (g.files.some((f) => ext(f.name) === 'ppt') && g.files.length > 1) Object.assign(g, { status: 'fail', msg: '.ppt 파일은 번호마다 하나만 올려 주세요.' });
    }
    setJobs([...list, ...bad]);

    const newTitles = {};
    for (const g of list) {
      if (g.status !== 'wait') continue;
      setJob(g.no, { status: 'run' });
      try {
        let r;
        if (ext(g.files[0].name) === 'ppt') {
          // 옛날 .ppt 는 서버에서 그림을 꺼냄
          const res = await fetch(withChurch(`/api/worship-ppt/inserts/${kind}/${g.no}/ppt`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: g.files[0],
          });
          r = await res.json().catch(() => null);
          if (!res.ok) throw new Error(r?.error || '저장하지 못했습니다.');
        } else {
          const { images, skipped } = await imagesFromFiles(g.files);
          if (!images.length) throw new Error('그림을 찾지 못했습니다. 글자로 된 PPT는 파워포인트에서 다른 이름으로 저장 → JPEG 로 그림을 만들어 올려 주세요.');
          const res = await fetch(withChurch(`/api/worship-ppt/inserts/${kind}/${g.no}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: await packImages(images),
          });
          r = await res.json().catch(() => null);
          if (!res.ok) throw new Error(r?.error || '저장하지 못했습니다.');
          r.skipped = skipped;
        }
        setJob(g.no, { status: 'done', msg: `${r.count}화면 저장` + (r.skipped ? ` (그림 없는 화면 ${r.skipped}개 뺌)` : '') });
        if (kind === 'hymn' && g.title && (replace || !titles[g.no])) newTitles[g.no] = g.title;
      } catch (err) {
        setJob(g.no, { status: 'fail', msg: err.message });
      }
    }
    // 파일 이름의 찬송 제목도 저장 → 예배 PPT의 {찬송 제목} 이 자동으로 채워짐
    if (Object.keys(newTitles).length) {
      const merged = { ...titles, ...newTitles };
      await api.put('/worship-ppt/hymns', { hymns: JSON.stringify(merged) }).catch(() => {});
    }
    load();
  };

  const remove = (r) =>
    confirmDelete(`${K.label} ${r.no}${K.unit} 화면을 지울까요? 다음 예배 PPT부터 들어가지 않습니다.`, () => api.del(`/worship-ppt/inserts/${kind}/${r.no}`)).then(
      (ok) => ok && load(),
    );

  const total = rows.reduce((s, r) => s + Number(r.size || 0), 0);
  const counts = jobs ? { done: jobs.filter((j) => j.status === 'done').length, fail: jobs.filter((j) => j.status === 'fail').length, skip: jobs.filter((j) => j.status === 'skip').length } : null;

  return (
    <>
      <PageHeader
        title="찬송가 보관함"
        desc="찬송가·교독문 PPT를 번호별로 저장해 두면, 주보 관리 → 예배 PPT를 만들 때 주보에 적힌 번호(예: 301장)에 맞춰 해당 화면 바로 뒤에 자동으로 들어갑니다."
      />
      <div className="tabs">
        {Object.entries(KINDS).map(([k, v]) => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => !busy && setKind(k)}>{v.label}</button>
        ))}
      </div>

      <Card title={`${K.label} 올리기`}>
        <p className="muted small">
          파일을 <strong>여러 개 한 번에</strong> 고르세요. 파일 이름 앞의 번호로 저장합니다. 예) <code>301{K.unit}_지금까지 지내온 것.ppt</code> → {K.label} 301{K.unit}
          {kind === 'hymn' && ' · 파일 이름의 찬송 제목도 기억해서 예배 PPT의 {찬송 제목} 칸을 채웁니다.'}
          <br />
          옛날 파워포인트(.ppt), .pptx, 그림(jpg·png) 모두 됩니다. 그림 여러 장은 이름을 <code>301{K.unit}-1.jpg</code>, <code>301{K.unit}-2.jpg</code>… 처럼 지어 주세요.
        </p>
        <div className="hymn-upload">
          <label className={'btn primary' + (busy ? ' disabled' : '')}>
            <input type="file" multiple hidden accept=".ppt,.pptx,image/*" onChange={pick} disabled={busy} />+ {K.label} 파일 고르기
          </label>
          <label className="check">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} disabled={busy} /> 이미 있는 번호도 새 파일로 바꾸기
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
                <li key={j.no} className={'job-' + j.status}>
                  <strong>{/^\d+$/.test(j.no) ? `${j.no}${K.unit}` : j.no}</strong>
                  {j.title && <span className="muted">{j.title}</span>}
                  <span className="job-state">{{ wait: '대기', run: '올리는 중…', done: '✓', skip: '건너뜀', fail: '✕' }[j.status]} {j.msg}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card
        title={lib ? `저장된 ${K.label} ${rows.length}개 (${mb(total)})` : `저장된 ${K.label}`}
        actions={<input className="hymn-search" placeholder={kind === 'hymn' ? '번호·제목 찾기' : '번호 찾기'} value={q} onChange={(e) => setQ(e.target.value)} />}
      >
        {!lib ? (
          <Loading />
        ) : shown.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>번호</th>{kind === 'hymn' && <th>제목</th>}<th>화면</th><th>크기</th><th>올린 날</th><th /></tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.no}>
                    <td><strong>{r.no}{K.unit}</strong></td>
                    {kind === 'hymn' && <td>{titles[r.no] || <span className="muted">-</span>}</td>}
                    <td>{r.count}화면</td>
                    <td className="muted small">{mb(r.size)}</td>
                    <td className="muted small">{String(r.updated_at || '').slice(0, 10)}</td>
                    <td className="row-actions">
                      <button className="btn sm" onClick={() => setPreview(r)}>미리보기</button>
                      <button className="btn sm danger" onClick={() => remove(r)} disabled={busy}>지우기</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">{q ? '찾는 번호가 없습니다.' : `아직 저장된 ${K.label}가 없습니다. 위에서 파일을 골라 올려 주세요.`}</p>
        )}
      </Card>

      {preview && <Preview kind={kind} r={preview} title={kind === 'hymn' ? titles[preview.no] : ''} onClose={() => setPreview(null)} />}
    </>
  );
}

function Preview({ kind, r, title, onClose }) {
  const [urls, setUrls] = useState(null);
  useEffect(() => {
    let made = [];
    fetch(withChurch(`/api/worship-ppt/inserts/${kind}/${r.no}`))
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
  }, [kind, r.no]);
  const K = KINDS[kind];
  return (
    <Modal title={`${K.label} ${r.no}${K.unit}${title ? ' · ' + title : ''}`} onClose={onClose} wide>
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
