package com.church.api.church;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.auth.LoginGuard;
import com.church.api.auth.PasswordHasher;
import com.church.api.auth.Roles;
import com.church.api.common.Api;
import com.church.api.common.ApiException;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 익명 기도제목 게시판.
 * - 성도: 로그인 없이 작성 (/api/public/prayers), 작성할 때 정한 비밀번호로 삭제
 * - 교역자·사역 담당·관리자: 비밀번호 없이 강제 삭제 (/api/prayers)
 * - 비밀 기도제목: 성도 화면에는 '비밀 기도제목'으로만 보이고, 내용·이름은 관리자만 봄
 *   (교회 소식 목록에도 비밀이 아닌 글만 나감 → PublicController)
 * 비밀번호는 scrypt 로 암호화해 저장하고, 목록에는 절대 내보내지 않습니다.
 */
@RestController
public class PrayerController {

	private static final String PUBLIC_COLS = "id, nickname, content, is_secret, created_at";
	/** 비밀 글은 이름·내용을 비워서 내보냄 */
	private static final String MASKED_COLS = "id, CASE WHEN is_secret = 1 THEN NULL ELSE nickname END AS nickname, "
			+ "CASE WHEN is_secret = 1 THEN NULL ELSE content END AS content, is_secret, created_at";
	private static final int MAX_CONTENT = 1000;
	private static final int MAX_NICKNAME = 20;
	/** 같은 접속(IP)에서 10분에 20개까지만 작성 (도배 방지, 교회 와이파이는 여럿이 같이 쓰므로 넉넉히) */
	private static final int POST_LIMIT = 20;
	private static final long POST_WINDOW_MS = 10 * 60_000L;

	private final JdbcTemplate jdbc;
	private final AuditService audit;
	private final LoginGuard guard;
	private final Map<String, Deque<Long>> recentPosts = new ConcurrentHashMap<>();

	public PrayerController(JdbcTemplate jdbc, AuditService audit, LoginGuard guard) {
		this.jdbc = jdbc;
		this.audit = audit;
		this.guard = guard;
	}

	// ---------- 성도 화면 (로그인 없음) ----------

	@GetMapping("/api/public/prayers")
	public List<Map<String, Object>> list() {
		return jdbc.queryForList("SELECT " + MASKED_COLS + " FROM prayers ORDER BY id DESC LIMIT 200");
	}

	@PostMapping("/api/public/prayers")
	public Map<String, Object> create(@RequestBody Map<String, Object> body, HttpServletRequest req) {
		String content = Api.str(body.get("content")).trim();
		String nickname = Api.str(body.get("nickname")).trim();
		String password = Api.str(body.get("password"));
		boolean secret = Boolean.TRUE.equals(body.get("secret"));
		if (content.isEmpty()) throw ApiException.bad("기도제목을 입력해 주세요.");
		if (content.length() > MAX_CONTENT) throw ApiException.bad("기도제목은 " + MAX_CONTENT + "자까지 쓸 수 있습니다.");
		if (nickname.length() > MAX_NICKNAME) throw ApiException.bad("이름(별명)은 " + MAX_NICKNAME + "자까지 쓸 수 있습니다.");
		if (password.length() < 4 || password.length() > 30) throw ApiException.bad("삭제용 비밀번호를 4~30자로 정해 주세요.");
		checkPostLimit(req.getRemoteAddr());

		jdbc.update("INSERT INTO prayers (nickname, content, password_hash, is_secret) VALUES (?, ?, ?, ?)",
				nickname.isEmpty() ? null : nickname, content, PasswordHasher.hash(password), secret ? 1 : 0);
		Long id = jdbc.queryForObject("SELECT last_insert_rowid()", Long.class);
		audit.log(null, "기도제목 등록 (성도 화면)", "prayers", id, Api.map("nickname", nickname, "content", content, "is_secret", secret));
		return Api.map("ok", true, "id", id);
	}

	@PostMapping("/api/public/prayers/{id}/delete")
	public Map<String, Object> deleteOwn(@PathVariable long id, @RequestBody Map<String, Object> body, HttpServletRequest req) {
		// 비밀번호 맞히기 방지: 같은 글을 같은 접속에서 5번 틀리면 5분 잠금
		// (교회 와이파이처럼 여러 사람이 한 접속을 같이 쓰므로 글마다 따로 셈)
		String key = "prayer-delete:" + id + ":" + req.getRemoteAddr();
		int locked = guard.lockedMinutes(key);
		if (locked > 0) throw new ApiException(429, "비밀번호를 여러 번 틀렸습니다. " + locked + "분 후 다시 시도해 주세요.");

		List<String> hash = jdbc.queryForList("SELECT password_hash FROM prayers WHERE id = ?", String.class, id);
		if (hash.isEmpty()) throw ApiException.notFound("이미 삭제된 기도제목입니다.");
		if (!PasswordHasher.verify(Api.str(body.get("password")), hash.get(0))) {
			guard.fail(key);
			throw ApiException.bad("비밀번호가 맞지 않습니다.");
		}
		guard.success(key);
		Map<String, Object> row = jdbc.queryForMap("SELECT " + PUBLIC_COLS + " FROM prayers WHERE id = ?", id);
		jdbc.update("DELETE FROM prayers WHERE id = ?", id);
		audit.log(null, "기도제목 삭제 (작성자 비밀번호)", "prayers", id, row);
		return Api.map("ok", true);
	}

	private void checkPostLimit(String ip) {
		long now = System.currentTimeMillis();
		Deque<Long> q = recentPosts.computeIfAbsent(ip, k -> new ArrayDeque<>());
		synchronized (q) {
			while (!q.isEmpty() && now - q.peekFirst() > POST_WINDOW_MS) q.pollFirst();
			if (q.size() >= POST_LIMIT) throw new ApiException(429, "잠시 후 다시 올려 주세요. (10분에 " + POST_LIMIT + "개까지)");
			q.addLast(now);
		}
	}

	// ---------- 관리자 화면 (교역자·사역 담당·관리자) ----------

	@GetMapping("/api/prayers")
	@PreAuthorize("hasAuthority('AREA_church')")
	public List<Map<String, Object>> adminList() {
		// 비밀 기도제목 내용은 관리자만, 교역자·사역 담당에게는 가려서 보냄 (삭제는 가능)
		boolean admin = Roles.has(Roles.current(), "admin");
		return jdbc.queryForList("SELECT " + (admin ? PUBLIC_COLS : MASKED_COLS) + " FROM prayers ORDER BY id DESC");
	}

	@DeleteMapping("/api/prayers/{id}")
	@PreAuthorize("hasAuthority('AREA_church')")
	public Map<String, Object> forceDelete(@PathVariable long id) {
		List<Map<String, Object>> row = jdbc.queryForList("SELECT " + PUBLIC_COLS + " FROM prayers WHERE id = ?", id);
		if (row.isEmpty()) throw ApiException.notFound("이미 삭제된 기도제목입니다.");
		jdbc.update("DELETE FROM prayers WHERE id = ?", id);
		audit.log("기도제목 강제 삭제", "prayers", id, row.get(0));
		return Api.map("ok", true);
	}
}
