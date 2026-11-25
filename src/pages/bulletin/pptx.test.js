// 예배 PPT 만들기 (서식 채우기 · 교회소식 나누기 · 배경 그림 찾기)
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { NEWS_KEY, fillTemplate, findBackground, splitNews, templateKeys } from './pptx';

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const W = 9144000;
const H = 6858000;

/** 글상자 하나 (문단 여러 개). 첫 글자 조각에 글꼴 크기 */
const textBox = (paras, bodyPr = '<a:bodyPr/>') =>
  `<p:sp><p:txBody>${bodyPr}${paras.map((t) => `<a:p><a:r><a:rPr lang="ko-KR" sz="4000"/><a:t>${t}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`;
/** 화면 전체(또는 일부)를 덮는 그림 */
const pic = (rid, full = true) =>
  `<p:pic><p:blipFill><a:blip r:embed="${rid}"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${full ? W : W / 3}" cy="${full ? H : H / 3}"/></a:xfrm></p:spPr></p:pic>`;
const slide = (inner) => `<?xml version="1.0" encoding="UTF-8"?><p:sld ${NS}><p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sld>`;

/** 최소한의 .pptx: slides = [{ xml, rels? }] */
async function makePptx(slides) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${NS}><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`);
  slides.forEach((s, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, s.xml);
    if (s.rels) zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${s.rels}</Relationships>`);
  });
  return zip.generateAsync({ type: 'uint8array' });
}

const imgRel = (rid, target) => `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`;

/** 만든 PPT 를 열어 발표 순서대로 화면의 글자들 */
async function readSlides(blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const pres = await zip.file('ppt/presentation.xml').async('string');
  const rels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  const target = Object.fromEntries([...rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const order = [...pres.matchAll(/<p:sldId [^>]*r:id="(rId\d+)"/g)].map((m) => 'ppt/' + target[m[1]]);
  const out = [];
  for (const p of order) {
    const xml = await zip.file(p).async('string');
    out.push({ path: p, xml, texts: [...xml.matchAll(/<a:t>([^<]*)<\/a:t>|<a:t\/>/g)].map((m) => m[1] ?? '') }); // 빈 글자는 <a:t/>
  }
  return { zip, slides: out };
}

describe('splitNews: 교회 소식 글을 항목으로', () => {
  it('번호로 시작하는 줄이 새 항목, 나머지 줄은 앞 항목에 이어 붙임', () => {
    expect(splitNews('1. 성탄 예배\n   오전 11시\n2. 김장 봉사')).toEqual(['1. 성탄 예배\n오전 11시', '2. 김장 봉사']);
  });
  it('번호가 하나도 없으면 줄마다 항목', () => {
    expect(splitNews('주차 안내\n\n새가족 환영')).toEqual(['주차 안내', '새가족 환영']);
  });
  it('빈 값은 빈 목록', () => {
    expect(splitNews('')).toEqual([]);
    expect(splitNews(null)).toEqual([]);
  });
});

describe('templateKeys: 서식의 자리 표시 이름', () => {
  it('화면 순서대로, 같은 이름은 한 번만', async () => {
    const buf = await makePptx([
      { xml: slide(textBox(['{영광송}', '{영광송 제목}'])) },
      { xml: slide(textBox(['{기도 담당}', '{영광송}'])) },
    ]);
    expect(await templateKeys(buf)).toEqual(['영광송', '영광송 제목', '기도 담당']);
  });
});

describe('fillTemplate: 서식 채우기', () => {
  it('자리 표시를 값으로 바꾸고 글꼴 크기는 서식 그대로, 값이 없으면 빈 칸', async () => {
    const buf = await makePptx([{ xml: slide(textBox(['영광송 {영광송}', '{없는 칸}'])) }]);
    const { slides } = await readSlides(await fillTemplate(buf, { 영광송: '62장' }));
    expect(slides[0].texts).toEqual(['영광송 62장', '']);
    expect(slides[0].xml).toContain('sz="4000"');
    expect(slides[0].xml).not.toContain('{');
  });

  it('교회소식이 길면 화면을 복사해 이어서, 원래 화면 바로 뒤에 끼움', async () => {
    const buf = await makePptx([
      { xml: slide(textBox(['첫 화면'])) },
      { xml: slide(textBox([`{${NEWS_KEY}}`], '<a:bodyPr><a:prstTxWarp prst="textNoShape"/><a:spAutoFit/></a:bodyPr>')) },
      { xml: slide(textBox(['마지막 화면'])) },
    ]);
    const news = ['1. 하나', '2. 둘', '3. 셋', '4. 넷'].join('\n'); // 한 화면에 3개까지
    const { slides } = await readSlides(await fillTemplate(buf, { [NEWS_KEY]: news }));
    expect(slides.map((s) => s.texts)).toEqual([['첫 화면'], ['1. 하나', '2. 둘', '3. 셋'], ['4. 넷'], ['마지막 화면']]);
    // 글이 넘치면 파워포인트가 줄여 맞추도록: normAutofit 이 prstTxWarp 바로 다음, spAutoFit 은 지움
    expect(slides[1].xml).toMatch(/<a:prstTxWarp[^>]*\/><a:normAutofit\/>/);
    expect(slides[1].xml).not.toContain('spAutoFit');
  });

  it('교회소식이 비어 있으면 화면은 그대로 두고 글만 지움', async () => {
    const buf = await makePptx([{ xml: slide(textBox([`{${NEWS_KEY}}`])) }]);
    const { slides } = await readSlides(await fillTemplate(buf, { [NEWS_KEY]: '' }));
    expect(slides).toHaveLength(1);
    expect(slides[0].texts).toEqual(['']);
  });
});

describe('findBackground: 서식의 배경 그림 찾기', () => {
  const paths = (n) => Array.from({ length: n }, (_, i) => `ppt/slides/slide${i + 1}.xml`);

  it('화면 전체를 덮는 그림 중 가장 많은 화면에 쓰인 것', async () => {
    const buf = await makePptx([
      { xml: slide(pic('rId2')), rels: imgRel('rId2', '../media/bg.jpeg') },
      { xml: slide(pic('rId2')), rels: imgRel('rId2', '../media/bg.jpeg') },
      { xml: slide(pic('rId3')), rels: imgRel('rId3', '../media/other.jpeg') },
    ]);
    const found = await findBackground(await JSZip.loadAsync(buf), paths(3));
    expect(found).toEqual({ target: '../media/bg.jpeg', W, H });
  });

  it('한 화면에만 있거나 작은 그림이면 배경이 아님', async () => {
    const one = await makePptx([
      { xml: slide(pic('rId2')), rels: imgRel('rId2', '../media/bg.jpeg') },
      { xml: slide(textBox(['글'])) },
    ]);
    expect(await findBackground(await JSZip.loadAsync(one), paths(2))).toBeNull();

    const small = await makePptx([
      { xml: slide(pic('rId2', false)), rels: imgRel('rId2', '../media/logo.png') },
      { xml: slide(pic('rId2', false)), rels: imgRel('rId2', '../media/logo.png') },
    ]);
    expect(await findBackground(await JSZip.loadAsync(small), paths(2))).toBeNull();
  });
});
