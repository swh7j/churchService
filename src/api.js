async function request(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
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
