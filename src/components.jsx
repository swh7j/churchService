import { createContext, useCallback, useEffect, useState } from 'react';
import { api } from './api';

export const AppCtx = createContext({ settings: {}, reloadSettings: () => {}, user: null, can: () => false });

// 역할별 사용 가능 영역 (서버 server/auth.js 와 같은 규칙)
const ROLE_AREAS = { admin: ['admin', 'finance', 'church'], finance: ['finance'], staff: ['church'] };
export const canDo = (user, area) => !area || !!ROLE_AREAS[user?.role]?.includes(area);
export const ROLE_LABELS = { admin: '관리자', finance: '재정 담당', staff: '교역자·사역 담당' };

export function PageHeader({ title, desc, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {desc && <p className="muted">{desc}</p>}
      </div>
      {children && <div className="actions no-print">{children}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={'card ' + className}>
      {(title || actions) && (
        <div className="card-head">
          {title ? <h2>{title}</h2> : <span />}
          {actions && <div className="actions no-print">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone = '' }) {
  return (
    <div className={'stat ' + tone}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export const Badge = ({ tone = 'gray', children }) => <span className={'badge ' + tone}>{children}</span>;
export const Loading = () => <p className="empty">불러오는 중…</p>;

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <div className="modal-head no-print">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const norm = (o) => (typeof o === 'object' ? o : { value: o, label: o });

export function Field({ f, value, onChange }) {
  const id = 'f_' + f.name;
  const common = {
    id,
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
    required: f.required,
    placeholder: f.placeholder,
  };
  let input;
  if (f.type === 'select') {
    input = (
      <select {...common}>
        <option value="">{f.empty || '선택'}</option>
        {(f.options || []).map(norm).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (f.type === 'textarea') {
    input = <textarea rows={f.rows || 4} {...common} />;
  } else if (f.type === 'checkbox') {
    return (
      <div className={'field check-field' + (f.full ? ' full' : '')}>
        <label className="check">
          <input type="checkbox" checked={!!Number(value)} onChange={(e) => onChange(e.target.checked ? 1 : 0)} /> {f.label}
        </label>
      </div>
    );
  } else if (f.type === 'money') {
    input = <input type="number" min="1" step="1" inputMode="numeric" {...common} />;
  } else {
    input = <input type={f.type || 'text'} {...common} />;
  }
  return (
    <div className={'field' + (f.full ? ' full' : '')}>
      <label htmlFor={id}>
        {f.label}
        {f.required && <span className="req">*</span>}
      </label>
      {input}
      {f.help && <small className="muted">{f.help}</small>}
    </div>
  );
}

export function Form({ fields, initial = {}, onSubmit, onCancel, submitLabel = '저장' }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(v);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        {fields.map((f) => (
          <Field key={f.name} f={f} value={v[f.name]} onChange={(x) => setV((s) => ({ ...s, [f.name]: x }))} />
        ))}
      </div>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            취소
          </button>
        )}
        <button className="btn primary" disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

// 목록 조회 + 다시 불러오기
export function useList(path, params) {
  const key = JSON.stringify(params || {});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    return api
      .get(path, JSON.parse(key))
      .then(setRows)
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, [path, key]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { rows, reload, loading };
}

export async function confirmDelete(message, fn) {
  if (!confirm(message)) return false;
  try {
    await fn();
    return true;
  } catch (e) {
    alert(e.message);
    return false;
  }
}
