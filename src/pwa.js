// 휴대폰 홈 화면 앱(PWA): 교회별 앱 정보(manifest) 연결, 서비스 워커 등록, 설치 가능 상태 알려 주기
import { BASE, CHURCH } from './church';

let deferred = null; // 안드로이드 크롬 등: 설치 창을 띄울 수 있는 이벤트
const listeners = new Set();
const notify = () => listeners.forEach((f) => f());

function addHead(tag, attrs) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  document.head.appendChild(el);
  return el;
}

let titleMeta = null;

/** kind: 'member'(성도 화면) | 'admin'(관리자 화면) */
export function setupPwa(kind) {
  if (!CHURCH) return;
  addHead('link', { rel: 'manifest', href: `${BASE}${kind === 'admin' ? '/admin' : ''}/manifest.webmanifest` });
  addHead('link', { rel: 'apple-touch-icon', href: `/icons/${kind}-apple-180.png` });
  titleMeta = addHead('meta', { name: 'apple-mobile-web-app-title', content: '' });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // 브라우저가 멋대로 띄우지 않고, 우리 버튼을 눌렀을 때 띄움
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });

  // 서비스 워커: https 또는 내 PC(localhost)에서만 동작
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}));
  }
}

/** 아이폰 홈 화면에 붙을 이름 (교회 이름을 받은 뒤 설정) */
export function setAppTitle(name) {
  if (titleMeta && name) titleMeta.setAttribute('content', name);
}

const ua = () => navigator.userAgent || '';
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/i.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/i.test(ua());
// 카카오톡·네이버·인스타그램 등 앱 안 브라우저는 홈 화면 추가가 안 됨
const isInApp = () => /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps/i.test(ua());

/**
 * 지금 기기에서 설치하는 방법
 *  'installed' 이미 앱으로 열림 · 'prompt' 버튼으로 바로 설치 · 'inapp' 다른 브라우저로 열어야 함
 *  'ios' 사파리 공유 메뉴 · 'android' 브라우저 메뉴 · null 안내 없음(PC 등)
 */
export function installMode() {
  if (isStandalone()) return 'installed';
  if (isInApp()) return 'inapp';
  if (deferred) return 'prompt';
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  return null;
}

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
  deferred = null;
  notify();
  return outcome === 'accepted';
}

export function onInstallChange(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}
