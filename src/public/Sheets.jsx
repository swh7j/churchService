// 성도 화면: 악보 목록 · 보기 (관리자가 여러 장을 한 장으로 합쳐 올린 것)
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { kdate } from '../utils';

const imageUrl = (s) => `/api/public/sheets/${s.id}/image?v=${encodeURIComponent(s.updated_at || '')}`;

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

export function SheetList() {
  const { data, error } = useLoad('/public/sheets');
  if (!data) return <Status error={error} />;
  return (
    <section className="pub-card">
      <h2 className="pub-title">악보</h2>
      {data.length ? (
        <ul className="pub-list">
          {data.map((s) => (
            <li key={s.id}>
              <Link to={`/sheets/${s.id}`}>
                <span className="pub-list-main">
                  <strong>{kdate(s.date)}</strong>
                  <span>{s.title}</span>
                </span>
                <span className="pub-date">{s.pages}장</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pub-empty">아직 올라온 악보가 없습니다.</p>
      )}
    </section>
  );
}

export function SheetDetail() {
  const { id } = useParams();
  const { data, error } = useLoad('/public/sheets/' + id);
  return (
    <>
      <div className="pub-toolbar no-print">
        <Link to="/sheets">← 악보 목록</Link>
        {data && <a className="pub-btn small" href={imageUrl(data)} target="_blank" rel="noreferrer">크게 보기</a>}
      </div>
      {data ? (
        <section className="pub-card sheet-card">
          <h2 className="pub-title">{data.title}</h2>
          <div className="pub-date">{kdate(data.date)}</div>
          <img className="sheet-full" src={imageUrl(data)} alt={data.title} />
        </section>
      ) : (
        <Status error={error} />
      )}
    </>
  );
}
