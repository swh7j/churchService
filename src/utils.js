export const ymd = (d) => d.toLocaleDateString('sv-SE');
export const today = () => ymd(new Date());
export const num = (n) => (Number(n) || 0).toLocaleString('ko-KR');
export const won = (n) => num(n) + '원';

export const lastSunday = () => {
  const t = new Date();
  t.setDate(t.getDate() - t.getDay());
  return ymd(t);
};
export const nextSunday = () => {
  const t = new Date();
  t.setDate(t.getDate() + ((7 - t.getDay()) % 7));
  return ymd(t);
};
export const addDays = (s, n) => {
  const t = new Date(s + 'T00:00:00');
  t.setDate(t.getDate() + n);
  return ymd(t);
};
export const monthStart = (s = today()) => s.slice(0, 7) + '-01';
export const monthEnd = (s = today()) => {
  const [y, m] = s.split('-').map(Number);
  return ymd(new Date(y, m, 0));
};
export const weekday = (s) => '일월화수목금토'[new Date(s + 'T00:00:00').getDay()];
export const kdate = (s) => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일 (${weekday(s)})`;
};
export const dday = (s) => {
  const diff = Math.round((new Date(s + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
  if (diff === 0) return 'D-Day';
  return diff > 0 ? `D-${diff}` : '진행 중';
};

export const groupBy = (arr, fn) =>
  arr.reduce((m, x) => {
    const k = fn(x);
    (m[k] ||= []).push(x);
    return m;
  }, {});

// 엑셀에서 한글이 깨지지 않도록 BOM을 붙인 CSV
export function downloadCSV(filename, header, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
