// 예배 PPT 만들기: 올려 둔 서식 PPT 의 자리 표시를 이 주보 내용으로 채워 .pptx 로 내려받음
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { withChurch } from '../../church';
import { kdate } from '../../utils';
import { parseLayout } from './layout';
import { fillTemplate, NEWS_KEY, templateKeys, unpackImages } from './pptx';
import { songKey } from '../Hymns';

const norm = (s) => String(s || '').replace(/\s/g, '');
// 찬송 칸: '62장', '찬송가 62장', '62장 고요히 머리숙여'
const HYMN = /^(?:찬송가?\s*)?(\d+)\s*장\s*(.*)$/;
const NOT_SONG = ['날짜', '설교제목', '설교자', '본문', '예배명', NEWS_KEY];

/**
 * 경배와 찬양 찾기표: 열쇠 → 곡. '그사랑(아버지사랑내가노래해)' 은 전체·괄호 앞·괄호 안 어느 것으로 적어도 찾음
 */
function praiseIndex(rows) {
  const idx = new Map();
  for (const r of rows) {
    if (r.kind !== 'praise') continue;
    const t = String(r.title || '');
    const head = t.replace(/\(.*$/, '');
    const inner = t.match(/\(([^)]*)\)/)?.[1];
    for (const v of [t, head, inner]) {
      const k = songKey(v);
      if (k && !idx.has(k)) idx.set(k, r);
    }
  }
  return idx;
}

/**
 * 이 자리 표시 화면 뒤에 넣을 그림 화면 (공용 보관함의 곡들)
 *  {영광송}·{찬송} 에 '62장' → 찬송가 62장 · {성시교독} 에 '15번' → 교독문 15번
 *  {찬양} 에 '내 입술로, 그날' → 경배와 찬양 두 곡 (쉼표·/·줄바꿈으로 여러 곡)
 * '담당'·'제목' 칸이나 찾을 곡이 없으면 null
 */
function insertTarget(key, value, praise) {
  if (/(담당|제목)$/.test(key) || NOT_SONG.includes(norm(key))) return null;
  const v = String(value || '').trim();
  if (!v) return null;
  if (norm(key).replace(/\d+$/, '').includes('교독')) {
    const n = v.match(/(\d{1,4})/)?.[1];
    return n ? { label: `교독문 ${Number(n)}번`, items: [{ kind: 'reading', key: String(Number(n)) }] } : null;
  }
  const h = v.match(HYMN);
  if (h && h[1].length <= 4) return { label: `찬송가 ${Number(h[1])}장`, items: [{ kind: 'hymn', key: String(Number(h[1])) }] };
  const found = v
    .split(/[,，/·\n]+/)
    .map((p) => praise.get(songKey(p)))
    .filter(Boolean);
  return found.length ? { label: found.map((r) => `'${r.title}'`).join(', '), items: found.map((r) => ({ kind: 'praise', key: r.key })) } : null;
}
const libKey = (it) => `${it.kind}:${it.key}`;

const longDate = (s) => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
};

/**
 * 자리 표시 이름 → 주보에서 찾은 값
 * {영광송} 내용, {기도 담당} 맡은 사람, {영광송 제목} 찬송 제목, {찬송2} 두 번째 '찬송' 줄
 */
export function lookup(key, b, rows, hymns) {
  if (key === NEWS_KEY) return b.announcements || '';
  const special = { 날짜: longDate(b.date), 설교제목: b.sermon_title, 설교자: b.preacher, 본문: b.scripture, 예배명: b.title };
  if (norm(key) in special) return special[norm(key)] || '';
  const m = key.match(/^(.*?)(\d*)\s*(담당|제목)?$/);
  const name = norm(m[1]);
  const row = rows.filter((r) => norm(r.item) === name)[(Number(m[2]) || 1) - 1];
  if (!row) return '';
  if (m[3] === '담당') return row.who || '';
  const h = String(row.content || '').match(HYMN);
  if (m[3] === '제목') return h ? h[2].trim() || hymns[String(Number(h[1]))] || '' : '';
  return h ? `${h[1]}장` : row.content || '';
}

const fileName = (date) => `주일낮PPT(${(date || '').slice(2).replace(/-/g, '')}).pptx`;

export default function WorshipPpt({ b }) {
  const [info, setInfo] = useState(null); // 올린 서식 정보
  const [buf, setBuf] = useState(null);
  const [keys, setKeys] = useState([]);
  const [values, setValues] = useState({});
  const [hymns, setHymns] = useState({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [common, setCommon] = useState(null); // 전체 관리자가 올린 공통 양식
  const [libRows, setLibRows] = useState([]); // 공용 찬송가 보관함 목록
  const [skip, setSkip] = useState({}); // 이번에 넣지 않을 자리 표시
  const picCache = useRef({}); // 받아 둔 악보 그림 ('hymn:62|저장시각' → 그림들), 다시 만들 때 또 받지 않음

  const lib = useMemo(() => Object.fromEntries(libRows.map((r) => [libKey(r), r])), [libRows]);
  const praise = useMemo(() => praiseIndex(libRows), [libRows]);
  // 찬송 제목: 이 교회가 입력한 것 우선, 없으면 공용 보관함의 제목
  const titles = useMemo(() => {
    const t = {};
    libRows.forEach((r) => r.kind === 'hymn' && r.title && (t[r.key] = r.title));
    return { ...t, ...hymns };
  }, [libRows, hymns]);

  /** 한 자리 표시에 넣을 그림들 (여러 곡이면 차례로 이어 붙임) */
  const loadPics = async (t) => {
    const out = [];
    for (const it of t.items) {
      const row = lib[libKey(it)];
      if (!row) continue;
      const id = `${libKey(it)}|${row.updated_at}`;
      if (!picCache.current[id]) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 60_000);
        try {
          const res = await fetch(withChurch(`/api/library/${it.kind}/${encodeURIComponent(it.key)}/file`), { signal: ctl.signal });
          if (!res.ok) throw new Error();
          picCache.current[id] = await unpackImages(await res.arrayBuffer());
        } catch {
          throw new Error(`${t.label} 화면을 받지 못했습니다. 다시 눌러 주세요.`);
        } finally {
          clearTimeout(timer);
        }
      }
      out.push(...picCache.current[id]);
    }
    return out;
  };

  const loadLib = () =>
    api
      .get('/library')
      .then(setLibRows)
      .catch(() => {});

  const loadTemplate = async () => {
    setErr('');
    const i = await api.get('/worship-ppt');
    setInfo(i);
    if (!i.name) return;
    const res = await fetch(withChurch('/api/worship-ppt/file'));
    if (!res.ok) throw new Error('서식 PPT를 받지 못했습니다.');
    const ab = await res.arrayBuffer();
    setBuf(ab);
    setKeys(await templateKeys(ab));
  };
  const reloadTemplate = () => {
    setLoading(true);
    return loadTemplate()
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.get('/worship-ppt/common').then(setCommon).catch(() => {});
    loadLib();
    api.get('/worship-ppt/hymns').then((r) => setHymns(JSON.parse(r.hymns || '{}'))).catch(() => {});
    reloadTemplate();
  }, []);

  // 서식이나 찬송 제목 모음이 바뀌면 주보에서 다시 채움 (직접 고친 칸은 유지)
  useEffect(() => {
    const rows = parseLayout(b.layout).main.sections.flatMap((s) => s.rows);
    // 찬송 제목 칸은 보관함 목록이 늦게 와도 채워지도록 비어 있으면 다시 찾음
    setValues((v) => Object.fromEntries(keys.map((k) => [k, (/제목$/.test(k) ? v[k] || null : v[k]) ?? lookup(k, b, rows, titles)])));
  }, [keys, titles, b]);

  const upload = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setBusy('서식 올리는 중…');
    try {
      const res = await fetch(withChurch('/api/worship-ppt/file?name=' + encodeURIComponent(f.name)), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: f,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || '서식을 올리지 못했습니다.');
      setValues({});
      await reloadTemplate();
    } catch (x) {
      alert(x.message);
    } finally {
      setBusy('');
    }
  };

  const make = async () => {
    setBusy('PPT 만드는 중…');
    try {
      // 입력한 찬송 제목은 다음에 자동으로 채우도록 저장
      const next = { ...hymns };
      keys.filter((k) => / 제목$/.test(k)).forEach((k) => {
        const n = String(values[k.replace(/\s*제목$/, '')] || '').match(/(\d+)\s*장/)?.[1];
        if (n && values[k]?.trim()) next[n] = values[k].trim();
      });
      if (JSON.stringify(next) !== JSON.stringify(hymns)) {
        await api.put('/worship-ppt/hymns', { hymns: JSON.stringify(next) }).catch(() => {});
      }
      // 공용 보관함의 악보·교독문·찬양 그림을 받아 해당 화면 뒤에 넣음
      const inserts = {};
      for (const { key, t } of targets) {
        if (skip[key] || !t.items.some((it) => lib[libKey(it)])) continue;
        inserts[key] = await loadPics(t);
      }
      const blob = await fillTemplate(buf, values, inserts);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName(b.date);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (x) {
      alert('PPT를 만들지 못했습니다. ' + x.message);
    } finally {
      setBusy('');
    }
  };

  const set = (k, x) => setValues((v) => ({ ...v, [k]: x }));

  // 악보·교독문·찬양을 넣을 수 있는 자리 표시들
  const targets = keys.map((key) => ({ key, t: insertTarget(key, values[key], praise) })).filter((x) => x.t);

  return (
    <div className="wppt">
      <div className="wppt-tpl">
        <div>
          <strong>서식 PPT</strong>{' '}
          {info === null ? <span className="muted">불러오는 중…</span> : info.name ? <span>{info.name} <span className="muted small">({info.updated_at} 올림)</span></span> : <span className="muted">아직 올리지 않았습니다</span>}
        </div>
        <div className="row-actions">
          {common?.size ? <a className="btn sm" href={withChurch('/api/worship-ppt/common/file')} download="예배PPT_공통양식.pptx" title="모든 교회가 쓰는 기본 서식">공통 양식 받기</a> : null}
          {info?.name && <a className="btn sm" href={withChurch('/api/worship-ppt/file')} download={info.name}>서식 받기</a>}
          <label className="btn sm">
            <input type="file" accept=".pptx" hidden onChange={upload} disabled={!!busy} />
            {info?.name ? '서식 바꾸기' : '서식 올리기'}
          </label>
        </div>
      </div>
      {err && <p className="warn">{err}</p>}
      {info && !info.name && common?.size ? (
        <p className="muted small">처음이라면 <strong>공통 양식 받기</strong>로 기본 서식을 받아, 파워포인트에서 교회 이름·표어·배경을 고친 뒤 <strong>서식 올리기</strong>로 올려 주세요.</p>
      ) : null}

      {info?.name && loading && <p className="muted">서식 PPT를 읽는 중…</p>}
      {info?.name && !loading && (
        <>
          <p className="muted small">{kdate(b.date)} 주보에서 찾아 채웠습니다. 칸을 고치면 PPT에 고친 대로 들어갑니다.</p>
          {!keys.length && <p className="warn">서식에 자리 표시가 없습니다. 아래 사용법을 보고 PPT에 {'{영광송}'} 같은 글자를 넣어 주세요.</p>}
          <div className="form-grid">
            {keys.map((k) => (
              <div key={k} className={'field' + (k === NEWS_KEY ? ' full' : '')}>
                <label>{`{${k}}`}</label>
                {k === NEWS_KEY ? (
                  <textarea rows={6} value={values[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
                ) : (
                  <input value={values[k] ?? ''} onChange={(e) => set(k, e.target.value)} placeholder={/ 제목$/.test(k) ? '찬송 제목 (한 번 넣으면 기억)' : ''} />
                )}
              </div>
            ))}
          </div>
          {targets.length > 0 && (
            <div className="wppt-ins">
              <strong>찬송 악보 · 교독문 · 찬양 화면</strong>
              <p className="muted small">공용 찬송가 보관함에서 주보의 번호·곡 제목에 맞는 화면을 찾아 해당 화면 바로 뒤에 넣습니다. 보관함에 없는 곡은 전체 관리자에게 파일을 보내 주세요.</p>
              <ul>
                {targets.map(({ key, t }) => {
                  const got = t.items.map((it) => lib[libKey(it)]).filter(Boolean);
                  const count = got.reduce((s, r) => s + Number(r.count || 0), 0);
                  return (
                    <li key={key}>
                      <label className="wppt-ins-name">
                        <input type="checkbox" checked={got.length > 0 && !skip[key]} disabled={!got.length} onChange={(e) => setSkip((s) => ({ ...s, [key]: !e.target.checked }))} />
                        <span>{`{${key}}`} 뒤 · <strong>{t.label}</strong></span>
                      </label>
                      <span className={got.length ? 'small' : 'muted small'}>
                        {!got.length ? '보관함에 없음' : got.length < t.items.length ? `${count}화면 (일부 곡 없음)` : `${count}화면`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="form-actions">
            <button className="btn primary" onClick={make} disabled={!buf || !!busy}>{busy || 'PPT 만들기 (.pptx 받기)'}</button>
          </div>
        </>
      )}
      {busy && !info?.name && <p className="muted">{busy}</p>}

      <details className="wppt-help">
        <summary>서식 PPT 만드는 법</summary>
        <ul className="info-list">
          <li>파워포인트에서 매주 바뀌는 글자 자리에 중괄호로 주보 순서 이름을 씁니다. 예) <code>찬송가 {'{영광송}'}</code></li>
          <li><code>{'{항목}'}</code> 주보의 내용 칸 (예: 62장, 출 34:22-23) · <code>{'{항목 담당}'}</code> 맡은 사람 · <code>{'{항목 제목}'}</code> 찬송 제목</li>
          <li>같은 이름이 두 번 나오면 <code>{'{찬송2}'}</code>, <code>{'{찬송2 제목}'}</code> 처럼 번호를 붙입니다.</li>
          <li><code>{'{교회소식}'}</code> 만 쓴 줄은 소식 항목으로 채우고, 많으면 화면을 늘려 3개씩 나눕니다.</li>
          <li>그 밖에 <code>{'{날짜}'}</code>, <code>{'{설교제목}'}</code>, <code>{'{본문}'}</code>, <code>{'{설교자}'}</code> 를 쓸 수 있습니다.</li>
          <li>옛날 형식(.ppt)은 '다른 이름으로 저장 → PowerPoint 프레젠테이션(*.pptx)'으로 바꿔 올려 주세요.</li>
        </ul>
      </details>
    </div>
  );
}
