import { CHURCH } from './church';

const OFFLINE_MSG = '인터넷 연결이 잠깐 끊겨 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 요청이 서버에 닿기 전에 끊기면 브라우저가 알 수 없는 영어 오류를 냄
 * (아이폰 사파리 'Load failed', 크롬 'Failed to fetch'). 화면을 잠깐 내렸다 오거나 와이파이↔데이터가 바뀔 때 흔함.
 * 조회(GET)는 한 번 더 시도하고, 그래도 안 되면 한국어 안내로 바꿈. 저장(POST 등)은 두 번 저장될 수 있어 다시 보내지 않음.
 */
async function send(method, url, init) {
  for (let tries = method === 'GET' ? 2 : 1; ; tries--) {
    try {
      return await fetch('/api' + url, init);
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      if (tries <= 1) throw new Error(OFFLINE_MSG);
      await wait(1000);
    }
  }
}

async function request(method, url, body) {
  const res = await send(method, url, {
    method,
    // 어느 교회 데이터인지 (서버 ChurchFilter)
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(CHURCH ? { 'X-Church': CHURCH } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  // 로그인이 풀린 경우 → 로그인 화면으로
  if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event('auth:expired'));
  if (!res.ok) throw new Error(data?.error || '요청을 처리하지 못했습니다. 서버가 실행 중인지 확인해 주세요.');
  return data;
}

const query = (params) => {
  if (!params) return '';
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const s = new URLSearchParams(clean).toString();
  return s ? '?' + s : '';
};

export const api = {
  get: (url, params) => request('GET', url + query(params)),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};

// id가 있으면 수정, 없으면 새로 등록
export const saveRow = (resource, v) => (v.id ? api.put(`/${resource}/${v.id}`, v) : api.post(`/${resource}`, v));
