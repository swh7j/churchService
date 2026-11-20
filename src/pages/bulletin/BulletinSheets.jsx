// 4면 주보 인쇄 화면: A4 가로 2장 (바깥면: 교회소식 | 표지, 안쪽면: 주일낮예배 | 오후·수요예배)
import { useEffect, useLayoutEffect, useRef } from 'react';
import { dotDate, volWeek } from './layout';
import './bulletin.css';

const lines = (s) => (s || '').split('\n');

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

/** 세로쓰기 칸: 글자는 세우고, 숫자(예: 10월의 10)는 한 칸에 가로로 모아 세움 */
function VerticalText({ text }) {
  return (text || '').split(/(\d+)/).map((part, i) => (/^\d+$/.test(part) ? <span key={i} className="tcy">{part}</span> : part));
}

function Title({ children }) {
  return <h2 className="bp-title">{children}</h2>;
}

function Mark({ children }) {
  return (
    <h3 className="bp-mark">
      <span className="bp-mark-icon" aria-hidden="true" />
      {children}
    </h3>
  );
}

function VerseBar({ text }) {
  if (!text) return null;
  return <div className="bp-verse">{text}</div>;
}

function NewsPanel({ b, t }) {
  const times = t.serviceTimes || [];
  const half = Math.ceil(times.length / 2);
  return (
    <div className="bp-panel">
      <Title>교 회 소 식</Title>
      {t.welcome && (
        <div className="bp-welcome">
          <span className="bp-welcome-tag">환영</span>
          <p>{t.welcome}</p>
        </div>
      )}
      <div className="bp-news">
        {lines(b.announcements).map((l, i) => (
          <p key={i} className={/^\s*\d+[.)]/.test(l) ? 'num' : 'cont'}>
            {l.trim() || ' '}
          </p>
        ))}
      </div>
      <div className="bp-grow" />
      {b.offering_names && (
        <section>
          <Mark>하나님께 드리는 향기로운 예물</Mark>
          <div className="bp-offerings">
            {lines(b.offering_names).map((l, i) => {
              const m = l.match(/^\s*([^:：]+?)\s*[:：]\s*(.*)$/);
              return m ? (
                <div key={i} className="bp-offering">
                  <span className="k">• {m[1]} :</span>
                  <span className="v">{m[2]}</span>
                </div>
              ) : (
                <div key={i} className="bp-offering">
                  <span className="k" />
                  <span className="v">{l}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {times.length > 0 && (
        <section>
          <Mark>예배시간안내</Mark>
          <table className="bp-times">
            <thead>
              <tr>
                <th>구 분</th>
                <th>시 간</th>
                <th>구 분</th>
                <th>시 간</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: half }, (_, i) => (
                <tr key={i}>
                  <td>{times[i]?.name}</td>
                  <td>{times[i]?.time}</td>
                  <td>{times[i + half]?.name}</td>
                  <td>{times[i + half]?.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function CoverPanel({ b, t, church, vw }) {
  const visions = (t.visions || []).filter(Boolean);
  return (
    <div className={'bp-panel bp-cover' + (t.coverPhoto ? ' has-photo' : '')} style={t.coverPhoto ? { backgroundImage: `url(${t.coverPhoto})` } : undefined}>
      <div className="bp-cover-top">
        <span>{vw.vol ? `제${vw.vol}권 ${vw.week}주` : vw.week ? `제${vw.week}주` : ''}</span>
        <span>{dotDate(b.date)}</span>
      </div>
      <div className="bp-cover-name">
        {t.denomination && <span className="bp-denom">{t.denomination}</span>}
        <span className="bp-church">{t.churchName || church}</span>
      </div>
      {t.motto && <div className="bp-motto">{t.motto}</div>}
      <div className="bp-grow" />
      {(visions.length > 0 || t.mission || t.pastor || t.address) && (
        <div className="bp-cover-box">
          {visions.length > 0 && (
            <div className="bp-cover-row">
              <span className="bp-tag">우리의 비전</span>
              <ol>
                {visions.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ol>
            </div>
          )}
          {t.mission && (
            <div className="bp-cover-row">
              <span className="bp-tag">사명선언문</span>
              <p>{t.mission}</p>
            </div>
          )}
          {t.pastor && <div className="bp-pastor">담임목사 : {t.pastor}</div>}
          {t.staffLine && <div className="bp-staff">{t.staffLine}</div>}
          {(t.address || t.contact || t.homepage) && (
            <div className="bp-address">
              {[t.address, t.contact].filter(Boolean).join('  ')}
              {t.homepage && <div>홈페이지 {t.homepage}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MainPanel({ b, t, L }) {
  const d = L.duty;
  const hasDuty = d.month || d.guide || d.offering || d.prayDay || d.prayPm;
  return (
    <div className="bp-panel">
      <VerseBar text={t.verseLeft} />
      <Title>{b.title || '주 일 낮 예 배'}</Title>
      <div className="bp-meta">
        <span>{L.main.time}</span>
        <span>{L.main.leader && `사회 : ${L.main.leader}`}</span>
      </div>
      {L.main.sections.map((s, si) => (
        <section key={si} className="bp-order-sec">
          {s.title && <h4 className="bp-sec">◐ {s.title} ◑</h4>}
          {s.rows.map((r, ri) => (
            <div key={ri} className="bp-order">
              <span className="stand">{r.stand ? '¶' : ''}</span>
              <span className="item">{r.item}</span>
              <span className="dots">{r.content && <span className="c">{r.content}</span>}</span>
              <span className="who">{r.who}</span>
            </div>
          ))}
        </section>
      ))}
      {L.main.sections.some((s) => s.rows.some((r) => r.stand)) && <div className="bp-stand-note">¶ 일어서 주세요</div>}
      <div className="bp-grow" />
      <div className="bp-bottom">
        {hasDuty && (
          <div className="bp-duty">
            {t.dutyVerse && <div className="bp-small-verse">{t.dutyVerse}</div>}
            <table>
              <tbody>
                <tr>
                  <td rowSpan="3" className="month"><VerticalText text={d.month} /></td>
                  <th>안 내</th>
                  <th>헌 금</th>
                  <th colSpan="2">다음주기도</th>
                </tr>
                <tr>
                  <td rowSpan="2">{d.guide}</td>
                  <td rowSpan="2">{d.offering}</td>
                  <th>낮</th>
                  <td>{d.prayDay}</td>
                </tr>
                <tr>
                  <th>오후</th>
                  <td>{d.prayPm}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {(t.worshipNotes || []).filter(Boolean).length > 0 && (
          <div className="bp-notes">
            <h4>경건한 예배를 위하여</h4>
            <ul>
              {t.worshipNotes.filter(Boolean).map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function SubService({ s }) {
  return (
    <div className="bp-sub">
      <Title>{s.title}</Title>
      <div className="bp-meta">
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

function PrayerBox({ p }) {
  if (!p?.title) return null;
  return (
    <div className="bp-pbox">
      <h4>{p.title}</h4>
      <div>{p.time}</div>
      {p.leader && <div>사회 : {p.leader}</div>}
    </div>
  );
}

function SubPanel({ t, L }) {
  const items = (t.prayerItems || []).filter(Boolean);
  const box = (t.boxItems || []).filter(Boolean);
  const half = Math.ceil(box.length / 2);
  return (
    <div className="bp-panel">
      <VerseBar text={t.verseRight} />
      <div className="bp-subs">
        <SubService s={L.pm} />
        <SubService s={L.wed} />
      </div>
      <div className="bp-pboxes">
        <PrayerBox p={t.dawn} />
        <PrayerBox p={t.night} />
      </div>
      {items.length > 0 && (
        <section className="bp-prayer">
          <h4>
            합심기도제목 {t.prayerVerse && <small>{t.prayerVerse}</small>}
          </h4>
          <ol>
            {items.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ol>
        </section>
      )}
      <div className="bp-grow" />
      {(t.boxTitle || box.length > 0) && (
        <div className="bp-box">
          {t.boxTitle && <div className="bp-box-title">{t.boxTitle}</div>}
          <div className="bp-box-cols">
            <ol>
              {box.slice(0, half).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ol>
            <ol start={half + 1}>
              {box.slice(half).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

/** 주보 4면. b: 주보 행(announcements, offering_names, date, title), t: 기본 정보, L: 이번 주 내용 */
export default function BulletinSheets({ b, t, L, church }) {
  usePrintPage();
  const ref = useRef(null);
  // 내용이 많아 한 면을 넘치면 그 면만 넘치지 않을 만큼 글자를 줄임
  useLayoutEffect(() => {
    ref.current?.querySelectorAll('.bp-panel').forEach((p) => {
      p.style.zoom = '';
      if (p.scrollHeight > p.clientHeight + 1) p.style.zoom = String(Math.floor((p.clientHeight / p.scrollHeight) * 100) / 100);
    });
  });
  const auto = volWeek(b.date, t.volBaseYear);
  const vw = { vol: L.vol || auto.vol, week: L.week || auto.week };
  return (
    <div className="bp-sheets print-area" ref={ref}>
      <div className="bp-sheet">
        <NewsPanel b={b} t={t} />
        <CoverPanel b={b} t={t} church={church} vw={vw} />
      </div>
      <div className="bp-sheet">
        <MainPanel b={b} t={t} L={L} />
        <SubPanel t={t} L={L} />
      </div>
    </div>
  );
}
