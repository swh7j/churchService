// 성도 화면: 교회 앨범 (교회 소식 → 교회 앨범). 목록에는 작은 사진만, 누르면 큰 사진
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { coverUrl, photoUrl } from '../pages/album/photo';
import { kdate } from '../utils';

function useLoad(url) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let alive = true;
    setState({ data: null, error: null });
    api.get(url).then((data) => alive && setState({ data, error: null })).catch((e) => alive && setState({ data: null, error: e.message }));
    return () => {
      alive = false;
    };
  }, [url]);
  return state;
}

const Status = ({ error }) => <p className="pub-empty">{error ? '불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' : '불러오는 중…'}</p>;

/** 앨범 카드 목록 (홈 화면에서도 씀) */
export function AlbumCards({ items }) {
  return (
    <div className="pub-albums">
      {items.map((a) => (
        <Link key={a.id} to={`/albums/${a.id}`} className="pub-album">
          <span className="pub-album-cover">{coverUrl(a, true) && <img src={coverUrl(a, true)} alt="" loading="lazy" />}</span>
          <span className="pub-album-title">{a.title}</span>
          <span className="pub-date">{kdate(a.date)} · {a.count}장</span>
        </Link>
      ))}
    </div>
  );
}

export function AlbumList() {
  const { data, error } = useLoad('/public/albums');
  return (
    <section className="pub-card">
      <div className="pub-card-head">
        <h2 className="pub-title">교회 앨범</h2>
        <Link to="/news">← 교회 소식</Link>
      </div>
      {!data ? <Status error={error} /> : data.length ? <AlbumCards items={data} /> : <p className="pub-empty">아직 올라온 앨범이 없습니다.</p>}
    </section>
  );
}

export function AlbumDetail() {
  const { id } = useParams();
  const { data, error } = useLoad('/public/albums/' + id);
  const [open, setOpen] = useState(null); // 크게 보는 사진 번호
  return (
    <>
      <div className="pub-toolbar">
        <Link to="/albums">← 앨범 목록</Link>
      </div>
      {data ? (
        <section className="pub-card">
          <h2 className="pub-title">{data.title}</h2>
          <div className="pub-date">{kdate(data.date)} · 사진 {data.photos.length}장</div>
          {data.description && <p className="pub-album-desc">{data.description}</p>}
          <div className="pub-photos">
            {data.photos.map((p, i) => (
              <button key={p.id} onClick={() => setOpen(i)} aria-label={`${i + 1}번째 사진 크게 보기`}>
                <img src={photoUrl(data.id, p, { thumb: true, pub: true })} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <Status error={error} />
      )}
      {data && open !== null && <Viewer album={data} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

/** 사진 크게 보기: ← → 키, 옆으로 밀기, 바깥 누르면 닫기 */
function Viewer({ album, index, onIndex, onClose }) {
  const n = album.photos.length;
  const go = (d) => onIndex((index + d + n) % n);
  const touch = useRef(null);
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  });
  const p = album.photos[index];
  const src = photoUrl(album.id, p, { pub: true });
  // 다음 사진 미리 받아 두기
  useEffect(() => {
    const next = album.photos[(index + 1) % n];
    if (next) new Image().src = photoUrl(album.id, next, { pub: true });
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="viewer"
      role="dialog"
      aria-label="사진 크게 보기"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touch.current ?? 0);
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touch.current = null;
      }}
    >
      <div className="viewer-bar">
        <span>{index + 1} / {n}</span>
        <span>
          <a href={src} target="_blank" rel="noreferrer">원본 열기</a>
          <button onClick={onClose} aria-label="닫기">✕</button>
        </span>
      </div>
      <img key={p.id} src={src} alt="" onClick={(e) => e.target === e.currentTarget && go(1)} />
      {n > 1 && (
        <>
          <button className="viewer-nav prev" onClick={() => go(-1)} aria-label="이전 사진">‹</button>
          <button className="viewer-nav next" onClick={() => go(1)} aria-label="다음 사진">›</button>
        </>
      )}
    </div>
  );
}
