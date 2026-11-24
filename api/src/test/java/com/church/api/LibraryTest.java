package com.church.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
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

	/** 그림 n장이 든 zip (001.jpg …). 내용은 검사하지 않으므로 아무 바이트 */
	static byte[] zip(int n) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		try (ZipOutputStream z = new ZipOutputStream(out)) {
			for (int i = 1; i <= n; i++) {
				z.putNextEntry(new ZipEntry(String.format("%03d.jpg", i)));
				z.write(new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) i });
				z.closeEntry();
			}
		}
		return out.toByteArray();
	}

	private static String q(String s) {
		return URLEncoder.encode(s, StandardCharsets.UTF_8);
	}

	/** 바이트 본문 PUT (Client 에는 JSON PUT 만 있어서 직접) */
	private Res putBytes(Client c, String path, byte[] body) {
		try {
			var f = Client.class.getDeclaredField("http");
			f.setAccessible(true);
			var http = (java.net.http.HttpClient) f.get(c);
			var r = http.send(HttpRequest.newBuilder(URI.create(base() + path)).header("X-Church", CHURCH)
					.header("Content-Type", "application/octet-stream").PUT(BodyPublishers.ofByteArray(body)).build(),
					java.net.http.HttpResponse.BodyHandlers.ofString());
			return new Res(r.statusCode(), r.body(), r);
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	@BeforeAll
	void platformLogin() {
		// 첫 전체 관리자 계정은 운영 교회 관리자로 로그인한 브라우저에서 만듦
		platform = admin();
		Res me = platform.get("/api/platform/me").ok();
		if (me.json().path("setupRequired").asBoolean()) {
			platform.post("/api/platform/setup", Map.of("username", "root", "name", "전체", "password", "platform-pass-1234")).ok();
		} else {
			platform.post("/api/platform/login", Map.of("username", "root", "password", "platform-pass-1234")).ok();
		}
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
	@DisplayName("교회 보관함에서 공용으로 가져오기: 화면과 찬송 제목이 함께 옴, 이미 있는 번호는 건너뜀")
	void importFromChurch() throws IOException {
		Client a = admin();
		putBytes(a, "/api/worship-ppt/inserts/hymn/62", zip(4)).ok();
		putBytes(a, "/api/worship-ppt/inserts/reading/15", zip(2)).ok();
		a.put("/api/worship-ppt/hymns", Map.of("hymns", "{\"62\":\"고요히 머리숙여\"}")).ok();

		JsonNode r = platform.post("/api/platform/library/import", Map.of("church", CHURCH)).ok().json();
		assertThat(r.path("copied").asInt()).isGreaterThanOrEqualTo(2);
		JsonNode again = platform.post("/api/platform/library/import", Map.of("church", CHURCH)).ok().json();
		assertThat(again.path("copied").asInt()).isZero();

		JsonNode h62 = null;
		for (JsonNode x : a.get("/api/library").ok().json()) if (x.path("kind").asString().equals("hymn") && x.path("key").asString().equals("62")) h62 = x;
		assertThat(h62).isNotNull();
		assertThat(h62.path("count").asInt()).isEqualTo(4);
		assertThat(h62.path("title").asString()).isEqualTo("고요히 머리숙여");
		assertThat(a.get("/api/library/reading/15/file").status()).isEqualTo(200);
	}

	@Test
	@DisplayName("지우면 목록과 화면이 함께 사라짐")
	void delete() throws IOException {
		putBytes(platform, "/api/platform/library/hymn?no=99", zip(1)).ok();
		platform.delete("/api/platform/library/hymn/99").ok();
		assertThat(admin().get("/api/library/hymn/99/file").status()).isEqualTo(404);
	}
}
