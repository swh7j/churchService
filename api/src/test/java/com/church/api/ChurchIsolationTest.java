package com.church.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.church.api.tenant.ChurchContext;

import tools.jackson.databind.JsonNode;

/**
 * 교회 간 격리: 교회마다 DB·로그인이 따로라서, 한 교회의 데이터·로그인으로 다른 교회에 닿을 수 없어야 함.
 * A = 기본 시험 교회(testchurch), B = 여기서 새로 등록하는 교회(isotest)
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ChurchIsolationTest extends IntegrationTest {

	static final String B = "isotest";
	static final String B_PW = "b-admin-pass-1234";

	@Autowired
	private JdbcTemplate jdbc;

	private Client a; // A 교회 관리자
	private Client b; // B 교회 관리자

	@BeforeAll
	void twoChurches() {
		Client p = platform();
		if (p.get("/api/platform/churches").ok().body().contains("\"" + B + "\"")) {
			b = clientFor(B);
			b.post("/api/auth/login", Map.of("username", "badmin", "password", B_PW)).ok();
		} else {
			String code = p.post("/api/platform/churches", Map.of("code", B, "name", "격리시험교회")).ok().json().path("setup_code").asString();
			b = clientFor(B);
			b.post("/api/auth/setup", Map.of("setupToken", code, "username", "badmin", "name", "B관리자", "password", B_PW)).ok();
		}
		a = admin();
	}

	private boolean has(JsonNode list, String field, String value) {
		for (JsonNode r : list) if (value.equals(r.path(field).asString())) return true;
		return false;
	}

	@Test
	@DisplayName("A 교회 교인·헌금·소식은 B 교회 관리자 화면·성도 화면에 보이지 않음")
	void dataStaysInChurch() {
		long memberId = a.post("/api/members", Map.of("name", "격리A교인")).ok().json().path("id").asLong();
		long typeId = a.post("/api/offering_types", Map.of("name", "격리A감사", "grp", "기본", "sort", 99)).ok().json().path("id").asLong();
		a.post("/api/offerings", Map.of("date", "2019-05-05", "type_id", typeId, "amount", 123_456, "member_id", memberId)).ok();
		a.post("/api/news", Map.of("title", "격리A공지", "category", "공지", "content", "A만", "date", "2019-05-05", "is_public", 1)).ok();

		// A 에서는 보임
		assertThat(has(a.get("/api/members").ok().json(), "name", "격리A교인")).isTrue();
		assertThat(a.get("/api/public/news").ok().body()).contains("격리A공지");

		// B 에서는 안 보임 (목록, 같은 번호로 직접 조회, 성도 화면)
		assertThat(has(b.get("/api/members").ok().json(), "name", "격리A교인")).isFalse();
		Res byId = b.get("/api/members/" + memberId);
		assertThat(byId.status() == 404 || !byId.body().contains("격리A교인")).isTrue();
		assertThat(b.get("/api/offerings").ok().body()).doesNotContain("123456");
		assertThat(clientFor(B).get("/api/public/news").ok().body()).doesNotContain("격리A공지");

		// DB 파일도 따로: B 교회 DB 에는 그 교인이 없음
		int inB = ChurchContext.call(B, () -> jdbc.queryForObject("SELECT COUNT(*) FROM members WHERE name = '격리A교인'", Integer.class));
		int inA = ChurchContext.call(CHURCH, () -> jdbc.queryForObject("SELECT COUNT(*) FROM members WHERE name = '격리A교인'", Integer.class));
		assertThat(inB).isZero();
		assertThat(inA).isEqualTo(1);
	}

	@Test
	@DisplayName("A 교회 로그인 쿠키로 B 교회에 들어갈 수 없음 (쿠키 이름을 바꿔 넣어도)")
	void sessionStaysInChurch() {
		String token = a.cookie("sid_" + CHURCH);
		assertThat(token).isNotBlank();

		// A 쿠키 그대로 B 교회로 요청
		Client x = clientFor(B);
		x.setCookie("sid_" + CHURCH, token);
		assertThat(x.get("/api/members").status()).isEqualTo(401);
		assertThat(x.get("/api/auth/me").ok().json().path("user").isNull()).isTrue();

		// A 토큰을 B 쿠키 이름으로 바꿔 넣어도 B DB 에는 그 세션이 없음
		Client y = clientFor(B);
		y.setCookie("sid_" + B, token);
		assertThat(y.get("/api/members").status()).isEqualTo(401);

		// 반대로 B 관리자 쿠키로 A 교회도 안 됨
		Client z = client();
		z.setCookie("sid_" + CHURCH, b.cookie("sid_" + B));
		assertThat(z.get("/api/members").status()).isEqualTo(401);
	}

	@Test
	@DisplayName("A 교회 아이디·비밀번호로 B 교회에 로그인할 수 없음")
	void accountsStayInChurch() {
		assertThat(clientFor(B).post("/api/auth/login", Map.of("username", "admin", "password", ADMIN_PW)).status()).isIn(400, 401);
		assertThat(client().post("/api/auth/login", Map.of("username", "badmin", "password", B_PW)).status()).isIn(400, 401);
	}

	@Test
	@DisplayName("교회를 정하지 않았거나 없는 교회면 거절, 사용 중지된 교회는 403")
	void unknownOrStoppedChurch() {
		assertThat(clientFor(null).get("/api/public/info").status()).isEqualTo(400);
		assertThat(clientFor("no-such-church").get("/api/public/info").status()).isEqualTo(400);

		Client p = platform();
		p.put("/api/platform/churches/" + B, Map.of("active", 0)).ok();
		try {
			assertThat(clientFor(B).get("/api/public/info").status()).isEqualTo(403);
			assertThat(b.get("/api/members").status()).isEqualTo(403);
		} finally {
			p.put("/api/platform/churches/" + B, Map.of("active", 1)).ok();
		}
		assertThat(b.get("/api/members").status()).isEqualTo(200);
	}

	@Test
	@DisplayName("요청이 끝나면 교회 정보가 남지 않고, 다른 교회 작업 중 에러가 나도 원래 교회로 돌아옴")
	void contextIsCleared() {
		assertThat(ChurchContext.get()).isNull();
		ChurchContext.set(CHURCH);
		try {
			try {
				ChurchContext.run(B, () -> {
					assertThat(ChurchContext.get()).isEqualTo(B);
					throw new IllegalStateException("일부러 낸 에러");
				});
			} catch (IllegalStateException expected) {
				// 무시
			}
			assertThat(ChurchContext.get()).isEqualTo(CHURCH);
		} finally {
			ChurchContext.set(null);
		}
		assertThat(ChurchContext.get()).isNull();
		// 교회를 정하지 않고 DB 를 쓰면 다른 교회로 새지 않고 바로 에러
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.queryForObject("SELECT COUNT(*) FROM members", Integer.class))
				.hasStackTraceContaining("교회가 선택되지 않은 상태");
	}
}
