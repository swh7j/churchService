// 성도 화면: 로그인 없이 교회 소식 · 주보 · 악보 · 행사 일정 보기, 익명 기도제목 나누기, 요청·제보
import { useEffect, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useParams } from 'react-router-dom';
import { api } from '../api';
import { BASE, churchPath } from '../church';
import { BulletinView } from '../pages/Bulletins';
import BulletinSheets, { FlipBackOption } from '../pages/bulletin/BulletinSheets';
import { parseLayout, parseTemplate } from '../pages/bulletin/layout';
import { dday, kdate } from '../utils';
import PrayerBoard from './PrayerBoard';
import RequestBoard from './RequestBoard';
import InstallApp from '../InstallApp';
import { setAppTitle } from '../pwa';
import { SheetDetail, SheetList } from './Sheets';
import { AlbumCards, AlbumDetail, AlbumList } from './Albums';

const NEWS_CATS = ['공지', '소식', '행사', '기도제목'];

// 공개 API 호출 (url 이 바뀌면 다시 불러옴)
function usePublic(url) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let alive = true;
    setState({ data: null, error: null });
    api
      .get('/public' + url)
      .then((data) => alive && setState({ data, error: null }))
      .catch((e) => alive && setState({ data: null, error: e.message }));
    return () => {
      alive = false;
    };
  }, [url]);
  return state;
}

function Status({ error }) {
  return <p className="pub-empty">{error ? '불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' : '불러오는 중…'}</p>;
}

export default function PublicApp() {
  const { data: info } = usePublic('/info');
  const church = info?.churchName || '';
  useEffect(() => {
    if (church) document.title = church;
    setAppTitle(church); // 아이폰 홈 화면 아이콘 이름
  }, [church]);

  return (
    <BrowserRouter basename={BASE || '/'}>
      <div className="pub">
        <header className="pub-head">
          <Link to="/" className="pub-brand">
            <span className="brand-mark">✝</span>
            {church}
          </Link>
        </header>
        <nav className="pub-nav no-print">
          <NavLink to="/" end>홈</NavLink>
          <NavLink to="/news">교회 소식</NavLink>
          <NavLink to="/bulletins">주보</NavLink>
          <NavLink to="/sheets">악보</NavLink>
          <NavLink to="/events">행사 일정</NavLink>
          <NavLink to="/prayers">기도제목</NavLink>
          <NavLink to="/requests">요청·제보</NavLink>
        </nav>
        <main className="pub-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/bulletins" element={<BulletinList />} />
            <Route path="/bulletins/:id" element={<BulletinDetail church={church} />} />
            <Route path="/albums" element={<AlbumList />} />
            <Route path="/albums/:id" element={<AlbumDetail />} />
            <Route path="/sheets" element={<SheetList />} />
            <Route path="/sheets/:id" element={<SheetDetail />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/prayers" element={<PrayerBoard />} />
            <Route path="/requests" element={<RequestBoard />} />
            <Route path="*" element={<p className="pub-empty">없는 페이지입니다. <Link to="/">홈으로</Link></p>} />
          </Routes>
        </main>
        <footer className="pub-foot no-print">
          <span>{church}</span>
          <span><a href={churchPath('/admin')}>관리자 로그인</a> · <a href="/?pick=1">다른 교회</a></span>
        </footer>
      </div>
    </BrowserRouter>
  );
}

/* ---------------- 홈 ---------------- */
function Home() {
  const { data, error } = usePublic('/home');
  if (!data) return <Status error={error} />;
  const b = data.bulletin;
  return (
    <>
      <section className="pub-hero">
        <div className="pub-hero-label">이번 주 말씀</div>
        {b ? (
          <>
            <div className="pub-hero-date">{kdate(b.date)} · {b.title || '주일 예배'}</div>
            <h1>{b.sermon_title || '주일 예배'}</h1>
            <div className="pub-hero-sub">
              {b.scripture}
              {b.preacher && ` · ${b.preacher}`}
            </div>
            <Link className="pub-btn" to={`/bulletins/${b.id}`}>주보 보기</Link>
          </>
        ) : (
          <p>아직 올라온 주보가 없습니다.</p>
        )}
      </section>

      <InstallApp />

      <section className="pub-card">
        <div className="pub-card-head">
          <h2>교회 소식</h2>
          <Link to="/news">전체 보기</Link>
        </div>
        <NewsList items={data.news} />
      </section>

      {data.birthdays?.length > 0 && (
        <section className="pub-card">
          <div className="pub-card-head">
            <h2>🎂 이번 달 생일을 축하합니다</h2>
          </div>
          <ul className="pub-birthdays">
            {data.birthdays.map((b, i) => (
              <li key={i}>
                <span className="pub-bday-date">{b.month}/{b.day}</span>
                <span>
                  {b.name} <span className="pub-date">{b.position}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.albums?.length > 0 && (
        <section className="pub-card">
          <div className="pub-card-head">
            <h2>📷 교회 앨범</h2>
            <Link to="/albums">전체 보기</Link>
          </div>
          <AlbumCards items={data.albums} />
        </section>
      )}

      <section className="pub-card">
        <div className="pub-card-head">
          <h2>다가오는 행사</h2>
          <Link to="/events">전체 보기</Link>
        </div>
        <EventList items={data.events} upcoming />
      </section>
    </>
  );
}

/* ---------------- 교회 소식 ---------------- */
function NewsList({ items }) {
  const [open, setOpen] = useState(null);
  if (!items.length) return <p className="pub-empty">등록된 소식이 없습니다.</p>;
  return (
    <ul className="pub-news">
      {items.map((n) => {
        const key = `${n.kind || 'news'}-${n.id}`;
        return (
        <li key={key} className={n.pinned ? 'pinned' : ''}>
          <button onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}>
            <span className="pub-news-title">
              {!!n.pinned && <span className="tag red">공지</span>}
              {!n.pinned && n.category && <span className="tag">{n.category}</span>}
              {n.title}
            </span>
            <span className="pub-date">{n.date}</span>
          </button>
          {open === key && n.content && (
            <p className="pub-news-body">
              {n.content}
              {n.kind === 'prayer' && (
                <>
                  <br />
                  <span className="pub-date">— {n.nickname || '익명'} · <Link to="/prayers">기도제목 게시판</Link></span>
                </>
              )}
            </p>
          )}
        </li>
        );
      })}
    </ul>
  );
}

function NewsPage() {
  const [cat, setCat] = useState('');
  const { data, error } = usePublic('/news' + (cat ? `?category=${encodeURIComponent(cat)}` : ''));
  return (
    <section className="pub-card">
      <h2 className="pub-title">교회 소식</h2>
      <div className="pub-chips">
        <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>전체</button>
        {NEWS_CATS.map((c) => (
          <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>
        ))}
        <Link to="/albums" className="pub-chip-link">📷 교회 앨범</Link>
      </div>
      {data ? <NewsList items={data} /> : <Status error={error} />}
    </section>
  );
}

/* ---------------- 주보 ---------------- */
function BulletinList() {
  const { data, error } = usePublic('/bulletins');
  if (!data) return <Status error={error} />;
  return (
    <section className="pub-card">
      <h2 className="pub-title">주보</h2>
      {data.length ? (
        <ul className="pub-list">
          {data.map((b) => (
            <li key={b.id}>
              <Link to={`/bulletins/${b.id}`}>
                <span className="pub-list-main">
                  <strong>{kdate(b.date)}</strong>
                  <span>{b.sermon_title || b.title}</span>
                </span>
                <span className="pub-date">{b.scripture}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pub-empty">아직 올라온 주보가 없습니다.</p>
      )}
    </section>
  );
}

function BulletinDetail({ church }) {
  const { id } = useParams();
  const { data, error } = usePublic('/bulletins/' + id);
  return (
    <>
      <div className="pub-toolbar no-print">
        <Link to="/bulletins">← 주보 목록</Link>
        {data && (
          <span className="pub-toolbar-actions">
            {data.layout && <FlipBackOption className="pub-flip" />}
            <button className="pub-btn small" onClick={() => window.print()}>인쇄</button>
          </span>
        )}
      </div>
      {data?.layout && <p className="pub-print-tip no-print">인쇄 창에서 용지 A4·가로, '배경 그래픽'을 켜 주세요. 'PDF로 저장'도 됩니다.</p>}
      {data ? <PublicBulletin b={data} church={church} /> : <Status error={error} />}
    </>
  );
}

/** 4면 주보로 만든 주보는 인쇄본과 같은 모양으로, 예전 주보는 간단한 모양으로 */
function PublicBulletin({ b, church }) {
  const [t, setT] = useState(null);
  useEffect(() => {
    if (!b.layout) return;
    api.get('/public/bulletin-template').then((r) => setT(parseTemplate(r.template))).catch(() => setT(parseTemplate('')));
  }, [b.layout]);
  if (!b.layout) return <BulletinView b={b} church={church} />;
  if (!t) return <Status />;
  return (
    <div className="bp-preview">
      <BulletinSheets b={b} t={t} L={parseLayout(b.layout)} church={church} />
    </div>
  );
}

/* ---------------- 행사 일정 ---------------- */
function EventList({ items, upcoming }) {
  if (!items.length) return <p className="pub-empty">{upcoming ? '예정된 행사가 없습니다.' : '지난 행사가 없습니다.'}</p>;
  return (
    <ul className="pub-events">
      {items.map((e) => (
        <li key={e.id}>
          <div className="event-date">
            <div className="event-day">{Number(e.start_date.slice(8))}</div>
            <div className="small">{Number(e.start_date.slice(5, 7))}월</div>
          </div>
          <div className="event-info">
            <div className="event-title">
              {upcoming && <span className="tag blue">{dday(e.start_date)}</span>}
              {e.title}
            </div>
            <div className="pub-date">
              {kdate(e.start_date)}
              {e.end_date && e.end_date !== e.start_date && ` ~ ${kdate(e.end_date)}`}
              {e.location && ` · ${e.location}`}
            </div>
            {e.description && <div className="pub-event-desc">{e.description}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function EventsPage() {
  const { data, error } = usePublic('/events');
  const [showPast, setShowPast] = useState(false);
  if (!data) return <Status error={error} />;
  return (
    <section className="pub-card">
      <h2 className="pub-title">행사 일정</h2>
      <EventList items={data.upcoming} upcoming />
      {data.past.length > 0 && (
        <>
          <button className="pub-more" onClick={() => setShowPast((s) => !s)}>
            {showPast ? '지난 행사 접기' : `지난 행사 보기 (${data.past.length})`}
          </button>
          {showPast && <EventList items={data.past} />}
        </>
      )}
    </section>
  );
}
