import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Badge, Card, Loading, PageHeader, Stat } from '../components';
import { dday, kdate, num, won } from '../utils';

export default function Dashboard() {
  const [d, setD] = useState(null);
  useEffect(() => {
    api.get('/dashboard').then(setD).catch((e) => alert(e.message));
  }, []);
  if (!d) return <Loading />;
  const f = d.finance; // 재정 권한이 없으면 null
  const maxType = Math.max(1, ...(f?.byType || []).map((t) => t.amount));

  return (
    <>
      <PageHeader title="대시보드" desc={`${kdate(d.today)} 기준 현황`} />
      <div className="stats">
        <Stat label="재적 교인" value={`${num(d.members.active)}명`} sub={`이번 달 새로 등록 ${d.members.newThisMonth}명`} />
        {f && (
          <>
            <Stat label="이번 달 헌금" value={won(f.month.offering)} />
            <Stat label="이번 달 수입 / 지출" value={won(f.month.income)} sub={`지출 ${won(f.month.expense)}`} />
            <Stat label="교회 장부 잔액" value={won(f.balance)} tone={f.balance < 0 ? 'neg' : ''} />
          </>
        )}
      </div>

      <div className="grid2">
        {f && (
        <Card title="이번 달 헌금 (종류별)" actions={<Link className="more" to="/offerings">헌금 관리 →</Link>}>
          {f.byType.length ? (
            <ul className="bars">
              {f.byType.map((t) => (
                <li key={t.name}>
                  <span className="bar-label">{t.name}</span>
                  <span className="bar">
                    <span style={{ width: `${(t.amount / maxType) * 100}%` }} />
                  </span>
                  <span className="bar-value">{won(t.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">이번 달 헌금 기록이 없습니다.</p>
          )}
        </Card>
        )}

        <Card
          title={`최근 출석${d.attendance.date ? ` · ${d.attendance.date}` : ''}`}
          actions={<Link className="more" to="/attendance">출석 관리 →</Link>}
        >
          {d.attendance.list.length ? (
            <ul className="simple">
              {d.attendance.list.map((a) => (
                <li key={a.name}>
                  <span>{a.name}</span>
                  <strong>{a.cnt}명</strong>
                </li>
              ))}
              <li className="total">
                <span>합계</span>
                <strong>{d.attendance.list.reduce((s, a) => s + a.cnt, 0)}명</strong>
              </li>
            </ul>
          ) : (
            <p className="empty">출석 기록이 없습니다.</p>
          )}
        </Card>

        <Card title="교회 소식" actions={<Link className="more" to="/news">전체 보기 →</Link>}>
          {d.news.length ? (
            <ul className="simple">
              {d.news.map((n) => (
                <li key={n.id}>
                  <span>
                    {n.pinned ? <Badge tone="red">고정</Badge> : n.category && <Badge>{n.category}</Badge>} {n.title}
                  </span>
                  <span className="muted small">{n.date}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">등록된 소식이 없습니다.</p>
          )}
        </Card>

        <Card title="다가오는 행사" actions={<Link className="more" to="/events">일정 보기 →</Link>}>
          {d.events.length ? (
            <ul className="simple">
              {d.events.map((e) => (
                <li key={e.id}>
                  <span>
                    <Badge tone="blue">{dday(e.start_date)}</Badge> {e.title}
                  </span>
                  <span className="muted small">{e.start_date}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">예정된 행사가 없습니다.</p>
          )}
        </Card>

        <Card title={`이번 달 생일 (${d.birthdays.length}명)`} actions={<Link className="more" to="/members">교인 관리 →</Link>}>
          {d.birthdays.length ? (
            <ul className="simple">
              {d.birthdays.map((b) => (
                <li key={b.id}>
                  <span>
                    {b.name} <span className="muted small">{b.position}</span>
                  </span>
                  <span className="muted small">{b.birth_date.slice(5).replace('-', '월 ')}일</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">이번 달 생일인 교인이 없습니다.</p>
          )}
        </Card>
      </div>
    </>
  );
}
