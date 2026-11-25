// 4면 주보 인쇄 화면: A4 가로 2장 (바깥면: 교회소식 | 표지, 안쪽면: 주일낮예배 | 오후·수요예배)
// 2026년 수암제일교회 주보 양식: 붓글씨 제목, 점선 예배 순서, 두 칸 오후·수요예배, 회색 표 봉사표
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dotDate, volWeek } from './layout';
import './bulletin.css';

const lines = (s) => (s || '').split('\n');
const filled = (a) => (a || []).map((x) => String(x || '').trim()).filter(Boolean);

/** 미리보기가 열려 있는 동안만 인쇄 용지를 A4 가로·여백 없음으로 */
function usePrintPage() {
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = '@page { size: A4 landscape; margin: 0; }';
    document.head.appendChild(el);
    document.body.classList.add('printing-bulletin');
    return () => {
      el.remove();
      document.body.classList.remove('printing-bulletin');
    };
  }, []);
}

const FLIP_KEY = 'bulletin.flipBack';
const readFlip = () => {
  try {
    return localStorage.getItem(FLIP_KEY) === '1';
  } catch {
    return false;
  }
};

/** 양면 인쇄 때 안쪽면이 거꾸로 나오는 프린터용: 인쇄할 때만 두 번째 장을 180도 돌려서 출력 (PC마다 기억) */
export function FlipBackOption({ className = 'be-flip' }) {
  const [on, setOn] = useState(readFlip);
  useEffect(() => {
    document.body.classList.toggle('bp-flip-back', on);
    try {
      localStorage.setItem(FLIP_KEY, on ? '1' : '0');
    } catch {
      /* 저장 못 해도 이번 인쇄에는 적용됨 */
    }
    return () => document.body.classList.remove('bp-flip-back');
  }, [on]);
  return (
    <label className={className} title="양면 인쇄했을 때 안쪽면(예배 순서 쪽)이 거꾸로 나오면 켜 주세요">
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> 안쪽면 뒤집어 인쇄
    </label>
  );
}

/** 붓글씨 제목 (주일 낮 예배, 교회 소식 …) */
function Brush({ children, className = '' }) {
  return <h2 className={'bp-brush ' + className}>{children}</h2>;
}

/**
 * 정해진 폭에 글자를 고르게 벌려 씀 (묵    도, 다 함 께). 띄어쓰기가 있으면 낱말 단위로 벌림.
 * 브라우저의 양쪽 맞춤은 한 줄짜리 한글을 벌리지 않아서 글자를 나눠 배치함
 */
function Spread({ text, className }) {
  const s = String(text || '').trim();
  const parts = /\s/.test(s) ? s.split(/\s+/) : [...s];
  return (
    <span className={'bp-spread ' + (className || '')}>
      {parts.map((x, i) => (
        <span key={i}>{x}</span>
      ))}
    </span>
  );
}

/** 교단 이름을 두 줄로 (대한예수교 / 장로회) */
function Denom({ text }) {
  const s = String(text || '').replace(/\s+/g, '');
  const cut = Math.ceil(s.length * 0.6);
  return (
    <span className="bp-denom">
      {s.slice(0, cut)}
      <br />
      {s.slice(cut)}
    </span>
  );
}

/** 초록 형광펜 이름표 (합심기도제목, 우리의 비전 …) */
function Tag({ children }) {
  return <span className="bp-tag">{children}</span>;
}

/* ---------- 바깥면 왼쪽: 교회 소식 ---------- */
function NewsPanel({ b, t }) {
  const times = t.serviceTimes || [];
  const half = Math.ceil(times.length / 2);
  return (
    <div className="bp-panel bp-news-panel">
      <div className="bp-news-head">
        <Brush>교회 소식</Brush>
        {t.welcome && <p className="bp-welcome">{t.welcome}</p>}
      </div>
      <div className="bp-news">
        {lines(b.announcements).map((l, i) => (
          <p key={i} className={/^\s*\d+[.)]/.test(l) ? 'num' : 'cont'}>
            {l.trim() || ' '}
          </p>
        ))}
      </div>
      <div className="bp-grow" />
      {b.offering_names && (
        <section className="bp-offer-sec">
          <Brush className="sm">하나님께 드리는 향기로운 예물</Brush>
          <div className="bp-offerings">
            {lines(b.offering_names)
              .filter((l) => l.trim())
              .map((l, i) => {
                const m = l.match(/^\s*([^:：]+?)\s*[:：]\s*(.*)$/);
                return (
                  <div key={i} className="bp-offering">
                    {m ? (
                      <>
                        <Spread className="k" text={m[1]} /> : {m[2]}
                      </>
                    ) : (
                      l
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}
      {times.length > 0 && (
        <section>
          <Brush className="sm">예배 시간 안내</Brush>
          <div className="bp-times">
            {['예배', '시간', '예배', '시간'].map((h, i) => (
              <div key={i} className="th">{h}</div>
            ))}
            {Array.from({ length: half }, (_, i) => [times[i], times[i + half]]).flatMap(([l, r], i) => [
              <div key={`a${i}`}>{l?.name}</div>,
              <div key={`b${i}`}>{l?.time}</div>,
              <div key={`c${i}`}>{r?.name}</div>,
              <div key={`d${i}`}>{r?.time}</div>,
            ])}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- 바깥면 오른쪽: 표지 ---------- */
function CoverPanel({ b, t, church, vw }) {
  const visions = filled(t.visions);
  return (
    <div className="bp-panel bp-cover">
      <div className="bp-cover-top">
        <span>{vw.vol ? `제 ${vw.vol}권 ${vw.week}주` : vw.week ? `제 ${vw.week}주` : ''}</span>
        <span>{dotDate(b.date)}</span>
      </div>
      <div className="bp-cover-photo">{t.coverPhoto && <img src={t.coverPhoto} alt="" />}</div>
      <div className="bp-cover-name">
        {t.logo && <img className="bp-logo" src={t.logo} alt="" />}
        {t.denomination && <Denom text={t.denomination} />}
        <span className="bp-church">{t.churchName || church}</span>
      </div>
      {t.motto && <div className="bp-motto">{t.motto}</div>}
      <div className="bp-cover-info">
        {visions.length > 0 && (
          <div className="bp-cover-row">
            <Tag>우리의 비전</Tag>
            <ol>
              {visions.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ol>
          </div>
        )}
        {t.mission && (
          <div className="bp-cover-row">
            <Tag>사명선언문</Tag>
            <p>{t.mission}</p>
          </div>
        )}
      </div>
      <div className="bp-grow" />
      {(t.pastor || t.staffLine) && (
        <div className="bp-staff">
          {t.pastor && <strong>담임목사 : {t.pastor}</strong>}
          {t.staffLine && <span>{t.staffLine}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------- 안쪽면 왼쪽: 주일 낮 예배 ---------- */
function MainPanel({ b, L }) {
  const rows = L.main.sections.flatMap((s) => s.rows);
  return (
    <div className="bp-panel bp-main">
      <Brush className="lg">{(b.title || '주일 낮 예배').replace(/\s+/g, ' ').replace(/^주 일 낮 예 배$/, '주일 낮 예배')}</Brush>
      <div className="bp-meta">
        <span>{L.main.time}</span>
        <span>{L.main.leader && `사회 : ${L.main.leader}`}</span>
      </div>
      <div className="bp-orders">
        {rows.map((r, i) => (
          <div key={i} className="bp-order">
            <Spread className="item" text={r.item} />
            <span className="dots">{r.content && <span className="c">{r.content}</span>}</span>
            <Spread className="who" text={r.who} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- 안쪽면 오른쪽: 오후·수요예배, 합심기도, 봉사표 ---------- */
function SubService({ s }) {
  return (
    <div className="bp-sub">
      <Brush className="md">{s.title}</Brush>
      <div className="bp-sub-meta">
        <span>{s.time}</span>
        <span>{s.leader && `사회 : ${s.leader}`}</span>
      </div>
      {s.rows.map((r, i) => (
        <p key={i} className="bp-sub-row">
          {r.item}
          {r.content && ` / ${r.content}`}
        </p>
      ))}
    </div>
  );
}

function Duty({ d }) {
  if (!(d.month || d.guide || d.offering || d.prayDay || d.prayPm)) return null;
  return (
    <table className="bp-duty">
      <tbody>
        <tr>
          <td rowSpan="3" className="month">{d.month}</td>
          <th>안내</th>
          <th>헌금</th>
          <th colSpan="2">다음주기도</th>
        </tr>
        <tr>
          <td rowSpan="2">{d.guide}</td>
          <td rowSpan="2">{d.offering}</td>
          <td className="when">낮</td>
          <td>{d.prayDay}</td>
        </tr>
        <tr>
          <td className="when pm">오후</td>
          <td>{d.prayPm}</td>
        </tr>
      </tbody>
    </table>
  );
}

function SubPanel({ t, L }) {
  const items = filled(t.prayerItems);
  const notes = filled(t.worshipNotes);
  return (
    <div className="bp-panel bp-right">
      <div className="bp-subs">
        <SubService s={L.pm} />
        <SubService s={L.wed} />
      </div>
      {items.length > 0 && (
        <section className="bp-prayer">
          <Tag>합심기도제목</Tag>
          <ul>
            {items.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="bp-grow" />
      <div className="bp-bottom">
        <Duty d={L.duty} />
        {notes.length > 0 && (
          <div className="bp-notes">
            <Tag>경건한 예배를 위하여</Tag>
            <ul>
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {(t.address || t.contact || t.homepage) && (
        <div className="bp-address">
          <div>{[t.address, t.contact].filter(Boolean).join('  ')}</div>
          {t.homepage && <div>{t.homepage}</div>}
        </div>
      )}
    </div>
  );
}

/** 주보 4면. b: 주보 행(announcements, offering_names, date, title), t: 기본 정보, L: 이번 주 내용 */
export default function BulletinSheets({ b, t, L, church }) {
  usePrintPage();
  const ref = useRef(null);
  // 내용이 많아 한 면을 넘치면 그 면만 넘치지 않을 만큼 글자를 줄임 (글꼴을 받은 뒤 다시 잼)
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    import('./fonts')
      .then(() => document.fonts?.ready)
      .then(() => setFontsReady((n) => n + 1))
      .catch(() => {});
  }, []);
  useLayoutEffect(() => {
    ref.current?.querySelectorAll('.bp-panel').forEach((p) => {
      p.style.zoom = '';
      if (p.scrollHeight > p.clientHeight + 1) p.style.zoom = String(Math.floor((p.clientHeight / p.scrollHeight) * 100) / 100);
    });
  });
  // 화면이 A4 가로보다 좁으면(휴대폰 등) 화면 폭에 맞춰 줄여서 보여 줌 (인쇄는 원래 크기)
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const sheet = el.querySelector('.bp-sheet');
      if (sheet && sheet.offsetWidth) setFit(Math.min(1, el.clientWidth / sheet.offsetWidth));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const auto = volWeek(b.date, t.volBaseYear);
  const vw = { vol: L.vol || auto.vol, week: L.week || auto.week };
  return (
    <div className="bp-sheets print-area" ref={ref} style={{ '--fit': fit }} data-fonts={fontsReady}>
      <div className="bp-fit">
        <div className="bp-sheet">
          <NewsPanel b={b} t={t} />
          <CoverPanel b={b} t={t} church={church} vw={vw} />
        </div>
      </div>
      <div className="bp-fit">
        <div className="bp-sheet">
          <MainPanel b={b} L={L} />
          <SubPanel t={t} L={L} />
        </div>
      </div>
    </div>
  );
}
