package com.church.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 로그인·권한·보안 설정 (실제 서버에 요청) */
class AuthAndSecurityTest extends IntegrationTest {

	@Test
	@DisplayName("설치 코드가 틀리면 첫 관리자 계정을 만들 수 없음")
	void setupNeedsCode() {
		Res r = client().post("/api/auth/setup", Map.of("setupToken", "WRONG123", "username", "hacker", "name", "x", "password", "hacker-pass-1"));
		assertThat(r.status()).isEqualTo(400);
		// 다른 테스트가 먼저 관리자를 만들었으면 '이미 있음', 아니면 '코드 틀림' — 어느 쪽이든 hacker 계정은 생기면 안 됨
		Res login = client().post("/api/auth/login", Map.of("username", "hacker", "password", "hacker-pass-1"));
		assertThat(login.status()).isEqualTo(400);
	}

	@Test
	@DisplayName("로그인하지 않으면 관리 기능은 모두 401")
	void needsLogin() {
		Client anon = client();
		for (String p : new String[] { "/api/members", "/api/reports/summary", "/api/albums", "/api/worship-ppt/inserts", "/api/users", "/api/backups" }) {
			assertThat(anon.get(p).status()).as(p).isEqualTo(401);
		}
		// 성도 화면은 로그인 없이
		assertThat(anon.get("/api/public/info").status()).isEqualTo(200);
	}

	@Test
	@DisplayName("세션 쿠키: 스크립트가 못 읽음(HttpOnly), 다른 사이트에서 안 보냄(SameSite=Lax)")
	void sessionCookieFlags() {
		admin(); // 관리자 계정 준비
		Res r = client().post("/api/auth/login", Map.of("username", "admin", "password", ADMIN_PW)).ok();
		String cookie = r.header("Set-Cookie");
		assertThat(cookie).startsWith("sid_" + CHURCH + "=").contains("HttpOnly").contains("SameSite=Lax");
	}

	@Test
	@DisplayName("역할별 권한: 재정 담당은 교인 조회만(헌금 입력용), 교역자는 결산 X, 둘 다 사용자 관리 X")
	void rolePermissions() {
		Client finance = userWithRole("finance1", "finance");
		Client staff = userWithRole("staff1", "staff");

		assertThat(finance.get("/api/reports/summary").status()).isEqualTo(200);
		// 헌금 입력할 때 교인을 찾아야 해서 조회는 되지만, 등록·수정은 안 됨
		assertThat(finance.get("/api/members").status()).isEqualTo(200);
		assertThat(finance.post("/api/members", Map.of("name", "T교인")).status()).isEqualTo(403);
		assertThat(finance.get("/api/albums").status()).isEqualTo(403);
		assertThat(finance.get("/api/users").status()).isEqualTo(403);

		assertThat(staff.get("/api/members").status()).isEqualTo(200);
		assertThat(staff.get("/api/albums").status()).isEqualTo(200);
		assertThat(staff.get("/api/reports/summary").status()).isEqualTo(403);
		assertThat(staff.put("/api/reports/budgets", Map.of("year", 2026, "items", java.util.List.of())).status()).isEqualTo(403);
		assertThat(staff.get("/api/users").status()).isEqualTo(403);
	}

	@Test
	@DisplayName("같은 아이디로 5번 틀리면 잠기고, 다른 아이디는 영향 없음")
	void loginLock() {
		Client c = client();
		for (int i = 0; i < 5; i++) {
			assertThat(c.post("/api/auth/login", Map.of("username", "locktest", "password", "wrong-pass")).status()).isEqualTo(400);
		}
		Res locked = c.post("/api/auth/login", Map.of("username", "locktest", "password", "wrong-pass"));
		assertThat(locked.status()).isEqualTo(429);
		assertThat(locked.json().path("error").asString()).contains("잠겼습니다");

		assertThat(c.post("/api/auth/login", Map.of("username", "someone-else", "password", "wrong-pass")).status()).isEqualTo(400);
	}

	@Test
	@DisplayName("보안 헤더: CSP(우리 서버 스크립트만), 다른 사이트 안에 넣기 금지")
	void securityHeaders() {
		Res r = client().get("/api/churches");
		assertThat(r.header("Content-Security-Policy")).contains("script-src 'self'").contains("frame-ancestors 'none'").contains("object-src 'none'");
		assertThat(r.header("X-Frame-Options")).isEqualTo("DENY");
		assertThat(r.header("X-Content-Type-Options")).isEqualTo("nosniff");
	}

	@Test
	@DisplayName("로그인 없이 보내는 큰 요청(100KB)은 413 으로 막고, 보통 요청은 그대로")
	void bodyLimit() {
		String big = "{\"content\":\"" + "가".repeat(40_000) + "\",\"password\":\"1234\"}";
		assertThat(client().postRaw("/api/public/prayers", "application/json", big.getBytes(StandardCharsets.UTF_8)).status()).isEqualTo(413);
		assertThat(client().postRaw("/api/auth/login", "application/json", big.getBytes(StandardCharsets.UTF_8)).status()).isEqualTo(413);

		Res ok = client().post("/api/public/prayers", Map.of("content", "가족의 건강을 위해", "password", "1234", "nickname", "익명"));
		assertThat(ok.status()).isBetween(200, 201);
		// 목록에는 비밀번호(해시)가 나가지 않음
		String list = client().get("/api/public/prayers").ok().body();
		assertThat(list).contains("가족의 건강을 위해").doesNotContain("password").doesNotContain("scrypt$");
	}

	@Test
	@DisplayName("없는 교회 코드로는 아무것도 못 함")
	void unknownChurch() {
		Res r = client().get("/api/public/info?church=no-such-church");
		// X-Church 헤더(testchurch)가 우선 → 정상. 헤더 없이 없는 교회만 주면 오류
		assertThat(r.status()).isEqualTo(200);
		java.net.http.HttpClient h = java.net.http.HttpClient.newHttpClient();
		try {
			var resp = h.send(java.net.http.HttpRequest.newBuilder(java.net.URI.create(base() + "/api/public/info?church=no-such-church")).build(),
					java.net.http.HttpResponse.BodyHandlers.ofString());
			assertThat(resp.statusCode()).isIn(400, 404);
		} catch (Exception e) {
			throw new AssertionError(e);
		}
	}
}
