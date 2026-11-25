// 화면 코드 자동 검사 (npm run lint). 실수로 이어지는 것만 잡고, 띄어쓰기 같은 모양은 검사하지 않음
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'dist-*/**', 'api/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/jsx-uses-vars': 'error', // JSX 에서 쓴 컴포넌트를 '안 쓴 변수'로 보지 않게
      'react/jsx-key': 'error', // 목록에 key 빠짐
      'react/jsx-no-undef': 'error', // import 안 한 컴포넌트
      'react-hooks/rules-of-hooks': 'error', // if 안에서 useState 같은 잘못된 훅 사용
      'react-hooks/exhaustive-deps': 'warn', // useEffect 의존 값 빠짐
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['src/**/*.test.{js,jsx}', 'scripts/**/*.{js,mjs}', '*.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
