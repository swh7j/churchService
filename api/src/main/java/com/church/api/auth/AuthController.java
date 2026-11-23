package com.church.api.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.common.Api;
import com.church.api.common.ApiException;
import com.church.api.tenant.ChurchContext;
import com.church.api.tenant.ChurchRegistry;
import com.church.api.tenant.ChurchRegistry.Church;
import com.church.api.tenant.PlatformController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

	private final JdbcTemplate jdbc;
	private final SessionService sessions;
	private final LoginGuard guard;
	private final AuditService audit;
	private final ChurchRegistry churches;
	private final PlatformController platform;

	/** 서버 설치 시 정한 설치 코드. 있으면 최초 관리자 생성에 이 코드가 필요 (설치 직후 남이 먼저 가입하는 것 방지) */
	private final String setupToken;

	public AuthController(JdbcTemplate jdbc, SessionService sessions, LoginGuard guard, AuditService audit, ChurchRegistry churches, PlatformController platform,
			@Value("${app.setup-token:}") String setupToken) {
		this.churches = churches;
		this.platform = platform;
		this.jdbc = jdbc;
		this.sessions = sessions;
		this.guard = guard;
		this.audit = audit;
		this.setupToken = setupToken == null ? "" : setupToken.trim();
	}

	private int userCount() {
		return jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class);
	}

	/** 첫 관리자 계정 코드: 처음부터 쓰던 교회는 서버 설치 코드, 새 교회는 교회를 만들 때 정해진 코드 */
	private String setupCode() {
		Church c = churches.current();
		return c.legacy() ? setupToken : c.setupCode() == null ? "" : c.setupCode();
	}

	/** 로그인 실패 횟수는 교회별로 셈 */
	private static String guardKey(String key) {
		return ChurchContext.get() + ":" + key;
	}

	private String churchName() {
		List<String> v = jdbc.queryForList("SELECT value FROM settings WHERE key = 'church_name'", String.class);
		return v.isEmpty() || v.get(0) == null ? "" : v.get(0);
	}

	/** 로그인 상태 확인 (로그인 없이 호출 가능) */
	@GetMapping("/me")
	public Map<String, Object> me(HttpServletRequest req) {
		AuthUser u = sessions.current(req);
		boolean setupRequired = userCount() == 0;
		Church c = churches.current();
		return Api.map("setupRequired", setupRequired, "setupTokenRequired", setupRequired && !setupCode().isEmpty(),
				"churchName", churchName(), "church", Api.map("code", c.code(), "name", c.name()),
				// 운영 교회 관리자 + 전체 관리자 계정이 아직 없음 → 전체 관리자 페이지 만들기 안내
				"platformSetup", platform.canBootstrap(u),
				"user", u == null ? null : u.toPublic());
	}

	/** 최초 실행: 사용자가 한 명도 없을 때만 관리자 계정을 만들 수 있음 */
	@PostMapping("/setup")
	public synchronized Map<String, Object> setup(@RequestBody Map<String, Object> body, HttpServletRequest req, HttpServletResponse res) {
		if (userCount() > 0) throw ApiException.bad("이미 관리자 계정이 있습니다. 로그인해 주세요.");
		String code = setupCode();
		if (!code.isEmpty()) {
			String ipKey = "ip:" + req.getRemoteAddr();
			int locked = guard.lockedMinutes(guardKey("__setup__"), ipKey);
			if (locked > 0) throw new ApiException(429, "설치 코드 입력 실패가 반복되어 잠겼습니다. " + locked + "분 후 다시 시도해 주세요.");
			byte[] given = Api.str(body.get("setupToken")).trim().getBytes(StandardCharsets.UTF_8);
			if (!MessageDigest.isEqual(given, code.getBytes(StandardCharsets.UTF_8))) {
				guard.fail(guardKey("__setup__"));
				guard.fail(ipKey, LoginGuard.IP);
				throw ApiException.bad("설치 코드가 맞지 않습니다. 교회를 등록할 때 받은 8자리 코드를 입력해 주세요.");
			}
		}
		String username = Api.str(body.get("username")).trim();
		String name = Api.str(body.get("name")).trim();
		PasswordHasher.validateUsername(username);
		if (name.isEmpty()) throw ApiException.bad("이름을 입력해 주세요.");
		PasswordHasher.validatePassword(body.get("password"));
		jdbc.update("INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, 'admin')",
				username, name, PasswordHasher.hash((String) body.get("password")));
		long id = jdbc.queryForObject("SELECT id FROM users WHERE username = ?", Long.class, username);
		sessions.start(req, res, id);
		audit.log(new AuthUser(id, username, name, "admin"), "계정 생성", "users", id, "최초 관리자");
		churches.clearSetupCode(ChurchContext.get());
		return Map.of("ok", true);
	}

	@PostMapping("/login")
	public Map<String, Object> login(@RequestBody Map<String, Object> body, HttpServletRequest req, HttpServletResponse res) {
		String username = Api.str(body.get("username")).trim();
		String password = Api.str(body.get("password"));
		String[] keys = LoginGuard.keys(ChurchContext.get(), username, req.getRemoteAddr());
		int locked = guard.lockedMinutes(keys);
		if (locked > 0) throw new ApiException(429, "로그인 실패가 반복되어 잠겼습니다. " + locked + "분 후 다시 시도해 주세요.");

		List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM users WHERE username = ?", username);
		Map<String, Object> u = rows.isEmpty() ? null : rows.get(0);
		// 아이디가 없어도 같은 시간이 걸리도록 항상 비밀번호 비교를 수행
		boolean ok = PasswordHasher.verify(password, u == null ? PasswordHasher.DUMMY : (String) u.get("password_hash"))
				&& u != null && Api.num(u.get("active")) == 1;
		if (!ok) {
			guard.failLogin(keys);
			throw ApiException.bad("아이디 또는 비밀번호가 맞지 않습니다.");
		}
		guard.success(keys[0], keys[2]);
		long id = Api.num(u.get("id"));
		sessions.start(req, res, id);
		audit.log(new AuthUser(id, username, (String) u.get("name"), (String) u.get("role")), "로그인", "auth", null, null);
		return Map.of("ok", true);
	}

	@PostMapping("/logout")
	public Map<String, Object> logout(HttpServletRequest req, HttpServletResponse res) {
		AuthUser u = sessions.current(req);
		if (u != null) audit.log(u, "로그아웃", "auth", null, null);
		sessions.end(req, res);
		return Map.of("ok", true);
	}

	/** 비밀번호 변경 (로그인 필요) */
	@PostMapping("/password")
	public Map<String, Object> changePassword(@RequestBody Map<String, Object> body, HttpServletRequest req, HttpServletResponse res) {
		AuthUser me = Roles.current();
		String hash = jdbc.queryForObject("SELECT password_hash FROM users WHERE id = ?", String.class, me.id());
		if (!PasswordHasher.verify(Api.str(body.get("current")), hash)) throw ApiException.bad("현재 비밀번호가 맞지 않습니다.");
		PasswordHasher.validatePassword(body.get("next"));
		jdbc.update("UPDATE users SET password_hash = ? WHERE id = ?", PasswordHasher.hash((String) body.get("next")), me.id());
		sessions.endAllFor(me.id()); // 다른 기기 로그인도 모두 해제
		sessions.start(req, res, me.id());
		audit.log("비밀번호 변경", "users", me.id(), null);
		return Map.of("ok", true);
	}
}
