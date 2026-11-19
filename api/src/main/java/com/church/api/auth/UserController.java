package com.church.api.auth;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.common.Api;
import com.church.api.common.ApiException;

/** 사용자 관리 (관리자만) */
@RestController
@RequestMapping("/api/users")
@PreAuthorize("hasAuthority('AREA_admin')")
public class UserController {

	private final JdbcTemplate jdbc;
	private final SessionService sessions;
	private final AuditService audit;

	public UserController(JdbcTemplate jdbc, SessionService sessions, AuditService audit) {
		this.jdbc = jdbc;
		this.sessions = sessions;
		this.audit = audit;
	}

	private int activeAdminsExcept(long id) {
		return jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1 AND id != ?", Integer.class, id);
	}

	private Map<String, Object> find(long id) {
		List<Map<String, Object>> r = jdbc.queryForList("SELECT * FROM users WHERE id = ?", id);
		if (r.isEmpty()) throw ApiException.notFound("사용자를 찾을 수 없습니다.");
		return r.get(0);
	}

	@GetMapping
	public List<Map<String, Object>> list() {
		return jdbc.queryForList("SELECT id, username, name, role, active, created_at, last_login FROM users ORDER BY active DESC, name");
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> create(@RequestBody Map<String, Object> body) {
		String username = Api.str(body.get("username")).trim();
		String name = Api.str(body.get("name")).trim();
		String role = Api.str(body.get("role"));
		PasswordHasher.validateUsername(username);
		if (name.isEmpty()) throw ApiException.bad("이름을 입력해 주세요.");
		if (!Roles.valid(role)) throw ApiException.bad("역할을 선택해 주세요.");
		PasswordHasher.validatePassword(body.get("password"));
		jdbc.update("INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)",
				username, name, PasswordHasher.hash((String) body.get("password")), role);
		long id = jdbc.queryForObject("SELECT id FROM users WHERE username = ?", Long.class, username);
		audit.log("계정 생성", "users", id, Api.map("username", username, "name", name, "role", role));
		return Map.of("id", id);
	}

	@PutMapping("/{id}")
	public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> body) {
		Map<String, Object> u = find(id);
		AuthUser me = Roles.current();
		String name = Api.blank(body.get("name")) ? (String) u.get("name") : Api.str(body.get("name")).trim();
		String role = body.get("role") == null ? (String) u.get("role") : Api.str(body.get("role"));
		int active = body.get("active") == null ? (int) Api.num(u.get("active"))
				: (body.get("active") instanceof Boolean b ? (b ? 1 : 0) : (Api.num(body.get("active")) != 0 ? 1 : 0));
		Object password = body.get("password");
		boolean resetPw = password != null && !Api.blank(password);

		if (!Roles.valid(role)) throw ApiException.bad("역할을 선택해 주세요.");
		if (id == me.id() && (active == 0 || !"admin".equals(role))) throw ApiException.bad("자기 자신의 관리자 권한은 해제할 수 없습니다.");
		if ("admin".equals(u.get("role")) && (!"admin".equals(role) || active == 0) && activeAdminsExcept(id) == 0)
			throw ApiException.bad("관리자는 최소 한 명 있어야 합니다.");
		if (resetPw) PasswordHasher.validatePassword(password);

		jdbc.update("UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?", name, role, active, id);
		if (resetPw) jdbc.update("UPDATE users SET password_hash = ? WHERE id = ?", PasswordHasher.hash((String) password), id);
		if (resetPw || active == 0 || !role.equals(u.get("role"))) sessions.endAllFor(id); // 다시 로그인하게
		audit.log("계정 수정", "users", id, Api.map("name", name, "role", role, "active", active, "passwordReset", resetPw));
		return Map.of("ok", true);
	}

	@DeleteMapping("/{id}")
	public Map<String, Object> delete(@PathVariable long id) {
		Map<String, Object> u = find(id);
		if (id == Roles.current().id()) throw ApiException.bad("자기 자신은 삭제할 수 없습니다.");
		if ("admin".equals(u.get("role")) && activeAdminsExcept(id) == 0) throw ApiException.bad("관리자는 최소 한 명 있어야 합니다.");
		jdbc.update("DELETE FROM users WHERE id = ?", id);
		audit.log("계정 삭제", "users", id, Api.map("username", u.get("username"), "name", u.get("name")));
		return Map.of("ok", true);
	}
}
