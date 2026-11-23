// 앨범 사진 줄이기: 올리기 전에 브라우저에서 줄여서 서버 용량·데이터 사용량을 아낌
//  - 큰 사진: 긴 쪽 1600px (휴대폰·PC 화면으로 보기 충분, 한 장 0.2~0.4MB)
//  - 작은 사진(목록용): 긴 쪽 480px (한 장 0.02~0.04MB)
import { withChurch } from '../../church';

const BIG = 1600;
const SMALL = 480;

/** 휴대폰 사진의 회전 정보(EXIF)를 반영해서 읽기 */
async function decode(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* 아래 방법으로 다시 시도 */
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`'${file.name}' 사진을 읽지 못했습니다. (아이폰 HEIC 사진이면 JPG로 바꿔 올려 주세요)`));
    img.src = URL.createObjectURL(file);
  });
}

function draw(src, max, quality) {
  const w0 = src.width;
  const h0 = src.height;
  const k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k));
  c.height = Math.max(1, Math.round(h0 * k));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; // 투명한 PNG 도 흰 배경으로
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return { url: c.toDataURL('image/jpeg', quality), width: c.width, height: c.height };
}

/** 파일 → { image, thumb, width, height } (image·thumb 는 JPEG data URL) */
export async function shrink(file) {
  const src = await decode(file);
  try {
    const big = draw(src, BIG, 0.82);
    const small = draw(src, SMALL, 0.72);
    return { image: big.url, thumb: small.url, width: big.width, height: big.height };
  } finally {
    src.close?.();
  }
}

/** 사진 주소 (pub: 성도 화면용). ?v=파일이름 → 같은 주소면 내용이 같으므로 오래 캐시해도 됨 */
export const photoUrl = (albumId, p, { thumb = false, pub = false } = {}) =>
  withChurch(`/api/${pub ? 'public/' : ''}albums/${albumId}/photos/${p.id}${thumb ? '/thumb' : ''}?v=${p.file}`);

/** 앨범 대표 사진 (작은 사진) 주소 */
export const coverUrl = (a, pub = false) =>
  a.cover_photo ? photoUrl(a.id, { id: a.cover_photo, file: a.cover_file }, { thumb: true, pub }) : null;

export const mb = (bytes) => `${(Number(bytes || 0) / 1024 / 1024).toFixed(1)}MB`;
