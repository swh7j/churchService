// '홈 화면에 앱 추가' 버튼 + 기기별 안내 (안드로이드는 바로 설치, 아이폰·카카오톡은 방법 안내)
import { useEffect, useState } from 'react';
import { installMode, onInstallChange, promptInstall } from './pwa';

const GUIDES = {
  ios: {
    title: '아이폰 홈 화면에 추가하기',
    steps: ['사파리(Safari)로 이 화면을 열어 주세요.', '아래쪽 가운데 공유 버튼(□↑)을 누르세요.', "목록을 내려 '홈 화면에 추가'를 누르세요.", "오른쪽 위 '추가'를 누르면 끝!"],
  },
  android: {
    title: '안드로이드 홈 화면에 추가하기',
    steps: ['크롬(Chrome)이나 삼성 인터넷으로 이 화면을 열어 주세요.', '오른쪽 위(또는 아래) 메뉴 ⋮ / ≡ 를 누르세요.', "'홈 화면에 추가' 또는 '앱 설치'를 누르세요."],
  },
  inapp: {
    title: '다른 브라우저에서 열어 주세요',
    steps: ['카카오톡·네이버 앱 안에서는 홈 화면에 추가할 수 없어요.', "오른쪽 아래(또는 위) ⋮ 메뉴에서 '다른 브라우저로 열기'를 누르세요.", '열린 크롬·사파리에서 다시 이 버튼을 눌러 주세요.'],
  },
};

export function useInstallMode() {
  const [mode, setMode] = useState(installMode);
  useEffect(() => onInstallChange(() => setMode(installMode())), []);
  return mode;
}

/**
 * variant: 'card'(성도 홈 화면 안내 카드) | 'link'(관리자 메뉴 아래 작은 링크)
 * 이미 앱으로 열었거나 PC 처럼 안내할 게 없으면 아무것도 안 보임
 */
export default function InstallApp({ variant = 'card', label = '홈 화면에 앱 추가' }) {
  const mode = useInstallMode();
  const [guide, setGuide] = useState(null);
  if (!mode || mode === 'installed') return null;

  const click = async () => {
    if (mode === 'prompt') await promptInstall();
    else setGuide(GUIDES[mode]);
  };

  return (
    <>
      {variant === 'card' ? (
        <section className="pub-card install-card">
          <div>
            <strong>📱 앱처럼 쓰기</strong>
            <p>홈 화면에 추가하면 아이콘을 눌러 바로 소식·주보를 볼 수 있어요.</p>
          </div>
          <button className="pub-btn small" onClick={click}>{label}</button>
        </section>
      ) : (
        <button className="install-link" onClick={click}>📱 {label}</button>
      )}
      {guide && (
        <div className="install-guide" role="dialog" aria-label={guide.title} onClick={(e) => e.target === e.currentTarget && setGuide(null)}>
          <div className="install-box">
            <h3>{guide.title}</h3>
            <ol>{guide.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            <button className="pub-btn small" onClick={() => setGuide(null)}>알겠어요</button>
          </div>
        </div>
      )}
    </>
  );
}
