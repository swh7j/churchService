#!/usr/bin/env bash
# =====================================================================
#  교회 관리 시스템 - 서버 설치 / 업데이트 스크립트 (Ubuntu 22.04 / 24.04 — 오라클, 구글 등)
#
#  사용법 (서버에서):
#     sudo bash setup.sh <도메인>
#  예)  sudo bash setup.sh 152-70-11-22.sslip.io
#
#  같은 폴더에 church-api.jar 가 있어야 합니다.
#  여러 번 실행해도 안전합니다. (업데이트할 때도 이 스크립트를 다시 실행)
#  데이터(/opt/church/data)와 백업(/opt/church/backups)은 건드리지 않습니다.
# =====================================================================
set -euo pipefail

DOMAIN="${1:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
JAR_SRC="$HERE/church-api.jar"
APP=/opt/church
ENV_FILE=/etc/church.env

say() { echo -e "\n\033[1;34m[$1]\033[0m $2"; }
die() { echo -e "\n\033[1;31m오류:\033[0m $1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "sudo 를 붙여서 실행해 주세요.  예) sudo bash setup.sh $DOMAIN"
[ -n "$DOMAIN" ] || die "도메인을 입력해 주세요.  예) sudo bash setup.sh 152-70-11-22.sslip.io"
[ -f "$JAR_SRC" ] || die "church-api.jar 파일이 $HERE 에 없습니다. 먼저 업로드해 주세요."

# ---------------------------------------------------------------------
say "1/7" "시간대를 한국 시간으로 설정"
timedatectl set-timezone Asia/Seoul || true

# ---------------------------------------------------------------------
say "2/7" "필요한 프로그램 설치 (Java 17, Caddy 웹서버)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -q
apt-get install -y -q openjdk-17-jre-headless curl ca-certificates gnupg

if ! command -v caddy >/dev/null 2>&1; then
  # Caddy 공식 저장소 (HTTPS 인증서를 자동으로 받아주는 웹서버)
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y -q
  apt-get install -y -q caddy
fi

# ---------------------------------------------------------------------
say "3/7" "메모리가 작으면 스왑(가상 메모리) 추가"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 2000 ] && ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "  스왑 2GB 추가"
else
  echo "  필요 없음 (메모리 ${MEM_MB}MB)"
fi
if [ "$MEM_MB" -lt 2000 ]; then XMX=384m; elif [ "$MEM_MB" -lt 4000 ]; then XMX=768m; else XMX=1g; fi

# ---------------------------------------------------------------------
say "4/7" "프로그램 설치 ($APP)"
id church >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin church
mkdir -p "$APP/data" "$APP/backups"
install -m 644 "$JAR_SRC" "$APP/church-api.jar"
chown -R church:church "$APP"
# 데이터·백업은 프로그램(church 사용자)만 읽고 쓸 수 있게
chmod 750 "$APP"
chmod 700 "$APP/data" "$APP/backups"
find "$APP/data" "$APP/backups" -type f -exec chmod 600 {} +

# 설정 파일: 설치 코드는 처음 한 번만 만들고 이후에는 유지
if [ -f "$ENV_FILE" ] && grep -q '^SETUP_TOKEN=' "$ENV_FILE"; then
  SETUP_TOKEN=$(grep '^SETUP_TOKEN=' "$ENV_FILE" | cut -d= -f2)
else
  SETUP_TOKEN=$(head -c 64 /dev/urandom | tr -dc 'A-HJ-NP-Z2-9' | head -c 8)
fi
cat > "$ENV_FILE" <<EOF
PORT=8080
SERVER_ADDRESS=127.0.0.1
DATA_DIR=$APP/data
BACKUP_DIR=$APP/backups
WEB_DIR=$APP/web
COOKIE_SECURE=1
SETUP_TOKEN=$SETUP_TOKEN
JAVA_XMX=$XMX
TZ=Asia/Seoul
EOF
chown root:church "$ENV_FILE"
chmod 640 "$ENV_FILE"

cat > /etc/systemd/system/church.service <<'EOF'
[Unit]
Description=Church Admin (Spring Boot)
After=network-online.target
Wants=network-online.target

[Service]
User=church
WorkingDirectory=/opt/church
EnvironmentFile=/etc/church.env
ExecStart=/usr/bin/java -Xms64m -Xmx${JAVA_XMX} -Dfile.encoding=UTF-8 -jar /opt/church/church-api.jar
Restart=always
RestartSec=5
# 새로 만드는 파일(DB, 백업)은 본인만 읽기/쓰기
UMask=0077
SuccessExitStatus=143

[Install]
WantedBy=multi-user.target
EOF

# ---------------------------------------------------------------------
say "5/7" "HTTPS 웹서버 설정 ($DOMAIN)"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	# 너무 큰 요청은 프로그램에 닿기 전에 막음 (가장 큰 업로드: 예배 PPT 서식 40MB)
	request_body {
		max_size 50MB
	}
	header {
		# 브라우저가 이 주소는 항상 HTTPS 로만 접속하도록 (1년)
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		-Server
	}
	# 화면(HTML)은 매번 새 버전인지 확인 → 업데이트하면 바로 보이도록
	# (/assets 파일은 빌드할 때마다 이름이 바뀌므로 캐시해도 됨)
	@page not path /assets/* /api/*
	header @page Cache-Control "no-cache"
	reverse_proxy 127.0.0.1:8080
}
EOF

# ---------------------------------------------------------------------
say "6/7" "방화벽에서 80, 443 포트 열기"
# 오라클 Ubuntu 이미지는 iptables 로 대부분의 포트를 막아 둡니다. (구글 등은 콘솔 방화벽만 쓰므로 영향 없음)
if command -v iptables >/dev/null 2>&1; then
for PORT in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$PORT" -m state --state NEW -j ACCEPT 2>/dev/null; then
    LINE=$(iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')
    if [ -n "$LINE" ]; then
      iptables -I INPUT "$LINE" -p tcp --dport "$PORT" -m state --state NEW -j ACCEPT
    else
      iptables -A INPUT -p tcp --dport "$PORT" -m state --state NEW -j ACCEPT
    fi
  fi
done
if command -v netfilter-persistent >/dev/null 2>&1; then netfilter-persistent save >/dev/null 2>&1 || true; fi
else
  echo "  iptables 없음 (클라우드 콘솔 방화벽에서 80, 443 을 열어 주세요)"
fi

# ---------------------------------------------------------------------
say "7/7" "서비스 시작"
systemctl daemon-reload
systemctl enable church caddy >/dev/null 2>&1
systemctl restart church
systemctl restart caddy

echo -n "  프로그램이 켜지기를 기다리는 중"
for i in $(seq 1 60); do
  # 교회 목록은 교회를 고르지 않아도 응답함 (여러 교회 지원)
  if curl -fs http://127.0.0.1:8080/api/churches >/dev/null 2>&1; then echo " 완료"; break; fi
  echo -n "."; sleep 2
  if [ "$i" -eq 60 ]; then echo; die "프로그램이 시작되지 않았습니다. 로그 확인: sudo journalctl -u church -n 50"; fi
done

# 첫 번째 교회 (처음부터 쓰던 데이터)
CHURCH=$(curl -fs http://127.0.0.1:8080/api/churches | grep -o '"code":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
USERS=$(curl -fs -H "X-Church: $CHURCH" http://127.0.0.1:8080/api/auth/me | grep -o '"setupRequired":true' || true)

cat <<EOF

=====================================================================
  설치가 끝났습니다!

  교회 선택 :  https://$DOMAIN/
  성도 화면 :  https://$DOMAIN/c/$CHURCH
  관리자 화면:  https://$DOMAIN/c/$CHURCH/admin
EOF
if [ -n "$USERS" ]; then
cat <<EOF

  ▶ 관리자 계정을 아직 만들지 않았습니다.
    관리자 화면에 접속해서 아래 설치 코드를 입력하고 계정을 만드세요.

        설치 코드:  $SETUP_TOKEN

EOF
fi
cat <<EOF
  (처음 접속할 때 HTTPS 인증서를 받느라 10~30초 걸릴 수 있습니다)

  상태 확인:  sudo systemctl status church
  로그 보기:  sudo journalctl -u church -f
=====================================================================
EOF
