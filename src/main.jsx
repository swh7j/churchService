import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CHURCH, REST, rememberChurch } from './church';
import ChurchSelect from './public/ChurchSelect';
import PublicApp from './public/PublicApp';
import './styles.css';

// 주소: /c/{교회코드} → 성도 화면, /c/{교회코드}/admin → 관리자 화면, 그 외 → 교회 선택
const isAdmin = REST === '/admin' || REST.startsWith('/admin/');
if (CHURCH) rememberChurch(CHURCH);

createRoot(document.getElementById('root')).render(
  <StrictMode>{!CHURCH ? <ChurchSelect /> : isAdmin ? <App /> : <PublicApp />}</StrictMode>,
);
