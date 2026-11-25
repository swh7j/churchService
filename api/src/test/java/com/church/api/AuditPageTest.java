package com.church.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.church.api.tenant.ChurchContext;

import tools.jackson.databind.JsonNode;

/** 활동 기록 화면: 페이지로 나눠 불러옴 */
class AuditPageTest extends IntegrationTest {

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	@DisplayName("검색 결과를 30건씩 나눠 주고, 범위 밖 페이지는 마지막 페이지로")
	void paging() {
		Client a = admin();
		ChurchContext.run(CHURCH, () -> {
			jdbc.update("DELETE FROM audit_log WHERE detail LIKE '페이징시험%'");
			for (int i = 1; i <= 35; i++)
				jdbc.update("INSERT INTO audit_log (user_name, action, target, detail) VALUES ('시험', '수정', 'members', ?)", "페이징시험 " + i);
		});

		JsonNode p1 = a.get("/api/audit/page?q=" + enc("페이징시험") + "&page=1&size=30").ok().json();
		assertThat(p1.path("total").asInt()).isEqualTo(35);
		assertThat(p1.path("pages").asInt()).isEqualTo(2);
		assertThat(p1.path("rows").size()).isEqualTo(30);
		assertThat(p1.path("rows").get(0).path("detail").asString()).isEqualTo("페이징시험 35"); // 최신 먼저

		JsonNode p2 = a.get("/api/audit/page?q=" + enc("페이징시험") + "&page=2&size=30").ok().json();
		assertThat(p2.path("rows").size()).isEqualTo(5);
		assertThat(p2.path("rows").get(4).path("detail").asString()).isEqualTo("페이징시험 1");

		JsonNode over = a.get("/api/audit/page?q=" + enc("페이징시험") + "&page=99&size=30").ok().json();
		assertThat(over.path("page").asInt()).isEqualTo(2);

		assertThat(a.get("/api/audit/page?q=" + enc("없는검색어zz")).ok().json().path("total").asInt()).isZero();
		assertThat(a.get("/api/audit?q=" + enc("페이징시험")).ok().json().size()).isEqualTo(35); // 엑셀용 목록은 그대로
		assertThat(client().get("/api/audit/page").status()).isEqualTo(401);
		Client staff = userWithRole("auditstaff", "staff"); // 관리자만 볼 수 있음
		assertThat(staff.get("/api/audit/page").status()).isEqualTo(403);
		assertThat(staff.get("/api/audit").status()).isEqualTo(403);
	}

	private static String enc(String s) {
		return java.net.URLEncoder.encode(s, java.nio.charset.StandardCharsets.UTF_8);
	}
}
