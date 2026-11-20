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
// 교회소식 한 화면에 넣을 양 (넘치면 화면을 복사해 이어서)
const NEWS_PER_SLIDE = 3;
const NEWS_CHARS_PER_SLIDE = 150;

const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
const serialize = (doc) => {
  const s = new XMLSerializer().serializeToString(doc);
  return s.startsWith('<?xml') ? s : XML_HEAD + s;
};
const els = (node, ns, tag) => [...node.getElementsByTagNameNS(ns, tag)];
const paraText = (p) => els(p, A, 't').map((t) => t.textContent).join('');

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

/** 교회소식 문단 하나를 항목 수만큼 문단으로 */
function fillNews(p, items) {
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

/**
 * 서식(buf)에 값(values)을 채운 새 .pptx Blob.
 * values: { '영광송': '62장', '영광송 제목': '고요히 머리숙여', ... , 교회소식: '1. …\n2. …' }
 */
export async function fillTemplate(buf, values) {
  const zip = await loadZip(buf);
  const paths = await slidePaths(zip);
  const newsPages = chunkNews(splitNews(values[NEWS_KEY]));
  const fill = (k) => (Object.prototype.hasOwnProperty.call(values, k) ? String(values[k] ?? '') : '');
  const extra = []; // [원래 슬라이드 경로, 새 슬라이드 경로]
  let nextNo = Math.max(0, ...Object.keys(zip.files).map((f) => Number(f.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1] || 0))) + 1;

  for (const path of paths) {
    const xml = await zip.file(path).async('string');
    const doc = parse(xml);
    const paras = els(doc, A, 'p').filter((p) => paraText(p).includes('{'));
    const newsPara = paras.find((p) => paraText(p).trim() === `{${NEWS_KEY}}`);
    for (const p of paras) {
      if (p === newsPara) continue;
      const text = paraText(p);
      const out = text.replace(PH, (m, k) => fill(k.trim()));
      if (out !== text) setParaText(p, out);
    }
    if (!newsPara) {
      if (paras.length) zip.file(path, serialize(doc));
      continue;
    }
    // 교회소식: 첫 화면은 이 슬라이드, 넘치는 만큼 슬라이드를 복사
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
  if (extra.length) await addSlides(zip, extra);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
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

  for (const [orig, copy] of extra) {
    // 슬라이드 연결 정보 복사 (발표자 노트는 원래 슬라이드 것이라 뺌)
    const name = (p) => p.split('/').pop();
    const srcRels = zip.file(`ppt/slides/_rels/${name(orig)}.rels`);
    if (srcRels) {
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
