package com.church.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import tools.jackson.databind.JsonNode;

/** 공용 찬송가 보관함: 전체 관리자만 올리고 지우며, 교회는 가져다 쓰기만 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LibraryTest extends IntegrationTest {

	private Client platform;

	/** 그림 n장이 든 zip (001.jpg …) */
	static byte[] zip(int n) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		try (ZipOutputStream z = new ZipOutputStream(out)) {
			for (int i = 1; i <= n; i++) {
				z.putNextEntry(new ZipEntry(String.format("%03d.jpg", i)));
				z.write(image("jpg"));
				z.closeEntry();
			}
		}
		return out.toByteArray();
	}

	private static String q(String s) {
		return URLEncoder.encode(s, StandardCharsets.UTF_8);
	}

	private Res putBytes(Client c, String path, byte[] body) {
		return c.putRaw(path, "application/octet-stream", body);
	}

	@BeforeAll
	void platformLogin() {
		platform = platform();
	}

	@Test
	@DisplayName("전체 관리자가 찬송가를 올리면 교회 관리자 목록에 보이고 화면을 받을 수 있음")
	void uploadAndUse() throws IOException {
		putBytes(platform, "/api/platform/library/hymn?no=301&title=" + q("지금까지 지내온 것"), zip(3)).ok();
		JsonNode list = admin().get("/api/library").ok().json();
		JsonNode h = null;
		for (JsonNode r : list) if (r.path("kind").asString().equals("hymn") && r.path("key").asString().equals("301")) h = r;
		assertThat(h).isNotNull();
		assertThat(h.path("count").asInt()).isEqualTo(3);
		assertThat(h.path("title").asString()).isEqualTo("지금까지 지내온 것");
		Res f = admin().get("/api/library/hymn/301/file").ok();
		assertThat(f.header("Content-Type")).startsWith("application/zip");
	}

	@Test
	@DisplayName("경배와 찬양은 제목으로 저장 (띄어쓰기·기호 무시)")
	void praiseByTitle() throws IOException {
		JsonNode r = putBytes(platform, "/api/platform/library/praise?no=2&title=" + q("그 사랑(아버지 사랑 내가 노래해)"), zip(2)).ok().json();
		assertThat(r.path("key").asString()).isEqualTo("그사랑아버지사랑내가노래해");
		assertThat(admin().get("/api/library/praise/" + q("그사랑아버지사랑내가노래해") + "/file").status()).isEqualTo(200);
		// 제목이 없으면 거절
		assertThat(putBytes(platform, "/api/platform/library/praise?title=", zip(1)).status()).isEqualTo(400);
	}

	@Test
	@DisplayName("교회 관리자나 로그인 안 한 사람은 공용 보관함을 바꿀 수 없음")
	void onlyPlatformCanWrite() throws IOException {
		assertThat(putBytes(admin(), "/api/platform/library/hymn?no=1", zip(1)).status()).isIn(401, 403);
		assertThat(putBytes(client(), "/api/platform/library/hymn?no=1", zip(1)).status()).isIn(401, 403);
		assertThat(admin().delete("/api/platform/library/hymn/301").status()).isIn(401, 403);
		assertThat(client().get("/api/library").status()).isIn(401, 403);
	}

	@Test
	@DisplayName("그림이 아닌 파일·이상한 종류는 거절")
	void rejectsBadInput() throws IOException {
		assertThat(putBytes(platform, "/api/platform/library/hymn?no=5", "not a zip".getBytes()).status()).isEqualTo(400);
		assertThat(putBytes(platform, "/api/platform/library/song?no=5", zip(1)).status()).isEqualTo(400);
		assertThat(putBytes(platform, "/api/platform/library/hymn?no=abc", zip(1)).status()).isEqualTo(400);
	}

	@Test
	@DisplayName("지우면 목록과 화면이 함께 사라짐")
	void delete() throws IOException {
		putBytes(platform, "/api/platform/library/hymn?no=99", zip(1)).ok();
		platform.delete("/api/platform/library/hymn/99").ok();
		assertThat(admin().get("/api/library/hymn/99/file").status()).isEqualTo(404);
	}
}
