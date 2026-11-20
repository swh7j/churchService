// 예배 PPT 만들기: 올려 둔 서식 PPT 의 자리 표시를 이 주보 내용으로 채워 .pptx 로 내려받음
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { withChurch } from '../../church';
import { kdate } from '../../utils';
import { parseLayout } from './layout';
import { fillTemplate, NEWS_KEY, templateKeys } from './pptx';

const norm = (s) => String(s || '').replace(/\s/g, '');
// 찬송 칸: '62장', '찬송가 62장', '62장 고요히 머리숙여'
const HYMN = /^(?:찬송가?\s*)?(\d+)\s*장\s*(.*)$/;

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
  if (m[3] === '제목') return h ? h[2].trim() || hymns[h[1]] || '' : '';
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
    api.get('/worship-ppt/hymns').then((r) => setHymns(JSON.parse(r.hymns || '{}'))).catch(() => {});
    reloadTemplate();
  }, []);

  // 서식이나 찬송 제목 모음이 바뀌면 주보에서 다시 채움 (직접 고친 칸은 유지)
  useEffect(() => {
    const rows = parseLayout(b.layout).main.sections.flatMap((s) => s.rows);
    setValues((v) => Object.fromEntries(keys.map((k) => [k, v[k] ?? lookup(k, b, rows, hymns)])));
  }, [keys, hymns, b]);

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
      const blob = await fillTemplate(buf, values);
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

  return (
    <div className="wppt">
      <div className="wppt-tpl">
        <div>
          <strong>서식 PPT</strong>{' '}
          {info === null ? <span className="muted">불러오는 중…</span> : info.name ? <span>{info.name} <span className="muted small">({info.updated_at} 올림)</span></span> : <span className="muted">아직 올리지 않았습니다</span>}
        </div>
        <div className="row-actions">
          {info?.name && <a className="btn sm" href={withChurch('/api/worship-ppt/file')} download={info.name}>서식 받기</a>}
          <label className="btn sm">
            <input type="file" accept=".pptx" hidden onChange={upload} disabled={!!busy} />
            {info?.name ? '서식 바꾸기' : '서식 올리기'}
          </label>
        </div>
      </div>
      {err && <p className="warn">{err}</p>}

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
          <div className="form-actions">
            <button className="btn primary" onClick={make} disabled={!buf || !!busy}>{busy || 'PPT 만들기 (.pptx 받기)'}</button>
          </div>
          <p className="muted small">찬송 악보 화면은 아직 자동으로 들어가지 않습니다. 받은 PPT에서 각 찬송 제목 화면 뒤에 붙여 넣어 주세요.</p>
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
