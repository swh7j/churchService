# =====================================================================
#  교회 관리 시스템 - 구글 클라우드 서버에 올리기 (처음 설치 + 업데이트 공용)
#
#  사용법 (프로젝트 폴더에서):  npm run deploy
#  처음 한 번만 서버 IP와 SSH 키 파일 위치를 물어보고 deploy\server.local.json 에 저장합니다.
#  (이 파일과 키 파일은 git 에 올라가지 않습니다)
# =====================================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$configFile = Join-Path $PSScriptRoot 'server.local.json'

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }

# 1. 서버 정보
if (Test-Path $configFile) {
    $cfg = Get-Content $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
    Write-Host '처음 실행이네요. 서버 정보를 입력해 주세요.' -ForegroundColor Yellow
    $ip = (Read-Host '서버 외부(공용) IP (예: 34.82.11.22)').Trim()
    $key = (Read-Host 'SSH 개인 키 파일 경로 (예: C:\Users\me\.ssh\church-gcp)').Trim('"', ' ')
    $userIn = (Read-Host '서버 사용자 이름 (그냥 Enter = deploy)').Trim()
    if (-not $userIn) { $userIn = 'deploy' }
    $domainIn = (Read-Host '도메인 (그냥 Enter 를 누르면 무료 주소 사용)').Trim()
    if (-not $domainIn) { $domainIn = ($ip -replace '\.', '-') + '.sslip.io' }
    $cfg = [pscustomobject]@{ ip = $ip; key = $key; user = $userIn; domain = $domainIn }
    $cfg | ConvertTo-Json | Set-Content $configFile -Encoding UTF8
    Write-Host "저장했습니다: $configFile"
}
if (-not (Test-Path $cfg.key)) { throw "SSH 키 파일이 없습니다: $($cfg.key)  ($configFile 를 고치거나 지우고 다시 실행하세요)" }

# SSH 키 파일 권한: 본인만 읽을 수 있어야 ssh 가 사용합니다.
icacls $cfg.key /inheritance:r /grant:r "$($env:USERNAME):(R)" | Out-Null

$target = "$($cfg.user)@$($cfg.ip)"
$sshOpts = @('-i', $cfg.key, '-o', 'StrictHostKeyChecking=accept-new')

# 2. 빌드
Step '1/3' '빌드 (화면 + Spring 을 jar 하나로)'
npm run build
if ($LASTEXITCODE -ne 0) { throw '빌드에 실패했습니다.' }
$jar = Join-Path $root 'api\target\church-api.jar'
if (-not (Test-Path $jar)) { throw "jar 파일이 없습니다: $jar" }

# 3. 업로드
Step '2/3' "서버로 업로드 ($target)"
scp @sshOpts $jar (Join-Path $PSScriptRoot 'setup.sh') "${target}:~/"
if ($LASTEXITCODE -ne 0) { throw '업로드에 실패했습니다. IP, 키 파일, 사용자 이름, 서버가 켜져 있는지 확인하세요.' }

# 4. 설치 / 재시작
Step '3/3' '서버에서 설치 스크립트 실행'
ssh @sshOpts $target "sudo bash ~/setup.sh $($cfg.domain)"
if ($LASTEXITCODE -ne 0) { throw '서버 설치 중 오류가 났습니다. 위 메시지를 확인하세요.' }

Write-Host "`n완료!  https://$($cfg.domain)/" -ForegroundColor Green
