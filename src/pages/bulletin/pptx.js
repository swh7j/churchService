// 예배 PPT: 서식 .pptx 의 자리 표시({영광송}, {기도 담당}, {교회소식} …)를 주보 내용으로 채움
// .pptx 는 zip 안의 XML 이라 브라우저에서 바로 고칠 수 있음 (서버 부담 없음)

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const SLIDE_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const SLIDE_CT = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export const NEWS_KEY = '교회소식';
const PH = /\{([^{}\n]{1,40})\}/g;
// 왼쪽 정렬로 바꿀 긴 글 자리 표시
const LEFT_KEYS = ['사명선언문'];
// 교회소식 한 화면에 넣을 양 (넘치면 화면을 복사해 이어서)
const NEWS_PER_SLIDE = 3;
// 4:3 화면에 20pt 글자 기준, 150자면 아래로 넘치거나 옆 그림과 겹쳐서 100자로 줄임
const NEWS_CHARS_PER_SLIDE = 100;

const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
const serialize = (doc) => {
  const s = new XMLSerializer().serializeToString(doc);
  return s.startsWith('<?xml') ? s : XML_HEAD + s;
};
const els = (node, ns, tag) => [...node.getElementsByTagNameNS(ns, tag)];
const paraText = (p) => els(p, A, 't').map((t) => t.textContent).join('');
/** 문단 안 줄들 (줄 나눔 a:br 기준) */
function paraLines(p) {
  const out = [''];
  for (const n of p.childNodes) {
    if (n.localName === 'br') out.push('');
    else if (n.localName === 'r' || n.localName === 'fld') out[out.length - 1] += els(n, A, 't').map((t) => t.textContent).join('');
  }
  return out;
}

async function loadZip(buf) {
  const { default: JSZip } = await import('jszip');
  return JSZip.loadAsync(buf);
}

/** 발표 순서대로 슬라이드 파일 경로 */
async function slidePaths(zip) {
  const pres = parse(await zip.file('ppt/presentation.xml').async('string'));
  const rels = parse(await zip.file('ppt/_rels/presentation.xml.rels').async('string'));
  const target = Object.fromEntries(els(rels, PKG, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
  return els(pres, P, 'sldId').map((s) => 'ppt/' + target[s.getAttributeNS(R, 'id')].replace(/^\/?ppt\//, ''));
}

/** 서식에 들어 있는 자리 표시 이름들 (나온 순서대로, 중복 없이) */
export async function templateKeys(buf) {
  const zip = await loadZip(buf);
  const keys = [];
  for (const path of await slidePaths(zip)) {
    const doc = parse(await zip.file(path).async('string'));
    for (const p of els(doc, A, 'p')) for (const m of paraText(p).matchAll(PH)) if (!keys.includes(m[1].trim())) keys.push(m[1].trim());
  }
  return keys;
}

/** 교회 소식 글 → 항목 목록. "1." 같은 번호로 시작하는 줄이 새 항목, 나머지 줄은 앞 항목에 이어 붙임 */
export function splitNews(text) {
  const items = [];
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const numbered = lines.some((l) => /^\d+[.)]\s*/.test(l));
  for (const l of lines) {
    if (!numbered || /^\d+[.)]\s*/.test(l) || !items.length) items.push(l);
    else items[items.length - 1] += '\n' + l;
  }
  return items;
}

function chunkNews(items) {
  const pages = [];
  let cur = [];
  let len = 0;
  for (const it of items) {
    if (cur.length && (cur.length >= NEWS_PER_SLIDE || len + it.length > NEWS_CHARS_PER_SLIDE)) {
      pages.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(it);
    len += it.length;
  }
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}

/** 문단 안 글자를 text 로 바꿈. 첫 글자 조각의 글꼴을 그대로 쓰고, 줄바꿈(\n)은 줄 나눔으로 */
function setParaText(p, text) {
  const runs = els(p, A, 'r');
  const doc = p.ownerDocument;
  const rPr = runs[0]?.getElementsByTagNameNS(A, 'rPr')[0] || els(p, A, 'endParaRPr')[0];
  // 기존 글자 조각·줄 나눔·필드 제거
  [...p.childNodes].filter((n) => n.namespaceURI === A && ['r', 'br', 'fld'].includes(n.localName)).forEach((n) => n.remove());
  const end = els(p, A, 'endParaRPr')[0] || null;
  // 서식(문단 또는 글상자 기본값)에 '한글 단어 잘림 허용'(latinLnBrk)이 켜져 있으면 긴 글이 단어 중간에서 끊김
  // → 문단에 꺼 두어 단어 단위로 줄바꿈 (문단 설정이 글상자 기본값보다 우선)
  pPrOf(p).setAttribute('latinLnBrk', '0');
  String(text)
    .split('\n')
    .forEach((line, i) => {
      if (i) {
        const br = doc.createElementNS(A, 'a:br');
        if (rPr) br.appendChild(cloneAs(rPr, 'rPr'));
        p.insertBefore(br, end);
      }
      const r = doc.createElementNS(A, 'a:r');
      if (rPr) r.appendChild(cloneAs(rPr, 'rPr'));
      const t = doc.createElementNS(A, 'a:t');
      t.textContent = line;
      r.appendChild(t);
      p.insertBefore(r, end);
    });
}

/** 문단 설정(a:pPr). 없으면 맨 앞에 만듦 */
function pPrOf(p) {
  let pPr = [...p.children].find((c) => c.localName === 'pPr');
  if (!pPr) {
    pPr = p.ownerDocument.createElementNS(A, 'a:pPr');
    p.insertBefore(pPr, p.firstChild);
  }
  return pPr;
}

// endParaRPr 를 글꼴로 쓸 때는 이름만 rPr 로 바꿔 복사
function cloneAs(el, name) {
  if (el.localName === name) return el.cloneNode(true);
  const n = el.ownerDocument.createElementNS(A, 'a:' + name);
  for (const a of el.attributes) n.setAttribute(a.name, a.value);
  for (const c of el.childNodes) n.appendChild(c.cloneNode(true));
  return n;
}

/** 자동 번호 끄기 (항목 글에 이미 "1." 이 붙어 있음) */
function noAutoNumber(p) {
  const pPr = els(p, A, 'pPr')[0];
  if (!pPr) return;
  const auto = [...pPr.children].find((c) => ['buAutoNum', 'buChar', 'buBlip'].includes(c.localName));
  if (!auto) return;
  pPr.replaceChild(p.ownerDocument.createElementNS(A, 'a:buNone'), auto);
}

/** 글이 글상자보다 길면 파워포인트가 글자를 줄여 맞추도록 (자동 맞춤) */
function shrinkToFit(p) {
  let n = p.parentNode;
  while (n && n.localName !== 'txBody') n = n.parentNode;
  const body = n && [...n.children].find((c) => c.localName === 'bodyPr');
  if (!body) return;
  [...body.children].filter((c) => ['spAutoFit', 'noAutofit', 'normAutofit'].includes(c.localName)).forEach((c) => c.remove());
  // 순서 규칙: prstTxWarp 다음 자리
  const warp = [...body.children].find((c) => c.localName === 'prstTxWarp');
  body.insertBefore(p.ownerDocument.createElementNS(A, 'a:normAutofit'), warp ? warp.nextSibling : body.firstChild);
}

/** 교회소식 문단 하나를 항목 수만큼 문단으로 */
function fillNews(p, items) {
  shrinkToFit(p);
  if (!items.length) return setParaText(p, '');
  const tpl = p.cloneNode(true);
  let prev = p;
  items.forEach((it, i) => {
    const np = i === 0 ? p : tpl.cloneNode(true);
    noAutoNumber(np);
    setParaText(np, it);
    if (i) prev.parentNode.insertBefore(np, prev.nextSibling);
    prev = np;
  });
}

const EMU_PT = 12700;
const num = (el, attr, def) => (el && el.hasAttribute(attr) ? Number(el.getAttribute(attr)) : def);

/** 글 한 줄의 대략적인 폭(pt). 한글·한자는 글자 크기만큼, 빈칸은 0.3, 나머지는 0.6 */
function textWidth(text, pt) {
  let w = 0;
  for (const ch of text) w += pt * (/[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? 1 : ch === ' ' ? 0.3 : 0.6);
  return w;
}

/**
 * '글에 맞춰 크기 조정'(spAutoFit) 글상자 중 색이 칠해진 것은 저장된 높이가 글보다 작으면 늘림.
 * 서식에서 글을 고친 뒤 높이가 한 줄짜리로 남아 있으면 흰 바탕이 첫 줄만 덮고 나머지 글이 밖으로 나옴
 * (PDF·휴대폰에서는 저장된 높이 그대로 그림). 줄 수는 글자 폭으로 어림함. 늘렸으면 true
 */
export function growAutoFitBoxes(doc) {
  let grew = false;
  for (const sp of els(doc, P, 'sp')) {
    const box = autoFitBox(sp);
    if (!box || !box.filled) continue;
    const cy = textHeight(sp, box);
    if (cy > num(box.ext, 'cy', 0) * 1.05) {
      box.ext.setAttribute('cy', String(cy));
      grew = true;
    }
  }
  return grew;
}

/** '글에 맞춰 크기 조정' 글상자의 bodyPr·크기·칠 여부 (아니면 null) */
function autoFitBox(sp) {
  const body = els(sp, A, 'bodyPr')[0];
  const spPr = els(sp, P, 'spPr')[0];
  const ext = spPr && els(spPr, A, 'ext').find((e) => e.hasAttribute('cy'));
  if (!body || !ext || !els(body, A, 'spAutoFit').length) return null;
  const filled = [...spPr.children].some((c) => c.localName === 'solidFill' || c.localName === 'gradFill' || c.localName === 'blipFill');
  return { body, ext, filled };
}

/** 글상자 안 글의 대략적인 높이(EMU, 위아래 안쪽 여백과 10% 여유 포함). 줄 수는 글자 폭으로 어림함 */
function textHeight(sp, { body, ext }) {
  const innerW = (num(ext, 'cx', 0) - num(body, 'lIns', 91440) - num(body, 'rIns', 91440)) / EMU_PT;
  if (innerW <= 0) return 0;
  let h = 0;
  for (const p of els(sp, A, 'p')) {
    const r = els(p, A, 'rPr')[0] || els(p, A, 'endParaRPr')[0];
    const pt = num(r, 'sz', 1800) / 100;
    const pPr = [...p.children].find((c) => c.localName === 'pPr');
    const pts = pPr && els(pPr, A, 'lnSpc')[0];
    const lineH = pts && els(pts, A, 'spcPts')[0] ? num(els(pts, A, 'spcPts')[0], 'val', 0) / 100
      : pts && els(pts, A, 'spcPct')[0] ? pt * 1.2 * num(els(pts, A, 'spcPct')[0], 'val', 100000) / 100000
        : pt * 1.2;
    const gap = (tag) => { const s = pPr && els(pPr, A, tag)[0]; const v = s && els(s, A, 'spcPts')[0]; return v ? num(v, 'val', 0) / 100 : 0; };
    // 직접 바꾼 줄마다 따로, 폭을 넘으면 그 줄이 여러 줄로
    const lines = paraLines(p).reduce((n, line) => n + Math.max(1, Math.ceil(textWidth(line, pt) / innerW)), 0);
    h += lines * lineH + gap('spcBef') + gap('spcAft');
  }
  // 그리는 프로그램마다 첫 줄 위치가 조금씩 달라서 10% 여유
  return Math.round(h * 1.1 * EMU_PT + num(body, 'tIns', 45720) + num(body, 'bIns', 45720));
}

/**
 * 화면 가운데의 큰 글상자(흰 띠)에 짧은 글만 있으면 (찬송가 3장, 말씀강론 11, 표어 …) 글을 상자 세로 가운데로.
 * 서식은 글이 상자 맨 위에 붙어 있음. 글이 상자 높이의 70% 를 넘는 긴 글(사명선언문 등)은 그대로 둠.
 * 위아래의 빈 문단은 가운데가 어긋나므로 뺌. 바꿨으면 true
 */
export function centerShortText(doc, W, H) {
  let changed = false;
  for (const sp of els(doc, P, 'sp')) {
    const box = autoFitBox(sp);
    if (!box || num(box.ext, 'cx', 0) < W * 0.8 || num(box.ext, 'cy', 0) < H * 0.3) continue;
    const paras = els(sp, A, 'p');
    const blank = (p) => !paraText(p).trim();
    if (paras.every(blank)) continue;
    while (paras.length > 1 && blank(paras[0])) paras.shift().remove();
    while (paras.length > 1 && blank(paras[paras.length - 1])) paras.pop().remove();
    if (textHeight(sp, box) > num(box.ext, 'cy', 0) * 0.7) continue;
    box.body.setAttribute('anchor', 'ctr');
    // 크기를 글에 맞추면 띠가 줄어드므로 지금 크기로 고정
    const fit = els(box.body, A, 'spAutoFit')[0];
    fit.parentNode.replaceChild(doc.createElementNS(A, 'a:noAutofit'), fit);
    changed = true;
  }
  return changed;
}

/** 문단 p 가 든 글상자를 화면 폭 W 에서 왼쪽 여백과 같은 오른쪽 여백만 남기고 넓힘 */
function widenBox(p, W) {
  let sp = p.parentNode;
  while (sp && !(sp.namespaceURI === P && sp.localName === 'sp')) sp = sp.parentNode;
  const xfrm = sp && els(sp, A, 'xfrm')[0];
  const off = xfrm && els(xfrm, A, 'off')[0];
  const ext = xfrm && els(xfrm, A, 'ext')[0];
  if (!off || !ext) return;
  const x = Math.max(0, Number(off.getAttribute('x')) || 0);
  const cx = W - 2 * x;
  if (x < W / 4 && cx > Number(ext.getAttribute('cx'))) ext.setAttribute('cx', String(cx));
}

/**
 * 서식(buf)에 값(values)을 채운 새 .pptx Blob.
 * values: { '영광송': '62장', '영광송 제목': '고요히 머리숙여', ... , 교회소식: '1. …\n2. …' }
 * inserts: { '영광송': [{ data: Uint8Array, ext: 'png' }, …] } → {영광송} 이 있는 화면 바로 뒤에 그림 화면으로 넣음
 * background: { data: Uint8Array } → 서식의 배경 그림을 이 그림으로 바꿈 (없으면 서식 그대로)
 */
export async function fillTemplate(buf, values, inserts = {}, background = null) {
  const zip = await loadZip(buf);
  const paths = await slidePaths(zip);
  if (background) await replaceBackground(zip, paths, background);
  const newsPages = chunkNews(splitNews(values[NEWS_KEY]));
  const fill = (k) => (Object.prototype.hasOwnProperty.call(values, k) ? String(values[k] ?? '') : '');
  const extra = []; // [원래 슬라이드 경로, 새 슬라이드 경로]
  const done = new Set();
  const pics = []; // [슬라이드 경로, 그림들]
  const presXml = await zip.file('ppt/presentation.xml').async('string');
  const slideW = Number(presXml.match(/<p:sldSz[^>]*\bcx="(\d+)"/)?.[1] || 9144000);
  const slideH = Number(presXml.match(/<p:sldSz[^>]*\bcy="(\d+)"/)?.[1] || 6858000);
  let nextNo = Math.max(0, ...Object.keys(zip.files).map((f) => Number(f.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1] || 0))) + 1;

  for (const path of paths) {
    const xml = await zip.file(path).async('string');
    const doc = parse(xml);
    const paras = els(doc, A, 'p').filter((p) => paraText(p).includes('{'));
    // 이 화면 뒤에 넣을 악보·교독문 (같은 자리 표시가 여러 화면에 있으면 처음 화면에만)
    for (const p of paras)
      for (const m of paraText(p).matchAll(PH)) {
        const k = m[1].trim();
        if (inserts[k]?.length && !done.has(k)) {
          done.add(k);
          pics.push([path, inserts[k]]);
        }
      }
    const newsPara = paras.find((p) => paraText(p).trim() === `{${NEWS_KEY}}`);
    for (const p of paras) {
      if (p === newsPara) continue;
      const text = paraText(p);
      const out = text.replace(PH, (m, k) => fill(k.trim()));
      if (out !== text) setParaText(p, out);
      // 사명선언문은 여러 줄 긴 글이라 가운데 정렬이면 읽기 어려움 → 왼쪽 정렬
      if (LEFT_KEYS.some((k) => text.includes(`{${k}}`))) pPrOf(p).setAttribute('algn', 'l');
    }
    const grew = growAutoFitBoxes(doc);
    const centered = centerShortText(doc, slideW, slideH);
    if (!newsPara) {
      if (paras.length || grew || centered) zip.file(path, serialize(doc));
      continue;
    }
    // 교회소식: 첫 화면은 이 슬라이드, 넘치는 만큼 슬라이드를 복사
    // 배경 그림을 바꿨으면 서식 배경의 그림을 피하려고 좁혀 둔 교회소식 상자를 좌우 여백이 같게 넓힘
    if (background) widenBox(newsPara, slideW);
    const base = serialize(doc);
    newsPages.forEach((items, i) => {
      const d = parse(base);
      const np = els(d, A, 'p').find((p) => paraText(p).trim() === `{${NEWS_KEY}}`);
      fillNews(np, items);
      if (i === 0) zip.file(path, serialize(d));
      else {
        const np2 = `ppt/slides/slide${nextNo++}.xml`;
        zip.file(np2, serialize(d));
        extra.push([path, np2]);
      }
    });
  }
  for (const [path, images] of pics) {
    for (const img of images) {
      const np2 = `ppt/slides/slide${nextNo++}.xml`;
      extra.push([path, np2, await picSlide(zip, path, np2, img)]);
    }
  }
  if (extra.length) {
    await addSlides(zip, extra);
    await renumberSlides(zip);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

/**
 * 서식의 배경 그림 = 화면 전체를 덮는 그림 중 가장 많은 화면에 쓰인 것 (2화면 이상).
 * 그 그림을 가리키는 화면들의 연결을 새 그림으로 바꿈. 새 그림은 화면 비율에 맞게 가운데를 잘라 씀
 */
export async function findBackground(zip, paths) {
  const pres = await zip.file('ppt/presentation.xml').async('string');
  const W = Number(pres.match(/<p:sldSz[^>]*\bcx="(\d+)"/)?.[1] || 9144000);
  const H = Number(pres.match(/<p:sldSz[^>]*\bcy="(\d+)"/)?.[1] || 6858000);
  const count = {};
  for (const path of paths) {
    const relsFile = zip.file(relsOf(path));
    if (!relsFile) continue;
    const target = Object.fromEntries(els(parse(await relsFile.async('string')), PKG, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
    const doc = parse(await zip.file(path).async('string'));
    const seen = new Set();
    for (const pic of els(doc, P, 'pic')) {
      const off = els(pic, A, 'off')[0];
      const ext = els(pic, A, 'ext').find((e) => e.hasAttribute('cx'));
      const blip = els(pic, A, 'blip')[0];
      if (!off || !ext || !blip) continue;
      const full = Math.abs(Number(off.getAttribute('x'))) < W * 0.03 && Math.abs(Number(off.getAttribute('y'))) < H * 0.03 && Number(ext.getAttribute('cx')) > W * 0.95 && Number(ext.getAttribute('cy')) > H * 0.95;
      const t = target[blip.getAttributeNS(R, 'embed')];
      if (full && t && !seen.has(t)) {
        seen.add(t);
        count[t] = (count[t] || 0) + 1;
      }
    }
  }
  const [best, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0] || [];
  return n >= 2 ? { target: best, W, H } : null;
}

async function replaceBackground(zip, paths, background) {
  const found = await findBackground(zip, paths);
  if (!found) return;
  const data = await cropTo(background.data, found.W / found.H);
  zip.file('ppt/media/worship-bg.jpeg', data);
  await ensureDefault(zip, 'jpeg', 'image/jpeg');
  const from = `Target="${found.target}"`;
  for (const path of paths) {
    const f = zip.file(relsOf(path));
    if (!f) continue;
    const xml = await f.async('string');
    if (xml.includes(from)) zip.file(relsOf(path), xml.split(from).join('Target="../media/worship-bg.jpeg"'));
  }
}

/** 그림을 ratio(가로/세로) 비율로 가운데를 잘라 JPEG 로 (긴 변 최대 1920) */
async function cropTo(data, ratio) {
  const bmp = await createImageBitmap(new Blob([data]));
  let sw = bmp.width;
  let sh = bmp.height;
  if (sw / sh > ratio) sw = Math.round(sh * ratio);
  else sh = Math.round(sw / ratio);
  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k);
  c.height = Math.round(sh * k);
  c.getContext('2d').drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  return new Uint8Array(await blob.arrayBuffer());
}

/** 복사한 슬라이드를 발표 순서(원래 슬라이드 바로 뒤)에 등록 */
async function addSlides(zip, extra) {
  const ctPath = '[Content_Types].xml';
  const ct = parse(await zip.file(ctPath).async('string'));
  const relsPath = 'ppt/_rels/presentation.xml.rels';
  const rels = parse(await zip.file(relsPath).async('string'));
  const pres = parse(await zip.file('ppt/presentation.xml').async('string'));
  const relList = els(rels, PKG, 'Relationship');
  let rid = Math.max(...relList.map((r) => Number(r.getAttribute('Id').replace(/\D/g, '')) || 0)) + 1;
  const ids = els(pres, P, 'sldId');
  let sid = Math.max(255, ...ids.map((s) => Number(s.getAttribute('id')))) + 1;
  const ridOf = (path) => relList.find((r) => 'ppt/' + r.getAttribute('Target').replace(/^\/?ppt\//, '') === path)?.getAttribute('Id');
  const after = {}; // 원래 슬라이드 → 마지막으로 넣은 sldId 요소

  for (const [orig, copy, ownRels] of extra) {
    // 슬라이드 연결 정보 복사 (발표자 노트는 원래 슬라이드 것이라 뺌). 그림 화면은 따로 만든 연결 정보
    const name = (p) => p.split('/').pop();
    const srcRels = zip.file(`ppt/slides/_rels/${name(orig)}.rels`);
    if (ownRels) zip.file(`ppt/slides/_rels/${name(copy)}.rels`, ownRels);
    else if (srcRels) {
      const r = parse(await srcRels.async('string'));
      els(r, PKG, 'Relationship').filter((x) => /notesSlide$/.test(x.getAttribute('Type'))).forEach((x) => x.remove());
      zip.file(`ppt/slides/_rels/${name(copy)}.rels`, serialize(r));
    }
    const o = ct.createElementNS(ct.documentElement.namespaceURI, 'Override');
    o.setAttribute('PartName', '/' + copy);
    o.setAttribute('ContentType', SLIDE_CT);
    ct.documentElement.appendChild(o);

    const id = 'rId' + rid++;
    const rel = rels.createElementNS(PKG, 'Relationship');
    rel.setAttribute('Id', id);
    rel.setAttribute('Type', SLIDE_TYPE);
    rel.setAttribute('Target', 'slides/' + name(copy));
    rels.documentElement.appendChild(rel);

    const prev = after[orig] || ids.find((s) => s.getAttributeNS(R, 'id') === ridOf(orig));
    const s = pres.createElementNS(P, 'p:sldId');
    s.setAttribute('id', String(sid++));
    s.setAttributeNS(R, 'r:id', id);
    prev.parentNode.insertBefore(s, prev.nextSibling);
    after[orig] = s;
  }
  zip.file(ctPath, serialize(ct));
  zip.file(relsPath, serialize(rels));
  zip.file('ppt/presentation.xml', serialize(pres));
}

/**
 * 슬라이드 파일 이름을 발표 순서대로 slide1, slide2 … 로 다시 붙임.
 * 끼워 넣은 화면은 파일 이름이 맨 뒤 번호라서, 발표 순서 대신 파일 이름 순서로 읽는 뷰어(휴대폰 미리보기 등)에서
 * 화면이 섞이거나 반복돼 보일 수 있음. 파워포인트가 저장하는 모양과 같게 맞춤
 */
export async function renumberSlides(zip) {
  const order = await slidePaths(zip);
  const map = {};
  order.forEach((p, i) => {
    const to = `ppt/slides/slide${i + 1}.xml`;
    if (p !== to) map[p] = to;
  });
  if (!Object.keys(map).length) return;
  const base = (p) => p.split('/').pop();

  // 파일 옮기기: 먼저 다 읽어 두고 지운 뒤 새 이름으로 씀 (이름이 서로 겹치므로)
  const moved = [];
  for (const [from, to] of Object.entries(map)) {
    moved.push([to, await zip.file(from).async('uint8array')]);
    const rels = zip.file(relsOf(from));
    if (rels) moved.push([relsOf(to), await rels.async('uint8array')]);
  }
  for (const from of Object.keys(map)) {
    zip.remove(from);
    zip.remove(relsOf(from));
  }
  for (const [path, data] of moved) zip.file(path, data);

  // 다른 파일 안의 연결 고치기 (발표 목록, 노트, 화면 간 링크, 내용 형식 목록)
  const byName = Object.fromEntries(Object.entries(map).map(([f, t]) => [base(f), base(t)]));
  const fix = (s) => s.replace(/((?:Target|PartName)="(?:[^"]*\/)?)(slide\d+\.xml)"/g, (m, pre, n) => (byName[n] ? `${pre}${byName[n]}"` : m));
  const texts = Object.keys(zip.files).filter((f) => f.endsWith('.rels') || f === '[Content_Types].xml');
  for (const f of texts) {
    const s = await zip.file(f).async('string');
    const out = fix(s);
    if (out !== s) zip.file(f, out);
  }
}

// ── 그림 화면 (찬송 악보, 교독문) ──

const IMAGE_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const LAYOUT_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';
const relsOf = (path) => path.replace(/([^/]+)$/, '_rels/$1.rels');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

async function imageSize(data) {
  const bmp = await createImageBitmap(new Blob([data]));
  const r = { w: bmp.width, h: bmp.height };
  bmp.close?.();
  return r;
}

/** 그림 한 장을 화면 가운데에 꽉 차게 넣은 슬라이드를 path 에 만들고, 그 연결 정보 XML 을 돌려줌 */
async function picSlide(zip, after, path, img) {
  const pres = await zip.file('ppt/presentation.xml').async('string');
  const W = Number(pres.match(/<p:sldSz[^>]*\bcx="(\d+)"/)?.[1] || 9144000);
  const H = Number(pres.match(/<p:sldSz[^>]*\bcy="(\d+)"/)?.[1] || 6858000);
  const { w, h } = await imageSize(img.data);
  // 비율이 거의 같으면 꽉 채우고, 아니면 비율을 지켜 가운데 맞춤
  const fit = Math.abs(w / h - W / H) < 0.03;
  const scale = Math.min(W / w, H / h);
  const cx = fit ? W : Math.round(w * scale);
  const cy = fit ? H : Math.round(h * scale);
  const ext = img.ext === 'png' ? 'png' : 'jpeg';
  const media = `ppt/media/insert${path.match(/(\d+)\.xml$/)[1]}.${ext}`;
  zip.file(media, img.data);
  await ensureDefault(zip, ext, ext === 'png' ? 'image/png' : 'image/jpeg');

  // 앞 화면과 같은 레이아웃을 씀
  const srcRels = zip.file(relsOf(after));
  const layout = srcRels
    ? els(parse(await srcRels.async('string')), PKG, 'Relationship')
        .find((r) => r.getAttribute('Type') === LAYOUT_TYPE)
        ?.getAttribute('Target')
    : null;
  zip.file(
    path,
    XML_HEAD +
      `<p:sld xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>` +
      `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
      `<p:pic><p:nvPicPr><p:cNvPr id="2" name="${esc(img.name || '그림')}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
      `<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
      `<p:spPr><a:xfrm><a:off x="${Math.round((W - cx) / 2)}" y="${Math.round((H - cy) / 2)}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>` +
      `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
  );
  return (
    XML_HEAD +
    `<Relationships xmlns="${PKG}">` +
    (layout ? `<Relationship Id="rId1" Type="${LAYOUT_TYPE}" Target="${esc(layout)}"/>` : '') +
    `<Relationship Id="rId2" Type="${IMAGE_TYPE}" Target="../media/${media.split('/').pop()}"/></Relationships>`
  );
}

async function ensureDefault(zip, ext, type) {
  const path = '[Content_Types].xml';
  const ct = parse(await zip.file(path).async('string'));
  const ns = ct.documentElement.namespaceURI;
  if ([...ct.getElementsByTagNameNS(ns, 'Default')].some((d) => d.getAttribute('Extension').toLowerCase() === ext)) return;
  const d = ct.createElementNS(ns, 'Default');
  d.setAttribute('Extension', ext);
  d.setAttribute('ContentType', type);
  ct.documentElement.insertBefore(d, ct.documentElement.firstChild);
  zip.file(path, serialize(ct));
}

/** 그림 → jpg/png (다른 형식은 png 로 바꿈, 브라우저가 못 읽는 그림은 null) */
async function toWebImage(data, ext) {
  ext = ext.toLowerCase().replace('jpeg', 'jpg');
  if (ext === 'jpg' || ext === 'png') return { data, ext };
  let bmp;
  try {
    bmp = await createImageBitmap(new Blob([data]));
  } catch {
    return null;
  }
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return { data: new Uint8Array(await blob.arrayBuffer()), ext: 'png' };
}

/**
 * 올린 파일들 → 화면 그림 목록.
 * 그림 파일은 한 장이 한 화면, .pptx 는 화면마다 가장 큰 그림을 꺼냄 (그림으로 된 악보 PPT).
 * 돌려줌: { images: [{data, ext}], skipped: 그림이 없어 뺀 화면 수,
 *   textSlides: 글자(가사 등)가 있는 화면 수, layered: 그림이 여러 개 겹친 화면 수 } — 둘 다 가장 큰 그림만 쓰므로 빠진 내용이 있을 수 있음
 */
export async function imagesFromFiles(files) {
  const images = [];
  let skipped = 0;
  let textSlides = 0;
  let layered = 0;
  for (const f of files) {
    const ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    if (ext === 'ppt') throw new Error('옛날 형식(.ppt)은 읽을 수 없습니다. 파워포인트에서 .pptx 로 저장하거나, 다른 이름으로 저장 → JPEG 로 그림을 만들어 올려 주세요.');
    const data = new Uint8Array(await f.arrayBuffer());
    if (ext !== 'pptx') {
      const img = await toWebImage(data, ext);
      if (!img) throw new Error(`${f.name}: 읽을 수 없는 그림입니다. jpg 나 png 로 올려 주세요.`);
      images.push(img);
      continue;
    }
    const zip = await loadZip(data);
    for (const path of await slidePaths(zip)) {
      const doc = parse(await zip.file(path).async('string'));
      // 쪽 번호("1/8") 같은 숫자만 있는 글자는 빼고 셈
      if (els(doc, A, 't').map((t) => t.textContent).join('').replace(/[\s0-9/().:-]/g, '').length >= 2) textSlides++;
      if (els(doc, A, 'blip').length > 1) layered++;
      const rf = zip.file(relsOf(path));
      const rels = rf ? Object.fromEntries(els(parse(await rf.async('string')), PKG, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')])) : {};
      let best = null;
      for (const b of els(doc, A, 'blip')) {
        const t = rels[b.getAttributeNS(R, 'embed')];
        const mf = t && zip.file('ppt/' + t.replace(/^(\.\.\/)+/, '').replace(/^\/?ppt\//, ''));
        if (!mf) continue;
        const d = await mf.async('uint8array');
        if (!best || d.length > best.data.length) best = { data: d, ext: t.split('.').pop() };
      }
      const img = best && (await toWebImage(best.data, best.ext));
      if (img) images.push(img);
      else skipped++;
    }
  }
  return { images, skipped, textSlides, layered };
}

/** 예배 화면(풀HD)에 충분한 크기: 긴 쪽 1920px */
export const MAX_SIDE = 1920;
const MAX_JPG_BYTES = 1_500_000;

/**
 * 큰 그림 줄이기 (휴대폰 사진 4000px·3~5MB 등). 이미 작으면 그대로 둠 (다시 저장하면 화질만 떨어지므로).
 * jpg 는 jpg(품질 86%)로, png 는 투명한 부분을 지키려고 png 로 다시 저장. 돌려줌: { data, ext, shrunk }
 */
export async function fitImage(img, maxSide = MAX_SIDE) {
  let bmp;
  try {
    bmp = await createImageBitmap(new Blob([img.data]));
  } catch {
    return img;
  }
  const long = Math.max(bmp.width, bmp.height);
  const tooBig = long > maxSide || (img.ext === 'jpg' && img.data.length > MAX_JPG_BYTES);
  if (!tooBig) {
    bmp.close?.();
    return img;
  }
  const scale = Math.min(1, maxSide / long);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if (img.ext === 'jpg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = await new Promise((r) => (img.ext === 'png' ? c.toBlob(r, 'image/png') : c.toBlob(r, 'image/jpeg', 0.86)));
  const data = new Uint8Array(await blob.arrayBuffer());
  // 줄였는데 오히려 커지면(드묾) 원래 것을 씀
  return data.length < img.data.length ? { data, ext: img.ext, shrunk: true } : img;
}

/** 그림 목록 → 서버에 저장하는 zip (001.jpg, 002.png …) */
export async function packImages(images) {
  const { default: JSZip } = await import('jszip');
  const z = new JSZip();
  images.forEach((img, i) => z.file(`${String(i + 1).padStart(3, '0')}.${img.ext}`, img.data));
  return z.generateAsync({ type: 'blob', compression: 'STORE' });
}

/** 서버에 저장한 zip → 그림 목록 */
export async function unpackImages(buf) {
  const zip = await loadZip(buf);
  const names = Object.keys(zip.files).filter((n) => /^\d{3}\.(jpg|jpeg|png)$/.test(n)).sort();
  return Promise.all(names.map(async (n) => ({ data: await zip.file(n).async('uint8array'), ext: n.endsWith('png') ? 'png' : 'jpg' })));
}
