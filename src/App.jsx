import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api';
import { AppCtx, canDo, Form, Loading, Modal } from './components';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import Attendance from './pages/Attendance';
import Offerings from './pages/Offerings';
import Ledger from './pages/Ledger';
import Reports from './pages/Reports';
import Groups from './pages/Groups';
import Prayers from './pages/Prayers';
import News from './pages/News';
import Bulletins from './pages/Bulletins';
import Sheets from './pages/Sheets';
import Events from './pages/Events';
import Settings from './pages/Settings';
import Users from './pages/Users';
import Backup from './pages/Backup';
import Audit from './pages/Audit';

// [경로, 메뉴 이름, 화면, 필요한 영역]
const NAV = [
  { items: [['/', '대시보드', Dashboard, null]] },
  { section: '교인', items: [['/members', '교인 관리', Members, 'church'], ['/attendance', '출석 관리', Attendance, 'church']] },
  {
    section: '재정',
    items: [
      ['/offerings', '헌금 입금·관리', Offerings, 'finance'],
      ['/ledger', '회계 장부', Ledger, 'finance'],
      ['/reports', '결산 보고서', Reports, 'finance'],
      ['/groups', '소모임 회계', Groups, 'finance'],
    ],
  },
  {
    section: '소통',
    items: [['/news', '교회 소식', News, 'church'], ['/bulletins', '주보 관리', Bulletins, 'church'], ['/sheets', '악보', Sheets, 'church'], ['/events', '행사 일정', Events, 'church'], ['/prayers', '기도제목 게시판', Prayers, 'church']],
  },
  {
    section: '관리',
    items: [
      ['/users', '사용자 관리', Users, 'admin'],
      ['/backup', '백업·복원', Backup, 'admin'],
      ['/audit', '활동 기록', Audit, 'admin'],
      ['/settings', '설정', Settings, 'admin'],
    ],
  },
];

const PASSWORD_FIELDS = [
  { name: 'current', label: '현재 비밀번호', type: 'password', required: true, full: true },
  { name: 'next', label: '새 비밀번호 (8자 이상)', type: 'password', required: true, full: true },
  { name: 'confirm', label: '새 비밀번호 확인', type: 'password', required: true, full: true },
];

function Main({ user, onLogout }) {
  const [settings, setSettings] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const location = useLocation();
  const can = useCallback((area) => canDo(user, area), [user]);
  const reloadSettings = useCallback(() => api.get('/settings').then(setSettings).catch(() => {}), []);
  useEffect(() => {
    reloadSettings();
  }, [reloadSettings]);
  useEffect(() => setMenuOpen(false), [location.pathname]);
  const churchName = settings.church_name || '우리교회';
  useEffect(() => {
    document.title = `${churchName} 관리 시스템`;
  }, [churchName]);

  const changePassword = async (v) => {
    if (v.next !== v.confirm) throw new Error('새 비밀번호가 서로 다릅니다.');
    await api.post('/auth/password', { current: v.current, next: v.next });
    setPwOpen(false);
    alert('비밀번호를 변경했습니다. 다른 기기에서는 다시 로그인해야 합니다.');
  };

  return (
    <AppCtx.Provider value={{ settings, reloadSettings, user, can }}>
      <div className={'layout' + (menuOpen ? ' menu-open' : '')}>
        <header className="topbar no-print">
          <button className="icon-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="메뉴 열기">☰</button>
          <strong>{churchName}</strong>
        </header>
        <aside className="sidebar no-print">
          <div className="brand">
            <div className="brand-mark">✝</div>
            <div>
              <div className="brand-name">{churchName}</div>
              <div className="brand-sub">교회 관리 시스템</div>
            </div>
          </div>
          <nav>
            {NAV.map((g, i) => {
              const items = g.items.filter(([, , , area]) => can(area));
              if (!items.length) return null;
              return (
                <div key={i} className="nav-group">
                  {g.section && <div className="nav-section">{g.section}</div>}
                  {items.map(([to, label]) => (
                    <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
                  ))}
                </div>
              );
            })}
          </nav>
          <a className="public-link" href="/" target="_blank" rel="noreferrer">성도 화면 보기 ↗</a>
          <div className="account">
            <div className="account-name">{user.name}</div>
            <div className="account-role">{user.roleLabel} · {user.username}</div>
            <div className="account-actions">
              <button onClick={() => setPwOpen(true)}>비밀번호 변경</button>
              <button onClick={onLogout}>로그아웃</button>
            </div>
          </div>
        </aside>
        <div className="scrim no-print" onClick={() => setMenuOpen(false)} />
        <main className="content">
          <Routes>
            {NAV.flatMap((g) => g.items).map(([to, , Page, area]) => (
              <Route key={to} path={to} element={can(area) ? <Page /> : <p className="empty">이 메뉴를 사용할 권한이 없습니다.</p>} />
            ))}
            <Route path="*" element={<p className="empty">없는 페이지입니다.</p>} />
          </Routes>
        </main>
      </div>
      {pwOpen && (
        <Modal title="비밀번호 변경" onClose={() => setPwOpen(false)}>
          <Form fields={PASSWORD_FIELDS} initial={{}} onSubmit={changePassword} onCancel={() => setPwOpen(false)} submitLabel="변경" />
        </Modal>
      )}
    </AppCtx.Provider>
  );
}

function Shell() {
  const [auth, setAuth] = useState(null);
  const loadMe = useCallback(
    () => api.get('/auth/me').then(setAuth).catch((e) => setAuth({ user: null, error: e.message })),
    [],
  );
  useEffect(() => {
    loadMe();
    const expired = () => setAuth((a) => ({ ...a, user: null, expired: true }));
    window.addEventListener('auth:expired', expired);
    return () => window.removeEventListener('auth:expired', expired);
  }, [loadMe]);

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    loadMe();
  };

  if (!auth) return <Loading />;
  if (!auth.user) return <Login auth={auth} onDone={loadMe} />;
  return <Main key={auth.user.id} user={auth.user} onLogout={logout} />;
}

// 관리자 화면은 /admin 아래 (메뉴 경로 '/members' → 실제 주소 '/admin/members')
export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <Shell />
    </BrowserRouter>
  );
}
