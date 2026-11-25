import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT) || 5173,
    // Spring Boot API (api 폴더) — 이전 Node 서버로 실행하려면 API_PORT=3001
    proxy: { '/api': `http://localhost:${process.env.API_PORT || 8080}` },
  },
  // 화면 테스트 (npm test): 브라우저 흉내(jsdom)로 실행
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
  },
});
