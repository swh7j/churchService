package com.church.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.church.api.tenant.ChurchContext;

import tools.jackson.databind.JsonNode;

/** 요청·제보 게시판: 하루 3개 제한, 비밀글, 작성자 비밀번호, 교회 관리자·전체 관리자 답변 */
class SupportTest extends IntegrationTest {

	@Autowired
	private JdbcTemplate jdbc;

	/** 테스트끼리 하루 제한이 섞이지 않게 기록을 비움 (테스트는 모두 같은 접속 주소) */
	private void resetQuota() {
		ChurchContext.run(CHURCH, () -> jdbc.update("DELETE FROM support_post_log"));
	}

	private long post(Client c, String title, boolean secret) {
		return c.post("/api/public/requests", Map.of("category", "악보 요청", "title", title, "content", "내용 " + title, "password", "1234", "secret", secret))
				.ok().json().path("id").asLong();
	}

	private JsonNode find(JsonNode list, long id) {
		for (JsonNode r : list) if (r.path("id").asLong() == id) return r;
		return null;
	}

	@Test
	@DisplayName("도배 방지: 같은 접속에서 10분에 20개까지, 21번째는 429 / 지워도 개수는 그대로 / 10분 지나면 다시 됨")
	void postLimit() {
		resetQuota();
		Client c = client();
		long first = post(c, "1", false);
		for (int i = 2; i <= 19; i++) post(c, String.valueOf(i), false);
		assertThat(c.get("/api/public/requests/quota").ok().json().path("left").asInt()).isEqualTo(1);
		post(c, "20", false);
		Res over = c.post("/api/public/requests", Map.of("category", "오류 제보", "title", "21", "content", "x", "password", "1234"));
		assertThat(over.status()).isEqualTo(429);
		c.post("/api/public/requests/" + first + "/delete", Map.of("password", "1234")).ok();
		assertThat(c.post("/api/public/requests", Map.of("category", "오류 제보", "title", "22", "content", "x", "password", "1234")).status()).isEqualTo(429);
		// 기록을 11분 전으로 돌리면 다시 올릴 수 있음
		ChurchContext.run(CHURCH, () -> jdbc.update("UPDATE support_post_log SET created_at = datetime('now','localtime','-11 minutes')"));
		post(c, "23", false);
		resetQuota();
	}

	@Test
	@DisplayName("비밀글은 성도 화면에서 가려지고, 작성자는 비밀번호로 볼 수 있음")
	void secret() {
		resetQuota();
		Client c = client();
		long id = post(c, "비밀 제목", true);
		JsonNode r = find(c.get("/api/public/requests").ok().json(), id);
		assertThat(r.path("is_secret").asInt()).isEqualTo(1);
		assertThat(r.path("title").isNull()).isTrue();
		assertThat(r.path("content").isNull()).isTrue();
		assertThat(c.post("/api/public/requests/" + id + "/view", Map.of("password", "틀림")).status()).isEqualTo(400);
		assertThat(c.post("/api/public/requests/" + id + "/view", Map.of("password", "1234")).ok().json().path("title").asString()).isEqualTo("비밀 제목");
		// 목록에 비밀번호가 나가지 않음
		assertThat(c.get("/api/public/requests").body()).doesNotContain("password");
		resetQuota();
	}

	@Test
	@DisplayName("교회 관리자가 상태·답변을 달면 성도 화면에 보임")
	void churchAnswer() {
		resetQuota();
		long id = post(client(), "301장 악보 올려 주세요", false);
		admin().put("/api/requests/" + id, Map.of("status", "완료", "answer", "올렸습니다.")).ok();
		JsonNode r = find(client().get("/api/public/requests").ok().json(), id);
		assertThat(r.path("status").asString()).isEqualTo("완료");
		assertThat(r.path("answer").asString()).isEqualTo("올렸습니다.");
		assertThat(r.path("answered_by").asString()).isEqualTo("교회 관리자");
		// 잘못된 상태는 거절, 로그인 안 한 사람은 답변 불가
		assertThat(admin().put("/api/requests/" + id, Map.of("status", "아무거나", "answer", "")).status()).isEqualTo(400);
		assertThat(client().put("/api/requests/" + id, Map.of("status", "완료", "answer", "x")).status()).isIn(401, 403);
		resetQuota();
	}

	@Test
	@DisplayName("전체 관리자는 모든 교회 요청을 보고 답변 (교회 이름 포함)")
	void platformAnswer() {
		resetQuota();
		long id = post(client(), "오류가 나요", false);
		Client p = platform();
		JsonNode r = find(p.get("/api/platform/requests").ok().json(), id);
		assertThat(r).isNotNull();
		assertThat(r.path("church").asString()).isEqualTo(CHURCH);
		p.put("/api/platform/requests/" + CHURCH + "/" + id, Map.of("status", "처리 중", "answer", "확인 중입니다.")).ok();
		JsonNode pub = find(client().get("/api/public/requests").ok().json(), id);
		assertThat(pub.path("answered_by").asString()).isEqualTo("전체 관리자");
		assertThat(pub.path("status").asString()).isEqualTo("처리 중");
		// 교회 관리자는 전체 관리자 주소를 쓸 수 없음
		assertThat(client().get("/api/platform/requests").status()).isIn(401, 403);
		resetQuota();
	}

	@Test
	@DisplayName("필수 칸·종류 검사")
	void validation() {
		resetQuota();
		Client c = client();
		assertThat(c.post("/api/public/requests", Map.of("category", "아무거나", "title", "t", "content", "c", "password", "1234")).status()).isEqualTo(400);
		assertThat(c.post("/api/public/requests", Map.of("category", "기타 문의", "title", "", "content", "c", "password", "1234")).status()).isEqualTo(400);
		assertThat(c.post("/api/public/requests", Map.of("category", "기타 문의", "title", "t", "content", "c", "password", "12")).status()).isEqualTo(400);
		resetQuota();
	}
}
