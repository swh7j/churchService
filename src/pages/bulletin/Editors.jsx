// 주보 작성 화면 (매주 내용) + 주보 기본 정보 화면 (표지·비전·예배시간 등)
import { useState } from 'react';
import { api } from '../../api';
import { askConfirm } from '../../components';
import { deriveSummary, newsToAnnouncements, shrinkImage, volWeek } from './layout';
import './bulletin.css';

const upd = (obj, path, value) => {
  const next = structuredClone(obj);
  let o = next;
  for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
  o[path[path.length - 1]] = value;
  return next;
};

function Text({ label, value, onChange, placeholder, full, area, rows = 4, help }) {
  return (
    <div className={'field' + (full ? ' full' : '')}>
      <label>{label}</label>
      {area ? (
        <textarea rows={rows} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {help && <small className="muted">{help}</small>}
    </div>
  );
}

const move = (arr, i, d) => {
  const a = [...arr];
  const j = i + d;
  if (j < 0 || j >= a.length) return a;
  [a[i], a[j]] = [a[j], a[i]];
  return a;
};

function RowTools({ rows, i, set }) {
  return (
    <span className="be-tools">
      <button type="button" className="btn xs" onClick={() => set(move(rows, i, -1))} aria-label="위로">↑</button>
      <button type="button" className="btn xs" onClick={() => set(move(rows, i, 1))} aria-label="아래로">↓</button>
      <button type="button" className="btn xs danger" onClick={() => set(rows.filter((_, k) => k !== i))} aria-label="삭제">×</button>
    </span>
  );
}

/** 주일낮예배 순서: 구역(영광과 감사 등)마다 [¶ 일어섬, 순서, 내용, 담당] */
function MainOrder({ main, set }) {
  const setSec = (si, s) => set({ ...main, sections: main.sections.map((x, k) => (k === si ? s : x)) });
  return (
    <>
      {main.sections.map((s, si) => (
        <div key={si} className="be-sec">
          <div className="be-sec-head">
            <input value={s.title} placeholder="구역 제목 (예: 영광과 감사)" onChange={(e) => setSec(si, { ...s, title: e.target.value })} />
            <RowTools rows={main.sections} i={si} set={(sections) => set({ ...main, sections })} />
          </div>
          <table className="be-rows">
            <thead>
              <tr>
                <th title="일어서는 순서">¶</th>
                <th>순서</th>
                <th>내용 (찬송·본문·설교 제목 등)</th>
                <th>담당</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r, ri) => {
                const setRow = (patch) => setSec(si, { ...s, rows: s.rows.map((x, k) => (k === ri ? { ...x, ...patch } : x)) });
                return (
                  <tr key={ri}>
                    <td><input type="checkbox" checked={!!r.stand} onChange={(e) => setRow({ stand: e.target.checked })} aria-label="일어서는 순서" /></td>
                    <td><input value={r.item} onChange={(e) => setRow({ item: e.target.value })} /></td>
                    <td><input value={r.content} onChange={(e) => setRow({ content: e.target.value })} /></td>
                    <td><input value={r.who} onChange={(e) => setRow({ who: e.target.value })} /></td>
                    <td><RowTools rows={s.rows} i={ri} set={(rows) => setSec(si, { ...s, rows })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" className="btn sm" onClick={() => setSec(si, { ...s, rows: [...s.rows, { item: '', content: '', who: '', stand: false }] })}>+ 순서 추가</button>
        </div>
      ))}
      <button type="button" className="btn sm" onClick={() => set({ ...main, sections: [...main.sections, { title: '', rows: [] }] })}>+ 구역 추가</button>
    </>
  );
}

function SubOrder({ s, set }) {
  return (
    <div className="be-sub">
      <div className="form-grid three">
        <Text label="예배 이름" value={s.title} onChange={(v) => set({ ...s, title: v })} />
        <Text label="시간" value={s.time} onChange={(v) => set({ ...s, time: v })} />
        <Text label="사회" value={s.leader} onChange={(v) => set({ ...s, leader: v })} />
      </div>
      <table className="be-rows">
        <thead>
          <tr>
            <th>순서</th>
            <th>내용 (예: 218장, 렘 40:1-6)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r, i) => {
            const setRow = (patch) => set({ ...s, rows: s.rows.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
            return (
              <tr key={i}>
                <td><input value={r.item} onChange={(e) => setRow({ item: e.target.value })} /></td>
                <td><input value={r.content} onChange={(e) => setRow({ content: e.target.value })} /></td>
                <td><RowTools rows={s.rows} i={i} set={(rows) => set({ ...s, rows })} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="btn sm" onClick={() => set({ ...s, rows: [...s.rows, { item: '', content: '' }] })}>+ 순서 추가</button>
    </div>
  );
}

const TABS = ['기본·소식', '주일낮예배', '오후·수요예배', '봉사'];

/** 매주 주보 작성. initial: 주보 행 + layout(객체) */
export function BulletinEditor({ initial, template, onSave, onCancel }) {
  const [b, setB] = useState(initial);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const L = b.layout;
  const setL = (path, v) => setB((x) => ({ ...x, layout: upd(x.layout, path, v) }));
  const set = (k) => (v) => setB((x) => ({ ...x, [k]: v }));
  const auto = volWeek(b.date, template.volBaseYear);

  const importNews = async () => {
    if (!b.date) return alert('예배일을 먼저 입력해 주세요.');
    const news = await api.get('/news');
    const text = newsToAnnouncements(news, b.date);
    if (!text) return alert('상단 고정 글이나 이번 주(예배일 전 7일)에 올린 교회 소식이 없습니다.');
    if (b.announcements?.trim() && !(await askConfirm('지금 적힌 교회 소식을 지우고 교회 소식 메뉴의 글로 바꿀까요?', { ok: '바꾸기' }))) return;
    set('announcements')(text);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!b.date) return alert('예배일을 입력해 주세요.');
    setBusy(true);
    try {
      await onSave({ ...b, ...deriveSummary(L), layout: JSON.stringify(L) });
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="be">
      <div className="seg be-tabs">
        {TABS.map((x, i) => (
          <button key={x} type="button" className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{x}</button>
        ))}
      </div>

      {tab === 0 && (
        <div className="form-grid">
          <div className="field">
            <label>예배일<span className="req">*</span></label>
            <input type="date" value={b.date || ''} onChange={(e) => set('date')(e.target.value)} required />
          </div>
          <Text label="예배명 (인쇄 제목)" value={b.title} onChange={set('title')} placeholder="주 일 낮 예 배" />
          <Text label="권" value={L.vol} onChange={(v) => setL(['vol'], v)} placeholder={auto.vol ? `자동: ${auto.vol}` : '주보 기본 정보에서 제1권 연도를 정하면 자동'} />
          <Text label="주" value={L.week} onChange={(v) => setL(['week'], v)} placeholder={`자동: ${auto.week}`} />
          <div className="field full">
            <label>교회 소식</label>
            <textarea rows={8} value={b.announcements || ''} onChange={(e) => set('announcements')(e.target.value)} placeholder={'1. 첫 번째 소식\n2. 두 번째 소식'} />
            <div className="be-inline">
              <button type="button" className="btn sm" onClick={importNews}>교회 소식 메뉴에서 불러오기</button>
              <small className="muted">상단 고정 글과 예배일 전 7일 동안 올린 글을 번호를 붙여 가져옵니다.</small>
            </div>
          </div>
          <Text
            full
            area
            rows={4}
            label="하나님께 드리는 향기로운 예물 (헌금자 명단)"
            value={b.offering_names}
            onChange={set('offering_names')}
            placeholder={'십일조 : 홍길동 김철수\n감사헌금 : 이영희(박민수) 무명'}
            help="한 줄에 '종류 : 이름들' 형식. 성도 화면(인터넷)에는 공개되지 않고 인쇄 주보에만 나옵니다."
          />
          <Text full area rows={2} label="내부 메모 (주보에 표시 안 됨)" value={b.memo} onChange={set('memo')} />
          <div className="field check-field full">
            <label className="check">
              <input type="checkbox" checked={!!Number(b.is_public)} onChange={(e) => set('is_public')(e.target.checked ? 1 : 0)} /> 성도 화면에 공개 (예배일 6일 전부터 보임)
            </label>
          </div>
        </div>
      )}

      {tab === 1 && (
        <>
          <div className="form-grid">
            <Text label="시간" value={L.main.time} onChange={(v) => setL(['main', 'time'], v)} />
            <Text label="사회" value={L.main.leader} onChange={(v) => setL(['main', 'leader'], v)} />
          </div>
          <p className="muted small be-help">'말씀강론(설교)' 줄의 내용·담당이 설교 제목·설교자로, '성경봉독' 줄의 내용이 본문으로 목록과 성도 화면에 쓰입니다.</p>
          <MainOrder main={L.main} set={(v) => setL(['main'], v)} />
        </>
      )}

      {tab === 2 && (
        <>
          <SubOrder s={L.pm} set={(v) => setL(['pm'], v)} />
          <SubOrder s={L.wed} set={(v) => setL(['wed'], v)} />
        </>
      )}

      {tab === 3 && (
        <div className="form-grid">
          <Text label="월 (예: 9월)" value={L.duty.month} onChange={(v) => setL(['duty', 'month'], v)} />
          <Text label="안내" value={L.duty.guide} onChange={(v) => setL(['duty', 'guide'], v)} />
          <Text label="헌금" value={L.duty.offering} onChange={(v) => setL(['duty', 'offering'], v)} />
          <span />
          <Text label="다음주 기도 (낮)" value={L.duty.prayDay} onChange={(v) => setL(['duty', 'prayDay'], v)} />
          <Text label="다음주 기도 (오후)" value={L.duty.prayPm} onChange={(v) => setL(['duty', 'prayPm'], v)} />
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>취소</button>
        <button className="btn primary" disabled={busy}>저장하고 미리보기</button>
      </div>
    </form>
  );
}

const linesOf = (a) => (a || []).join('\n');
const toLines = (s) => s.split('\n');

/** 주보 기본 정보 (매주 바뀌지 않는 내용) */
export function TemplateEditor({ initial, onSave, onCancel }) {
  const [t, setT] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setT((x) => ({ ...x, [k]: v }));
  const setIn = (k, f) => (v) => setT((x) => ({ ...x, [k]: { ...x[k], [f]: v } }));

  const pickPhoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      set('coverPhoto')(await shrinkImage(f));
    } catch (err) {
      alert(err.message);
    }
  };

  const times = t.serviceTimes || [];
  const setTime = (i, patch) => set('serviceTimes')(times.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(t);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="be">
      <h4 className="be-h">표지</h4>
      <div className="form-grid">
        <Text label="교단" value={t.denomination} onChange={set('denomination')} />
        <Text label="교회 이름 (비우면 설정의 교회 이름)" value={t.churchName} onChange={set('churchName')} />
        <Text label="표어" value={t.motto} onChange={set('motto')} placeholder="표어 : 앞서 나아가는 2022년(수 3:6)" />
        <Text label="제1권이 나온 해" value={t.volBaseYear} onChange={set('volBaseYear')} placeholder="예: 1995" help="권 = 올해 - 이 해 + 1 로 자동 계산" />
        <div className="field full">
          <label>표지 사진</label>
          <div className="be-inline">
            {t.coverPhoto && <img src={t.coverPhoto} alt="표지 사진" className="be-thumb" />}
            <input type="file" accept="image/*" onChange={pickPhoto} />
            {t.coverPhoto && <button type="button" className="btn sm danger" onClick={() => set('coverPhoto')('')}>사진 빼기</button>}
          </div>
          <small className="muted">세로 사진이 잘 맞습니다. 올릴 때 자동으로 크기를 줄입니다.</small>
        </div>
        <Text full area rows={3} label="우리의 비전 (한 줄에 하나)" value={linesOf(t.visions)} onChange={(v) => set('visions')(toLines(v))} />
        <Text full area rows={3} label="사명선언문" value={t.mission} onChange={set('mission')} />
        <Text label="담임목사" value={t.pastor} onChange={set('pastor')} />
        <Text label="그 밖의 섬기는 분 (한 줄)" value={t.staffLine} onChange={set('staffLine')} placeholder="장로 : 홍길동    반주 : 김철수" />
        <Text label="주소" value={t.address} onChange={set('address')} />
        <Text label="전화·팩스" value={t.contact} onChange={set('contact')} />
        <Text label="홈페이지" value={t.homepage} onChange={set('homepage')} />
      </div>

      <h4 className="be-h">교회소식 면</h4>
      <div className="form-grid">
        <Text full area rows={3} label="환영 문구" value={t.welcome} onChange={set('welcome')} />
        <div className="field full">
          <label>예배시간안내</label>
          <table className="be-rows">
            <tbody>
              {times.map((r, i) => (
                <tr key={i}>
                  <td><input value={r.name} placeholder="구분" onChange={(e) => setTime(i, { name: e.target.value })} /></td>
                  <td><input value={r.time} placeholder="시간" onChange={(e) => setTime(i, { time: e.target.value })} /></td>
                  <td><RowTools rows={times} i={i} set={set('serviceTimes')} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div><button type="button" className="btn sm" onClick={() => set('serviceTimes')([...times, { name: '', time: '' }])}>+ 추가</button></div>
        </div>
      </div>

      <h4 className="be-h">안쪽 면</h4>
      <div className="form-grid">
        <Text full label="왼쪽 위 말씀" value={t.verseLeft} onChange={set('verseLeft')} />
        <Text full label="오른쪽 위 말씀" value={t.verseRight} onChange={set('verseRight')} />
        <Text label="상자 1 제목" value={t.dawn?.title} onChange={setIn('dawn', 'title')} />
        <Text label="상자 1 시간" value={t.dawn?.time} onChange={setIn('dawn', 'time')} />
        <Text label="상자 1 사회" value={t.dawn?.leader} onChange={setIn('dawn', 'leader')} />
        <span />
        <Text label="상자 2 제목" value={t.night?.title} onChange={setIn('night', 'title')} />
        <Text label="상자 2 시간" value={t.night?.time} onChange={setIn('night', 'time')} />
        <Text label="상자 2 사회" value={t.night?.leader} onChange={setIn('night', 'leader')} />
        <span />
        <Text full label="합심기도제목 옆 말씀" value={t.prayerVerse} onChange={set('prayerVerse')} />
        <Text full area rows={3} label="합심기도제목 (한 줄에 하나)" value={linesOf(t.prayerItems)} onChange={(v) => set('prayerItems')(toLines(v))} />
        <Text full label="봉사표 위 말씀" value={t.dutyVerse} onChange={set('dutyVerse')} />
        <Text full area rows={2} label="경건한 예배를 위하여 (한 줄에 하나)" value={linesOf(t.worshipNotes)} onChange={(v) => set('worshipNotes')(toLines(v))} />
        <Text full label="오른쪽 아래 상자 제목" value={t.boxTitle} onChange={set('boxTitle')} />
        <Text full area rows={4} label="오른쪽 아래 상자 내용 (한 줄에 하나, 두 칸으로 나눠 표시)" value={linesOf(t.boxItems)} onChange={(v) => set('boxItems')(toLines(v))} />
      </div>

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>취소</button>
        <button className="btn primary" disabled={busy}>저장</button>
      </div>
    </form>
  );
}
