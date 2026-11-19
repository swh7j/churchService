import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import PublicApp from './public/PublicApp';
import './styles.css';

// /admin 으로 시작하면 관리자 화면, 그 외에는 성도 화면
const path = window.location.pathname;
const isAdmin = path === '/admin' || path.startsWith('/admin/');

createRoot(document.getElementById('root')).render(<StrictMode>{isAdmin ? <App /> : <PublicApp />}</StrictMode>);
