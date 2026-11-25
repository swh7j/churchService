package com.church.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 예배 PPT 배경 그림: 관리자가 올리면 PPT 만들 때 서식의 배경을 이 그림으로 바꿈 */
class WorshipPptBackgroundTest extends IntegrationTest {

	private static final byte[] JPG = { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10, 'J', 'F', 'I', 'F' };
	private static final String OCTET = "application/octet-stream";

	@Test
	@DisplayName("올리기 → 정보에 올린 시각 → 받기 → 빼기")
	void uploadGetDelete() {
		Client a = admin();
		a.delete("/api/worship-ppt/background").ok();
		assertThat(a.get("/api/worship-ppt/background").status()).isEqualTo(404);

		assertThat(a.putRaw("/api/worship-ppt/background", OCTET, JPG).ok().json().path("background_at").asString()).isNotBlank();
		assertThat(a.get("/api/worship-ppt").ok().json().path("background_at").asString()).isNotBlank();
		Res got = a.get("/api/worship-ppt/background").ok();
		assertThat(got.header("Content-Type")).startsWith("image/jpeg");

		assertThat(a.delete("/api/worship-ppt/background").ok().json().has("background_at")).isFalse();
		assertThat(a.get("/api/worship-ppt/background").status()).isEqualTo(404);
	}

	@Test
	@DisplayName("그림이 아닌 파일은 거절, 로그인 안 하면 401")
	void rejects() {
		Client a = admin();
		assertThat(a.putRaw("/api/worship-ppt/background", OCTET, "hello".getBytes()).status()).isEqualTo(400);
		assertThat(client().putRaw("/api/worship-ppt/background", OCTET, JPG).status()).isEqualTo(401);
		assertThat(client().get("/api/worship-ppt/background").status()).isEqualTo(401);
	}
}
