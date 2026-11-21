// 전체 관리자 페이지 (/platform): 교회 등록·관리, 예배 PPT 공통 양식, 전체 관리자 계정
// 교회 관리자 계정과 로그인이 따로입니다.
import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { api } from '../api';
import { Badge, Card, Form, Loading, Modal, PageHeader, useList } from '../components';
import Churches from './Churches';

// 첫 계정을 만들 때만 운영 교회 로그인 정보를 같이 보냄
async function withChurch(method, url, church, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'X-Church': church, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || '요청을 처리하지 못했습니다.');
  return data;
}

const ACCOUNT_FIELDS = [
  { name: 'name', label: '이름', required: true, full: true },
  { name: 'username', label: '아이디 (영문·숫자 3~30자)', required: true, full: true },
  { name: 'password', label: '비밀번호 (8자 이상)', type: 'password', required: true, full: true },
  { name: 'confirm', label: '비밀번호 확인', type: 'password', required: true, full: true },
];
const PASSWORD_FIELDS = [
  { name: 'current', label: '현재 비밀번호', type: 'password', required: true, full: true },
  { name: 'next', label: '새 비밀번호 (8자 이상)', type: 'password', required: true, full: true },
  { name: 'confirm', label: '새 비밀번호 확인', type: 'password', required: true, full: true },
];
const RESET_FIELDS = [{ name: 'password', label: '새 비밀번호 (8자 이상)', type: 'password', required: true, full: true }];

function Login({ me, onDone }) {
  const [f, setF] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const pc = me.platformChurch;

  const login = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.post('/platform/login', f);
      onDone();
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  };
  const setup = async (v) => {
    if (v.password !== v.confirm) throw new Error('비밀번호 확인이 다릅니다.');
    await withChurch('POST', '/platform/setup', pc.code, { name: v.name, username: v.username, password: v.password });
    onDone();
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand-mark big">⚙</div>
        <h1>전체 관리자</h1>
        {me.setupRequired ? (
          me.canSetup ? (
            <>
              <p className="muted">
                처음 사용하시네요. <strong>전체 관리자 계정</strong>을 만들어 주세요.
                <br />
                교회 관리자 계정과는 별도의 아이디·비밀번호입니다.
              </p>
              <Form fields={ACCOUNT_FIELDS} initial={{}} onSubmit={setup} submitLabel="전체 관리자 계정 만들기" />
            </>
          ) : (
            <>
              <p className="muted">
                아직 전체 관리자 계정이 없습니다.
                <br />
                <strong>{pc.name}</strong> 관리자 화면에 먼저 로그인한 뒤, 왼쪽 메뉴 아래의 <strong>'전체 관리자 페이지 만들기'</strong>를 눌러 주세요.
              </p>
              <a className="btn primary block" href={`/c/${pc.code}/admin`}>{pc.name} 관리자 화면으로</a>
            </>
          )
        ) : (
          <form onSubmit={login}>
            <p className="muted">교회 등록과 공통 양식을 관리합니다.</p>
            <div className="field">
              <label htmlFor="p_user">아이디</label>
              <input id="p_user" value={f.username} onChange={(e) => setF((s) => ({ ...s, username: e.target.value }))} required autoComplete="username" autoFocus />
            </div>
            <div className="field">
              <label htmlFor="p_pw">비밀번호</label>
              <input id="p_pw" type="password" value={f.password} onChange={(e) => setF((s) => ({ ...s, password: e.target.value }))} required autoComplete="current-password" />
            </div>
            {err && <p className="login-error" role="alert">{err}</p>}
            <button className="btn primary block" disabled={busy}>로그인</button>
          </form>
        )}
        <a className="login-back" href="/?pick=1">교회 선택 화면으로</a>
      </div>
    </div>
  );
}

function CommonPpt() {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/platform/common-ppt').then(setInfo).catch((e) => alert(e.message));
  useEffect(() => {
    load();
  }, []);
  const upload = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try {
      const res = await fetch('/api/platform/common-ppt', { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || '올리지 못했습니다.');
      setInfo(await res.json());
    } catch (x) {
      alert(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="예배 PPT 공통 양식" desc="모든 교회가 관리자 화면(주보 관리 → 예배 PPT)에서 받아 쓸 수 있는 기본 서식입니다." />
      <Card>
        {info === null ? (
          <Loading />
        ) : info.size ? (
          <p>
            올라가 있는 양식: <strong>예배PPT_공통양식.pptx</strong> <span className="muted small">({(info.size / 1024 / 1024).toFixed(1)} MB · {info.updated_at} 기준)</span>
          </p>
        ) : (
          <p className="muted">아직 공통 양식이 없습니다.</p>
        )}
        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          {info?.size ? <a className="btn" href="/api/platform/common-ppt/file" download="예배PPT_공통양식.pptx">받기</a> : null}
          <label className="btn primary">
            <input type="file" accept=".pptx" hidden onChange={upload} disabled={busy} />
            {busy ? '올리는 중…' : info?.size ? '새 양식으로 바꾸기' : '양식 올리기'}
          </label>
        </div>
        <ul className="info-list" style={{ marginTop: 14 }}>
          <li>매주 바뀌는 자리에는 <code>{'{영광송}'}</code>, <code>{'{찬송 제목}'}</code>, <code>{'{기도 담당}'}</code>, <code>{'{교회소식}'}</code> 같은 자리 표시를 넣어 두세요.</li>
          <li>교회 이름·표어·사명선언문처럼 교회마다 다른 내용은 "입력해 주세요" 같은 안내 문구로 두면, 각 교회가 받아서 고쳐 씁니다.</li>
        </ul>
      </Card>
    </>
  );
}

function Accounts({ me }) {
  const { rows, reload } = useList('/platform/users');
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(null);
  const add = async (v) => {
    if (v.password !== v.confirm) throw new Error('비밀번호 확인이 다릅니다.');
    await api.post('/platform/users', { name: v.name, username: v.username, password: v.password });
    setAdding(false);
    reload();
  };
  const toggle = (u) => api.put(`/platform/users/${u.id}`, { active: u.active ? 0 : 1 }).then(reload).catch((e) => alert(e.message));
  const reset = async (v) => {
    await api.put(`/platform/users/${resetting.id}`, { password: v.password });
    setResetting(null);
    alert('비밀번호를 바꿨습니다.');
  };
  return (
    <>
      <PageHeader title="전체 관리자 계정" desc="교회 등록·공통 양식을 관리할 수 있는 계정입니다. 교회 관리자 계정과는 별도입니다.">
        <button className="btn primary" onClick={() => setAdding(true)}>+ 계정 추가</button>
      </PageHeader>
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>이름</th><th>아이디</th><th>상태</th><th>마지막 로그인</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>{u.name} {u.id === me.id && <Badge tone="blue">나</Badge>}</td>
                  <td>{u.username}</td>
                  <td>{u.active ? <Badge tone="green">사용</Badge> : <Badge tone="amber">중지</Badge>}</td>
                  <td className="small">{u.last_login || '-'}</td>
                  <td className="row-actions">
                    {u.id !== me.id && <button className="btn sm" onClick={() => setResetting(u)}>비밀번호 바꾸기</button>}
                    {u.id !== me.id && <button className={'btn sm' + (u.active ? ' danger' : '')} onClick={() => toggle(u)}>{u.active ? '중지' : '다시 사용'}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {adding && (
        <Modal title="전체 관리자 계정 추가" onClose={() => setAdding(false)}>
          <Form fields={ACCOUNT_FIELDS} initial={{}} onSubmit={add} onCancel={() => setAdding(false)} submitLabel="추가" />
        </Modal>
      )}
      {resetting && (
        <Modal title={`${resetting.name} 비밀번호 바꾸기`} onClose={() => setResetting(null)}>
          <Form fields={RESET_FIELDS} initial={{}} onSubmit={reset} onCancel={() => setResetting(null)} submitLabel="바꾸기" />
        </Modal>
      )}
    </>
  );
}

function Main({ user, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  useEffect(() => {
    document.title = '전체 관리자';
  }, []);
  const changePassword = async (v) => {
    if (v.next !== v.confirm) throw new Error('새 비밀번호가 서로 다릅니다.');
    await api.post('/platform/password', { current: v.current, next: v.next });
    setPwOpen(false);
    alert('비밀번호를 변경했습니다.');
  };
  return (
    <div className={'layout' + (menuOpen ? ' menu-open' : '')}>
      <header className="topbar no-print">
        <button className="icon-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="메뉴 열기">☰</button>
        <strong>전체 관리자</strong>
      </header>
      <aside className="sidebar no-print">
        <div className="brand">
          <div className="brand-mark">⚙</div>
          <div>
            <div className="brand-name">전체 관리자</div>
            <div className="brand-sub">교회 관리 시스템</div>
          </div>
        </div>
        <nav onClick={() => setMenuOpen(false)}>
          <div className="nav-group">
            <NavLink to="/" end>교회 목록</NavLink>
            <NavLink to="/common-ppt">예배 PPT 공통 양식</NavLink>
            <NavLink to="/accounts">전체 관리자 계정</NavLink>
          </div>
        </nav>
        <a className="public-link" href="/?pick=1" target="_blank" rel="noreferrer">교회 선택 화면 ↗</a>
        <div className="account">
          <div className="account-name">{user.name}</div>
          <div className="account-role">전체 관리자 · {user.username}</div>
          <div className="account-actions">
            <button onClick={() => setPwOpen(true)}>비밀번호 변경</button>
            <button onClick={onLogout}>로그아웃</button>
          </div>
        </div>
      </aside>
      <div className="scrim no-print" onClick={() => setMenuOpen(false)} />
      <main className="content">
        <Routes>
          <Route path="/" element={<Churches />} />
          <Route path="/common-ppt" element={<CommonPpt />} />
          <Route path="/accounts" element={<Accounts me={user} />} />
          <Route path="*" element={<p className="empty">없는 페이지입니다.</p>} />
        </Routes>
      </main>
      {pwOpen && (
        <Modal title="비밀번호 변경" onClose={() => setPwOpen(false)}>
          <Form fields={PASSWORD_FIELDS} initial={{}} onSubmit={changePassword} onCancel={() => setPwOpen(false)} submitLabel="변경" />
        </Modal>
      )}
    </div>
  );
}

function Shell() {
  const [me, setMe] = useState(null);
  const load = useCallback(async () => {
    try {
      let m = await api.get('/platform/me');
      // 첫 계정 전: 운영 교회 관리자로 로그인했는지 확인
      if (m.setupRequired) m = await withChurch('GET', '/platform/me', m.platformChurch.code);
      setMe(m);
    } catch (e) {
      setMe({ error: e.message, platformChurch: { code: '', name: '' } });
    }
  }, []);
  useEffect(() => {
    load();
    const expired = () => setMe((m) => ({ ...m, user: null }));
    window.addEventListener('auth:expired', expired);
    return () => window.removeEventListener('auth:expired', expired);
  }, [load]);
  const logout = async () => {
    await api.post('/platform/logout').catch(() => {});
    load();
  };
  if (!me) return <Loading />;
  if (me.error) return <p className="empty">서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.</p>;
  if (!me.user) return <Login me={me} onDone={load} />;
  return <Main user={me.user} onLogout={logout} />;
}

export default function PlatformApp() {
  return (
    <BrowserRouter basename="/platform">
      <Shell />
    </BrowserRouter>
  );
}
