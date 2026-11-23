// 홈 화면 앱(PWA)용 서비스 워커.
// 화면·데이터는 저장해 두지 않고 늘 서버에서 새로 받음 (배포하면 바로 새 화면, 오래된 화면이 남는 문제 없음).
// 인터넷이 끊겼을 때만 '연결 확인' 안내 화면을 보여 줌.
const OFFLINE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>연결 안 됨</title><style>body{font-family:system-ui,'Malgun Gothic',sans-serif;background:#f6f4ef;color:#1b2440;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}
.box{max-width:320px}.icon{font-size:44px}button{margin-top:16px;padding:10px 22px;border:0;border-radius:999px;background:#1b2440;color:#fff;font-size:15px}</style></head>
<body><div class="box"><div class="icon">📶</div><h2>인터넷에 연결되어 있지 않아요</h2><p>와이파이나 데이터 연결을 확인한 뒤 다시 시도해 주세요.</p>
<button onclick="location.reload()">다시 시도</button></div></body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  // 화면 이동(페이지 열기)만 다룸. 실패하면 안내 화면
  if (e.request.mode !== 'navigate') return;
  e.respondWith(
    fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })),
  );
});
