import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CHURCH, REST, rememberChurch } from './church';
import PlatformApp from './platform/PlatformApp';
import ChurchSelect from './public/ChurchSelect';
import PublicApp from './public/PublicApp';
import { setupPwa } from './pwa';
import './styles/index.css';

// 주소: /c/{교회코드} → 성도 화면, /c/{교회코드}/admin → 관리자 화면, /platform → 전체 관리자, 그 외 → 교회 선택
const isAdmin = REST === '/admin' || REST.startsWith('/admin/');
const isPlatform = !CHURCH && (REST === '/platform' || REST.startsWith('/platform/'));
if (CHURCH) rememberChurch(CHURCH);
// 홈 화면 앱: 성도용·관리자용이 따로 (이름·아이콘·시작 화면이 다름)
if (CHURCH) setupPwa(isAdmin ? 'admin' : 'member');

createRoot(document.getElementById('root')).render(
  <StrictMode>{isPlatform ? <PlatformApp /> : !CHURCH ? <ChurchSelect /> : isAdmin ? <App /> : <PublicApp />}</StrictMode>,
);
