package com.church.api;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
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

import javax.imageio.ImageIO;

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

	/**
	 * 백업 만들기. 파일 이름이 초 단위라 다른 테스트(앨범 등)가 같은 초에 백업했으면 400 "방금 백업했습니다"가 남
	 * (CI처럼 빠른 곳에서 가끔 실패하던 원인) → 다음 초까지 기다렸다 다시 만듦
	 */
	/** 진짜 그림 파일 (8x6, format: "jpg" 나 "png"). 올리기 검사가 내용을 실제로 읽어 보므로 가짜 바이트는 거절됨 */
	protected static byte[] image(String format) {
		try {
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			ImageIO.write(new BufferedImage(8, 6, BufferedImage.TYPE_INT_RGB), format, out);
			return out.toByteArray();
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	protected static String newBackup(Client a) {
		Res r = a.post("/api/backups", Map.of());
		if (r.status() == 400) {
			try {
				Thread.sleep(1100);
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			r = a.post("/api/backups", Map.of());
		}
		return r.ok().json().path("name").asString();
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

	public static final String PLATFORM_PW = "platform-pass-1234";

	/** 전체 관리자로 로그인한 클라이언트 (처음이면 운영 교회 관리자 브라우저에서 첫 계정을 만듦) */
	protected synchronized Client platform() {
		Client p = admin();
		if (p.get("/api/platform/me").json().path("setupRequired").asBoolean()) {
			p.post("/api/platform/setup", Map.of("username", "root", "name", "전체", "password", PLATFORM_PW)).ok();
		} else {
			p.post("/api/platform/login", Map.of("username", "root", "password", PLATFORM_PW)).ok();
		}
		return p;
	}

	/** 다른 교회로 요청하는 클라이언트 (X-Church 헤더가 그 교회, null 이면 헤더 없음) */
	protected Client clientFor(String church) {
		return new Client(base(), church);
	}

	public static class Client {
		private final String base;
		private final String church;
		private final CookieManager cookies = new CookieManager();
		private final HttpClient http;

		Client(String base) {
			this(base, CHURCH);
		}

		Client(String base, String church) {
			this.base = base;
			this.church = church;
			this.http = HttpClient.newBuilder().cookieHandler(cookies).build();
		}

		/** 받은 쿠키 값 (없으면 null) */
		public String cookie(String name) {
			return cookies.getCookieStore().getCookies().stream().filter(c -> c.getName().equals(name)).map(java.net.HttpCookie::getValue).findFirst().orElse(null);
		}

		/** 쿠키를 직접 넣기 (다른 교회 쿠키를 훔쳐 쓰는 경우 시험) */
		public void setCookie(String name, String value) {
			java.net.HttpCookie c = new java.net.HttpCookie(name, value);
			c.setPath("/");
			c.setVersion(0);
			cookies.getCookieStore().add(URI.create(base), c);
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

		/** 바이트 본문 PUT (파일 올리기 등) */
		public Res putRaw(String path, String contentType, byte[] body) {
			return send(HttpRequest.newBuilder(uri(path)).header("Content-Type", contentType).PUT(BodyPublishers.ofByteArray(body)));
		}

		private HttpRequest.Builder json(String path) {
			return HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json");
		}

		private URI uri(String path) {
			return URI.create(base + path);
		}

		private Res send(HttpRequest.Builder b) {
			try {
				if (church != null) b.header("X-Church", church);
				HttpResponse<String> r = http.send(b.build(), BodyHandlers.ofString());
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
