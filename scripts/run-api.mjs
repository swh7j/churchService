// Spring Boot API 실행 도우미
//  - JAVA_HOME 이 Java 17 미만(예: Java 8)을 가리켜도, PATH 에 있는 Java 17+ 를 찾아 사용합니다.
//  - 사용: node scripts/run-api.mjs            → 개발 실행 (mvnw spring-boot:run)
//          node scripts/run-api.mjs package    → 배포용 jar 빌드 (api/target/church-api.jar)
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'api');
const isWin = process.platform === 'win32';

function javaInfo(javaCmd) {
  const r = spawnSync(javaCmd, ['-XshowSettings:properties', '-version'], { encoding: 'utf8' });
  const out = (r.stderr || '') + (r.stdout || '');
  const home = out.match(/java\.home = (.+)/)?.[1]?.trim();
  const spec = Number(out.match(/java\.specification\.version = (\S+)/)?.[1]);
  return home && spec ? { home, spec } : null;
}

const env = { ...process.env };
const fromHome = env.JAVA_HOME ? javaInfo(path.join(env.JAVA_HOME, 'bin', isWin ? 'java.exe' : 'java')) : null;
if (!fromHome || fromHome.spec < 17) {
  const onPath = javaInfo('java');
  if (!onPath || onPath.spec < 17) {
    console.error('Java 17 이상이 필요합니다. https://adoptium.net 에서 설치해 주세요.');
    process.exit(1);
  }
  env.JAVA_HOME = onPath.home;
}

// Windows 콘솔에서 한글 로그가 깨지지 않도록 UTF-8 출력 (java 실행 시 자동 적용되는 환경변수)
env.JDK_JAVA_OPTIONS = '-Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8';
const goals = process.argv[2] === 'package' ? ['-B', '-q', '-DskipTests', 'clean', 'package'] : ['spring-boot:run'];
const child = isWin
  ? spawn('cmd.exe', ['/c', path.join(apiDir, 'mvnw.cmd'), ...goals], { cwd: apiDir, env, stdio: 'inherit' })
  : spawn('./mvnw', goals, { cwd: apiDir, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
