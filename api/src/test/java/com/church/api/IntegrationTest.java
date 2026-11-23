package com.church.api;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 통합 테스트 공통: 빈 임시 폴더에 새 DB 로 실제 서버를 띄우고, 쿠키를 기억하는 HTTP 클라이언트로 요청.
 * (개발용 data 폴더는 건드리지 않음)
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class IntegrationTest {

	public static final String CHURCH = "testchurch";
	public static final String SETUP_CODE = "TESTCODE";
	public static final String ADMIN_PW = "admin-pass-1234";
	protected static final JsonMapper JSON = JsonMapper.builder().build();
	protected static final Path ROOT;

	static {
		try {
			ROOT = Files.createTempDirectory("church-test");
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	@DynamicPropertySource
	static void props(DynamicPropertyRegistry r) {
		r.add("app.data-dir", () -> ROOT.resolve("data").toString());
		r.add("app.backup-dir", () -> ROOT.resolve("backups").toString());
		r.add("app.web-dir", () -> ROOT.resolve("web").toString());
		r.add("app.default-church", () -> CHURCH);
		r.add("app.setup-token", () -> SETUP_CODE);
	}

	@Autowired
	private Environment env;

	protected String base() {
		return "http://localhost:" + env.getProperty("local.server.port");
	}

	/** 새 브라우저처럼 쿠키를 따로 가진 클라이언트 */
	protected Client client() {
		return new Client(base());
	}

	/** 관리자로 로그인한 클라이언트 (처음이면 설치 코드로 관리자 계정을 만듦) */
	protected synchronized Client admin() {
		Client c = client();
		Res me = c.get("/api/auth/me");
		if (me.json().path("setupRequired").asBoolean()) {
			c.post("/api/auth/setup", Map.of("setupToken", SETUP_CODE, "username", "admin", "name", "관리자", "password", ADMIN_PW)).ok();
		} else {
			c.post("/api/auth/login", Map.of("username", "admin", "password", ADMIN_PW)).ok();
		}
		return c;
	}

	/** 역할(finance/staff)이 있는 사용자를 만들고 그 사용자로 로그인한 클라이언트 */
	protected Client userWithRole(String username, String role) {
		admin().post("/api/users", Map.of("username", username, "name", username, "role", role, "password", "user-pass-1234")).ok();
		Client c = client();
		c.post("/api/auth/login", Map.of("username", username, "password", "user-pass-1234")).ok();
		return c;
	}

	public record Res(int status, String body, HttpResponse<String> raw) {
		public JsonNode json() {
			return JSON.readTree(body.isEmpty() ? "null" : body);
		}

		public String header(String name) {
			return raw.headers().firstValue(name).orElse(null);
		}

		/** 2xx 가 아니면 본문을 보여 주며 실패 */
		public Res ok() {
			if (status / 100 != 2) throw new AssertionError("기대: 성공(2xx), 실제: " + status + " " + body);
			return this;
		}
	}

	public static class Client {
		private final String base;
		private final HttpClient http;

		Client(String base) {
			this.base = base;
			this.http = HttpClient.newBuilder().cookieHandler(new CookieManager()).build();
		}

		public Res get(String path) {
			return send(HttpRequest.newBuilder(uri(path)).GET());
		}

		public Res post(String path, Object body) {
			return send(json(path).POST(BodyPublishers.ofString(JSON.writeValueAsString(body))));
		}

		public Res put(String path, Object body) {
			return send(json(path).PUT(BodyPublishers.ofString(JSON.writeValueAsString(body))));
		}

		public Res delete(String path) {
			return send(HttpRequest.newBuilder(uri(path)).DELETE());
		}

		/** 본문을 그대로 (크기 제한 시험 등) */
		public Res postRaw(String path, String contentType, byte[] body) {
			return send(HttpRequest.newBuilder(uri(path)).header("Content-Type", contentType).POST(BodyPublishers.ofByteArray(body)));
		}

		private HttpRequest.Builder json(String path) {
			return HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json");
		}

		private URI uri(String path) {
			return URI.create(base + path);
		}

		private Res send(HttpRequest.Builder b) {
			try {
				HttpResponse<String> r = http.send(b.header("X-Church", CHURCH).build(), BodyHandlers.ofString());
				return new Res(r.statusCode(), r.body(), r);
			} catch (IOException e) {
				throw new UncheckedIOException(e);
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
				throw new IllegalStateException(e);
			}
		}
	}
}
