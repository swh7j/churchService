package com.church.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** 휴대폰 홈 화면 앱(PWA) 정보: 교회별·성도/관리자별로 이름·시작 주소·아이콘이 다름 */
class PwaTest extends IntegrationTest {

	@Test
	@DisplayName("성도 앱: 교회 이름, /c/{교회}/ 에서 시작, 독립 창, 아이콘 3개(maskable 포함)")
	void memberManifest() {
		Res r = client().get("/c/" + CHURCH + "/manifest.webmanifest").ok();
		assertThat(r.header("Content-Type")).startsWith("application/manifest+json");
		JsonNode m = r.json();
		assertThat(m.path("name").asString()).isNotBlank();
		assertThat(m.path("start_url").asString()).isEqualTo("/c/" + CHURCH + "/");
		assertThat(m.path("scope").asString()).isEqualTo("/c/" + CHURCH + "/");
		assertThat(m.path("display").asString()).isEqualTo("standalone");
		assertThat(m.path("icons").size()).isEqualTo(3);
		assertThat(m.path("icons").get(0).path("src").asString()).startsWith("/icons/member-");
		assertThat(m.toString()).contains("maskable");
	}

	@Test
	@DisplayName("관리자 앱: 이름 뒤에 '관리', /admin/ 에서 시작, 성도 앱과 다른 id·아이콘")
	void adminManifest() {
		JsonNode member = client().get("/c/" + CHURCH + "/manifest.webmanifest").ok().json();
		JsonNode admin = client().get("/c/" + CHURCH + "/admin/manifest.webmanifest").ok().json();
		assertThat(admin.path("name").asString()).isEqualTo(member.path("name").asString() + " 관리");
		assertThat(admin.path("start_url").asString()).isEqualTo("/c/" + CHURCH + "/admin/");
		assertThat(admin.path("id").asString()).isNotEqualTo(member.path("id").asString());
		assertThat(admin.path("icons").get(0).path("src").asString()).startsWith("/icons/admin-");
	}

	@Test
	@DisplayName("없는 교회는 404")
	void unknownChurch() {
		assertThat(client().get("/c/no-such-church/manifest.webmanifest").status()).isEqualTo(404);
	}
}
