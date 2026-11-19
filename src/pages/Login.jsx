import { useState } from 'react';
import { api } from '../api';

export default function Login({ auth, onDone }) {
  const setup = !!auth.setupRequired;
  const needToken = setup && !!auth.setupTokenRequired;
  const [f, setF] = useState({ name: '', username: '', password: '', confirm: '', setupToken: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (setup && f.password !== f.confirm) return setErr('비밀번호 확인이 다릅니다.');
    setBusy(true);
    try {
      if (setup) await api.post('/auth/setup', { name: f.name, username: f.username, password: f.password, setupToken: f.setupToken });
      else await api.post('/auth/login', { username: f.username, password: f.password });
      onDone();
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark big">✝</div>
        <h1>{auth.churchName || '교회'} 관리 시스템</h1>
        {setup ? (
          <p className="muted">
            처음 사용하시네요. <strong>관리자 계정</strong>을 만들어 주세요.
            <br />
            이 계정으로 다른 사용자(재정 담당 등)를 추가할 수 있습니다.
          </p>
        ) : (
          <p className="muted">{auth.expired ? '로그인 시간이 지나 다시 로그인이 필요합니다.' : '아이디와 비밀번호를 입력하세요.'}</p>
        )}
        {auth.error && <p className="login-error">서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요.</p>}

        {needToken && (
          <div className="field">
            <label htmlFor="l_token">설치 코드</label>
            <input id="l_token" value={f.setupToken} onChange={set('setupToken')} required autoComplete="off" autoFocus />
            <small className="muted">서버 설치가 끝날 때 화면에 나온 8자리 코드</small>
          </div>
        )}
        {setup && (
          <div className="field">
            <label htmlFor="l_name">이름</label>
            <input id="l_name" value={f.name} onChange={set('name')} required autoFocus />
          </div>
        )}
        <div className="field">
          <label htmlFor="l_user">아이디</label>
          <input id="l_user" value={f.username} onChange={set('username')} required autoComplete="username" autoFocus={!setup} />
          {setup && <small className="muted">영문·숫자 3~30자</small>}
        </div>
        <div className="field">
          <label htmlFor="l_pw">비밀번호</label>
          <input id="l_pw" type="password" value={f.password} onChange={set('password')} required autoComplete={setup ? 'new-password' : 'current-password'} />
          {setup && <small className="muted">8자 이상</small>}
        </div>
        {setup && (
          <div className="field">
            <label htmlFor="l_pw2">비밀번호 확인</label>
            <input id="l_pw2" type="password" value={f.confirm} onChange={set('confirm')} required autoComplete="new-password" />
          </div>
        )}
        {err && <p className="login-error" role="alert">{err}</p>}
        <button className="btn primary block" disabled={busy}>{setup ? '관리자 계정 만들기' : '로그인'}</button>
        <a className="login-back" href="/">← 성도 화면으로</a>
      </form>
    </div>
  );
}
