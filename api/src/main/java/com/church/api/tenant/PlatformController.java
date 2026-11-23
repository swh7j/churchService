package com.church.api.tenant;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.auth.AuthUser;
import com.church.api.auth.LoginGuard;
import com.church.api.auth.PasswordHasher;
import com.church.api.auth.Roles;
import com.church.api.common.Api;
import com.church.api.common.ApiException;
import com.church.api.tenant.ChurchRegistry.Church;
import com.church.api.tenant.PlatformAuth.PlatformUser;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 전체 관리자 페이지 (/platform): 교회 등록·중지, 전체 관리자 계정, 예배 PPT 공통 양식.
 * 교회 계정과는 별도 로그인. 각 교회의 교인·헌금 데이터는 여기서 볼 수 없습니다.
 *
 * 첫 전체 관리자 계정은 운영 교회(app.platform-church) 관리자로 로그인한 상태에서만 만들 수 있습니다.
 */
@RestController
public class PlatformController {

	private static final Logger log = LoggerFactory.getLogger(PlatformController.class);
	public static final MediaType PPTX = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.presentationml.presentation");
	private static final int MAX_PPT = 40_000_000;

	private final ChurchRegistry churches;
	private final PlatformAuth auth;
	private final LoginGuard guard;
	private final JdbcTemplate jdbc; // 교회 DB (교회별 계정 수 확인용)
	private final String platformChurch;

	public PlatformController(ChurchRegistry churches, PlatformAuth auth, LoginGuard guard, JdbcTemplate jdbc,
			@Value("${app.platform-church:}") String platform) {
		this.churches = churches;
		this.auth = auth;
		this.guard = guard;
		this.jdbc = jdbc;
		this.platformChurch = platform == null || platform.isBlank() ? churches.defaultCode() : platform.trim().toLowerCase();
	}

	/** 공통 양식 파일 위치 (data/common/worship-ppt.pptx) */
	public static Path commonPpt(ChurchRegistry churches) {
		return churches.dataDir().resolve("common").resolve("worship-ppt.pptx");
	}

	/** 운영 교회 관리자이면서 아직 전체 관리자 계정이 없을 때 → 교회 관리자 화면에 '전체 관리자 계정 만들기' 안내 */
	public boolean canBootstrap(AuthUser u) {
		return u != null && "admin".equals(u.role()) && platformChurch.equals(ChurchContext.get()) && auth.userCount() == 0;
	}

	private void log(PlatformUser u, String action, Object detail) {
		log.info("[전체 관리자] {} {} {}", u == null ? "-" : u.username(), action, detail == null ? "" : detail);
	}

	// ---------- 교회 선택 화면 (로그인 없이) ----------

	@GetMapping("/api/churches")
	public List<Map<String, Object>> publicList() {
		return churches.all().stream().filter(Church::active).map(c -> Api.map("code", c.code(), "name", c.name())).toList();
	}

	// ---------- 로그인 ----------

	@GetMapping("/api/platform/me")
	public Map<String, Object> me(HttpServletRequest req) {
		PlatformUser u = auth.current(req);
		boolean setup = auth.userCount() == 0;
		Church pc = churches.find(platformChurch);
		return Api.map("setupRequired", setup, "canSetup", setup && canBootstrap(Roles.current()),
				"platformChurch", Api.map("code", platformChurch, "name", pc == null ? platformChurch : pc.name()),
				"user", u == null ? null : u.toPublic());
	}

	/** 첫 전체 관리자 계정: 운영 교회 관리자로 로그인한 브라우저에서만 */
	@PostMapping("/api/platform/setup")
	public synchronized Map<String, Object> setup(@RequestBody Map<String, Object> body, HttpServletRequest req, HttpServletResponse res) {
		if (auth.userCount() > 0) throw ApiException.bad("이미 전체 관리자 계정이 있습니다. 로그인해 주세요.");
		if (!canBootstrap(Roles.current())) throw new ApiException(403, "운영 교회 관리자 화면에 먼저 로그인한 뒤 다시 시도해 주세요.");
		long id = addUser(body);
		auth.start(req, res, id);
		log(new PlatformUser(id, Api.str(body.get("username")), ""), "첫 계정 생성", Roles.current().username());
		return Map.of("ok", true);
	}

	@PostMapping("/api/platform/login")
	public Map<String, Object> login(@RequestBody Map<String, Object> body, HttpServletRequest req, HttpServletResponse res) {
		String username = Api.str(body.get("username")).trim();
		String[] keys = LoginGuard.keys("platform", username, req.getRemoteAddr());
		int locked = guard.lockedMinutes(keys);
		if (locked > 0) throw new ApiException(429, "로그인 실패가 반복되어 잠겼습니다. " + locked + "분 후 다시 시도해 주세요.");
		List<Map<String, Object>> rows = auth.jdbc().queryForList("SELECT * FROM platform_users WHERE username = ?", username);
		Map<String, Object> u = rows.isEmpty() ? null : rows.get(0);
		boolean ok = PasswordHasher.verify(Api.str(body.get("password")), u == null ? PasswordHasher.DUMMY : (String) u.get("password_hash"))
				&& u != null && Api.num(u.get("active")) == 1;
		if (!ok) {
			guard.failLogin(keys);
			throw ApiException.bad("아이디 또는 비밀번호가 맞지 않습니다.");
		}
		guard.success(keys[0], keys[2]);
		auth.start(req, res, Api.num(u.get("id")));
		log(new PlatformUser(Api.num(u.get("id")), username, ""), "로그인", null);
		return Map.of("ok", true);
	}

	@PostMapping("/api/platform/logout")
	public Map<String, Object> logout(HttpServletRequest req, HttpServletResponse res) {
		auth.end(req, res);
		return Map.of("ok", true);
	}

	@PostMapping("/api/platform/password")
	public Map<String, Object> password(@RequestBody Map<String, Object> body, HttpServletRequest req, HttpServletResponse res) {
		PlatformUser me = auth.require(req);
		String hash = auth.jdbc().queryForObject("SELECT password_hash FROM platform_users WHERE id = ?", String.class, me.id());
		if (!PasswordHasher.verify(Api.str(body.get("current")), hash)) throw ApiException.bad("현재 비밀번호가 맞지 않습니다.");
		PasswordHasher.validatePassword(body.get("next"));
		auth.jdbc().update("UPDATE platform_users SET password_hash = ? WHERE id = ?", PasswordHasher.hash((String) body.get("next")), me.id());
		auth.endAllFor(me.id());
		auth.start(req, res, me.id());
		log(me, "비밀번호 변경", null);
		return Map.of("ok", true);
	}

	// ---------- 전체 관리자 계정 ----------

	private long addUser(Map<String, Object> body) {
		String username = Api.str(body.get("username")).trim();
		String name = Api.str(body.get("name")).trim();
		PasswordHasher.validateUsername(username);
		if (name.isEmpty()) throw ApiException.bad("이름을 입력해 주세요.");
		PasswordHasher.validatePassword(body.get("password"));
		if (auth.jdbc().queryForObject("SELECT COUNT(*) FROM platform_users WHERE username = ?", Integer.class, username) > 0)
			throw ApiException.bad("이미 있는 아이디입니다.");
		auth.jdbc().update("INSERT INTO platform_users (username, name, password_hash) VALUES (?, ?, ?)",
				username, name, PasswordHasher.hash((String) body.get("password")));
		return auth.jdbc().queryForObject("SELECT id FROM platform_users WHERE username = ?", Long.class, username);
	}

	@GetMapping("/api/platform/users")
	public List<Map<String, Object>> users(HttpServletRequest req) {
		auth.require(req);
		return auth.jdbc().queryForList("SELECT id, username, name, active, created_at, last_login FROM platform_users ORDER BY id");
	}

	@PostMapping("/api/platform/users")
	public Map<String, Object> addUserApi(@RequestBody Map<String, Object> body, HttpServletRequest req) {
		PlatformUser me = auth.require(req);
		long id = addUser(body);
		log(me, "전체 관리자 추가", body.get("username"));
		return Map.of("id", id);
	}

	@PutMapping("/api/platform/users/{id}")
	public Map<String, Object> updateUser(@PathVariable long id, @RequestBody Map<String, Object> body, HttpServletRequest req) {
		PlatformUser me = auth.require(req);
		if (body.get("active") != null) {
			boolean on = Api.num(body.get("active")) == 1;
			if (!on && id == me.id()) throw ApiException.bad("내 계정은 중지할 수 없습니다.");
			auth.jdbc().update("UPDATE platform_users SET active = ? WHERE id = ?", on ? 1 : 0, id);
			if (!on) auth.endAllFor(id);
		}
		if (!Api.blank(body.get("password"))) {
			PasswordHasher.validatePassword(body.get("password"));
			auth.jdbc().update("UPDATE platform_users SET password_hash = ? WHERE id = ?", PasswordHasher.hash((String) body.get("password")), id);
			auth.endAllFor(id);
		}
		log(me, "전체 관리자 변경", id);
		return Map.of("ok", true);
	}

	// ---------- 교회 ----------

	@GetMapping("/api/platform/churches")
	public List<Map<String, Object>> list(HttpServletRequest req) {
		auth.require(req);
		return churches.all().stream().map(this::view).toList();
	}

	@PostMapping("/api/platform/churches")
	public Map<String, Object> create(@RequestBody Map<String, Object> body, HttpServletRequest req) {
		PlatformUser me = auth.require(req);
		Church c = churches.create(Api.str(body.get("code")), Api.str(body.get("name")));
		// 데이터 파일을 바로 만들어 둠 (테이블·기본 항목)
		ChurchContext.run(c.code(), () -> jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class));
		log(me, "교회 등록", c.code());
		return view(c);
	}

	@PutMapping("/api/platform/churches/{code}")
	public Map<String, Object> update(@PathVariable String code, @RequestBody Map<String, Object> body, HttpServletRequest req) {
		PlatformUser me = auth.require(req);
		Boolean active = body.get("active") == null ? null : Api.num(body.get("active")) == 1;
		if (Boolean.FALSE.equals(active) && code.equals(platformChurch)) throw ApiException.bad("운영 교회는 중지할 수 없습니다.");
		Church c = churches.update(code, body.get("name") == null ? null : Api.str(body.get("name")), active);
		log(me, "교회 정보 변경", c.code() + " " + c.name() + " active=" + c.active());
		return view(c);
	}

	/** 첫 관리자 등록 코드를 새로 만듦 (아직 관리자 계정이 없을 때만) */
	@PostMapping("/api/platform/churches/{code}/setup-code")
	public Map<String, Object> resetSetupCode(@PathVariable String code, HttpServletRequest req) {
		PlatformUser me = auth.require(req);
		Church c = churches.find(code);
		if (c == null) throw ApiException.notFound("없는 교회입니다.");
		if (c.legacy()) throw ApiException.bad("이 교회는 서버 설치 코드를 씁니다.");
		if (users(c) > 0) throw ApiException.bad("이미 관리자 계정이 있습니다. 비밀번호를 잊었다면 그 교회 관리자가 사용자 관리에서 바꿀 수 있습니다.");
		log(me, "등록 코드 재발급", c.code());
		return view(churches.resetSetupCode(c.code()));
	}

	private int users(Church c) {
		return ChurchContext.call(c.code(), () -> jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class));
	}

	private Map<String, Object> view(Church c) {
		int users = users(c);
		return Api.map("code", c.code(), "name", c.name(), "active", c.active(), "created_at", c.createdAt(),
				"users", users, "setup_code", users == 0 ? c.setupCode() : null, "platform", c.code().equals(platformChurch));
	}

	// ---------- 예배 PPT 공통 양식 ----------

	public static Map<String, Object> commonInfo(ChurchRegistry churches) {
		Path f = commonPpt(churches);
		try {
			return Files.isRegularFile(f) ? Api.map("size", Files.size(f), "updated_at", java.time.LocalDateTime.ofInstant(Files.getLastModifiedTime(f).toInstant(), java.time.ZoneId.systemDefault()).withNano(0).toString().replace('T', ' ')) : Map.of();
		} catch (IOException e) {
			return Map.of();
		}
	}

	public static ResponseEntity<byte[]> commonFile(ChurchRegistry churches) {
		Path f = commonPpt(churches);
		if (!Files.isRegularFile(f)) throw ApiException.notFound("공통 양식이 아직 없습니다.");
		try {
			return ResponseEntity.ok().contentType(PPTX).cacheControl(CacheControl.noCache().cachePrivate())
					.header("Content-Disposition", "attachment; filename*=UTF-8''%EC%98%88%EB%B0%B0PPT_%EA%B3%B5%ED%86%B5%EC%96%91%EC%8B%9D.pptx")
					.body(Files.readAllBytes(f));
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	@GetMapping("/api/platform/common-ppt")
	public Map<String, Object> commonPptInfo(HttpServletRequest req) {
		auth.require(req);
		return commonInfo(churches);
	}

	@GetMapping("/api/platform/common-ppt/file")
	public ResponseEntity<byte[]> commonPptFile(HttpServletRequest req) {
		auth.require(req);
		return commonFile(churches);
	}

	@PutMapping(value = "/api/platform/common-ppt", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
	public Map<String, Object> uploadCommonPpt(@RequestBody byte[] file, HttpServletRequest req) {
		PlatformUser me = auth.require(req);
		if (file.length > MAX_PPT) throw ApiException.bad("PPT 파일이 너무 큽니다.");
		if (file.length < 4 || file[0] != 'P' || file[1] != 'K') throw ApiException.bad("파워포인트에서 'PowerPoint 프레젠테이션(*.pptx)'으로 저장한 파일을 올려 주세요.");
		Path f = commonPpt(churches);
		try {
			Files.createDirectories(f.getParent());
			Path tmp = f.resolveSibling("worship-ppt.uploading");
			Files.write(tmp, file);
			Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
		log(me, "공통 양식 변경", file.length);
		return commonInfo(churches);
	}
}
