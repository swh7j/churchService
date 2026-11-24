package com.church.api.church;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.auth.LoginGuard;
import com.church.api.auth.PasswordHasher;
import com.church.api.auth.Roles;
import com.church.api.common.Api;
import com.church.api.common.ApiException;
import com.church.api.tenant.ChurchContext;
import com.church.api.tenant.ChurchRegistry;
import com.church.api.tenant.ChurchRegistry.Church;
import com.church.api.tenant.PlatformAuth;
import com.church.api.tenant.PlatformAuth.PlatformUser;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 요청·제보 게시판 (악보 요청, 오류 제보 등).
 * - 성도: 로그인 없이 작성 (/api/public/requests), 같은 접속에서 10분에 20개까지 (도배 방지). 작성할 때 정한 비밀번호로 삭제·비밀글 보기
 * - 교회 관리자 (/api/requests): 처리 상태·답변 달기, 삭제
 * - 전체 관리자 (/api/platform/requests): 모든 교회의 요청을 한곳에서 보고 답변
 * - 비밀글: 성도 화면에는 제목·내용·답변을 가리고 '비밀 요청'으로만 보임 (작성자는 비밀번호로 볼 수 있음)
 * 비밀번호는 scrypt 로 암호화해 저장하고 목록에는 내보내지 않습니다. 접속 주소도 암호화한 값만 도배 방지에 씁니다.
 */
@RestController
public class SupportController {

	private static final Logger log = LoggerFactory.getLogger(SupportController.class);
	public static final List<String> CATEGORIES = List.of("악보 요청", "오류 제보", "기타 문의");
	public static final List<String> STATUSES = List.of("접수", "처리 중", "완료");
	/** 같은 접속(IP)에서 10분에 20개까지 (도배 방지, 교회 와이파이는 여럿이 같이 쓰므로 넉넉히 — 기도제목 게시판과 같음) */
	public static final int POST_LIMIT = 20;
	public static final int POST_WINDOW_MINUTES = 10;
	private static final int MAX_TITLE = 100, MAX_CONTENT = 2000, MAX_NICKNAME = 20, MAX_ANSWER = 2000;

	private static final String COLS = "id, category, title, content, nickname, is_secret, status, answer, answered_by, answered_at, created_at";
	/** 성도 화면용: 비밀글은 제목·내용·이름·답변을 가림 */
	private static final String MASKED_COLS = "id, category, CASE WHEN is_secret = 1 THEN NULL ELSE title END AS title, "
			+ "CASE WHEN is_secret = 1 THEN NULL ELSE content END AS content, CASE WHEN is_secret = 1 THEN NULL ELSE nickname END AS nickname, "
			+ "is_secret, status, CASE WHEN is_secret = 1 THEN NULL ELSE answer END AS answer, answered_by, answered_at, created_at";

	private final JdbcTemplate jdbc;
	private final AuditService audit;
	private final LoginGuard guard;
	private final ChurchRegistry churches;
	private final PlatformAuth platform;

	public SupportController(JdbcTemplate jdbc, AuditService audit, LoginGuard guard, ChurchRegistry churches, PlatformAuth platform) {
		this.jdbc = jdbc;
		this.audit = audit;
		this.guard = guard;
		this.churches = churches;
		this.platform = platform;
	}

	// ---------- 성도 화면 (로그인 없음) ----------

	@GetMapping("/api/public/requests")
	public List<Map<String, Object>> list() {
		return jdbc.queryForList("SELECT " + MASKED_COLS + " FROM support_requests ORDER BY id DESC LIMIT 300");
	}

	/** 오늘 이 접속에서 더 올릴 수 있는 개수 */
	@GetMapping("/api/public/requests/quota")
	public Map<String, Object> quota(HttpServletRequest req) {
		int used = usedRecently(ipHash(req));
		return Api.map("limit", POST_LIMIT, "minutes", POST_WINDOW_MINUTES, "used", used, "left", Math.max(0, POST_LIMIT - used));
	}

	@PostMapping("/api/public/requests")
	public synchronized Map<String, Object> create(@RequestBody Map<String, Object> body, HttpServletRequest req) {
		String category = Api.str(body.get("category")).trim();
		String title = Api.str(body.get("title")).trim();
		String content = Api.str(body.get("content")).trim();
		String nickname = Api.str(body.get("nickname")).trim();
		String password = Api.str(body.get("password"));
		boolean secret = Boolean.TRUE.equals(body.get("secret"));
		if (!CATEGORIES.contains(category)) throw ApiException.bad("종류를 골라 주세요.");
		if (title.isEmpty()) throw ApiException.bad("제목을 입력해 주세요.");
		if (title.length() > MAX_TITLE) throw ApiException.bad("제목은 " + MAX_TITLE + "자까지 쓸 수 있습니다.");
		if (content.isEmpty()) throw ApiException.bad("내용을 입력해 주세요.");
		if (content.length() > MAX_CONTENT) throw ApiException.bad("내용은 " + MAX_CONTENT + "자까지 쓸 수 있습니다.");
		if (nickname.length() > MAX_NICKNAME) throw ApiException.bad("이름(별명)은 " + MAX_NICKNAME + "자까지 쓸 수 있습니다.");
		if (password.length() < 4 || password.length() > 30) throw ApiException.bad("비밀번호를 4~30자로 정해 주세요.");

		String ip = ipHash(req);
		if (usedRecently(ip) >= POST_LIMIT) throw new ApiException(429, "잠시 후 다시 올려 주세요. (" + POST_WINDOW_MINUTES + "분에 " + POST_LIMIT + "개까지)");
		jdbc.update("INSERT INTO support_post_log (ip_hash) VALUES (?)", ip);
		jdbc.update("DELETE FROM support_post_log WHERE created_at < date('now','localtime','-2 days')");

		jdbc.update("INSERT INTO support_requests (category, title, content, nickname, password_hash, is_secret) VALUES (?, ?, ?, ?, ?, ?)",
				category, title, content, nickname.isEmpty() ? null : nickname, PasswordHasher.hash(password), secret ? 1 : 0);
		Long id = jdbc.queryForObject("SELECT last_insert_rowid()", Long.class);
		audit.log(null, "요청 등록 (성도 화면)", "support_requests", id, Api.map("category", category, "title", title, "is_secret", secret));
		return Api.map("ok", true, "id", id);
	}

	/** 작성자가 비밀번호로 자기 글 보기 (비밀글의 답변 확인용) */
	@PostMapping("/api/public/requests/{id}/view")
	public Map<String, Object> viewOwn(@PathVariable long id, @RequestBody Map<String, Object> body, HttpServletRequest req) {
		checkPassword(id, Api.str(body.get("password")), req);
		return jdbc.queryForMap("SELECT " + COLS + " FROM support_requests WHERE id = ?", id);
	}

	@PostMapping("/api/public/requests/{id}/delete")
	public Map<String, Object> deleteOwn(@PathVariable long id, @RequestBody Map<String, Object> body, HttpServletRequest req) {
		checkPassword(id, Api.str(body.get("password")), req);
		Map<String, Object> row = jdbc.queryForMap("SELECT " + COLS + " FROM support_requests WHERE id = ?", id);
		jdbc.update("DELETE FROM support_requests WHERE id = ?", id);
		audit.log(null, "요청 삭제 (작성자 비밀번호)", "support_requests", id, row);
		return Api.map("ok", true);
	}

	/** 비밀번호 맞히기 방지: 같은 글을 같은 접속에서 5번 틀리면 5분 잠금 */
	private void checkPassword(long id, String password, HttpServletRequest req) {
		String key = "support:" + ChurchContext.get() + ":" + id + ":" + req.getRemoteAddr();
		int locked = guard.lockedMinutes(key);
		if (locked > 0) throw new ApiException(429, "비밀번호를 여러 번 틀렸습니다. " + locked + "분 후 다시 시도해 주세요.");
		List<String> hash = jdbc.queryForList("SELECT password_hash FROM support_requests WHERE id = ?", String.class, id);
		if (hash.isEmpty()) throw ApiException.notFound("이미 삭제된 글입니다.");
		if (!PasswordHasher.verify(password, hash.get(0))) {
			guard.fail(key);
			throw ApiException.bad("비밀번호가 맞지 않습니다.");
		}
		guard.success(key);
	}

	/** 최근 10분 동안 이 접속에서 올린 개수 */
	private int usedRecently(String ipHash) {
		return jdbc.queryForObject("SELECT COUNT(*) FROM support_post_log WHERE ip_hash = ? AND created_at >= datetime('now','localtime','-" + POST_WINDOW_MINUTES + " minutes')", Integer.class, ipHash);
	}

	/** 접속 주소는 저장하지 않고 교회별로 섞은 암호화 값만 */
	private static String ipHash(HttpServletRequest req) {
		try {
			byte[] d = MessageDigest.getInstance("SHA-256").digest(("support:" + ChurchContext.get() + ":" + req.getRemoteAddr()).getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(d, 0, 16);
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	// ---------- 교회 관리자 ----------

	@GetMapping("/api/requests")
	@PreAuthorize("hasAuthority('AREA_church')")
	public List<Map<String, Object>> adminList() {
		// 비밀글 내용은 관리자만, 교역자·사역 담당에게는 가려서 보냄 (상태·답변은 가능)
		boolean admin = Roles.has(Roles.current(), "admin");
		return jdbc.queryForList("SELECT " + (admin ? COLS : MASKED_COLS) + " FROM support_requests ORDER BY id DESC");
	}

	@PutMapping("/api/requests/{id}")
	@PreAuthorize("hasAuthority('AREA_church')")
	public Map<String, Object> answer(@PathVariable long id, @RequestBody Map<String, Object> body) {
		Map<String, Object> r = update(id, body, "교회 관리자");
		audit.log("요청 답변·상태 변경", "support_requests", id, Api.map("status", r.get("status"), "answer", r.get("answer")));
		return r;
	}

	@DeleteMapping("/api/requests/{id}")
	@PreAuthorize("hasAuthority('AREA_church')")
	public Map<String, Object> forceDelete(@PathVariable long id) {
		List<Map<String, Object>> row = jdbc.queryForList("SELECT " + COLS + " FROM support_requests WHERE id = ?", id);
		if (row.isEmpty()) throw ApiException.notFound("이미 삭제된 글입니다.");
		jdbc.update("DELETE FROM support_requests WHERE id = ?", id);
		audit.log("요청 강제 삭제", "support_requests", id, row.get(0));
		return Api.map("ok", true);
	}

	/** 상태·답변 저장 (지금 교회 DB). 답변을 비우면 답변을 지움 */
	private Map<String, Object> update(long id, Map<String, Object> body, String by) {
		if (jdbc.queryForObject("SELECT COUNT(*) FROM support_requests WHERE id = ?", Integer.class, id) == 0) throw ApiException.notFound("없는 글입니다.");
		String status = Api.str(body.get("status")).trim();
		if (!STATUSES.contains(status)) throw ApiException.bad("처리 상태가 올바르지 않습니다.");
		String answer = Api.str(body.get("answer")).trim();
		if (answer.length() > MAX_ANSWER) throw ApiException.bad("답변은 " + MAX_ANSWER + "자까지 쓸 수 있습니다.");
		if (answer.isEmpty()) {
			jdbc.update("UPDATE support_requests SET status = ?, answer = NULL, answered_by = NULL, answered_at = NULL WHERE id = ?", status, id);
		} else {
			// 답변 내용이 그대로면 답변한 사람·때는 바꾸지 않음 (상태만 바꿀 때)
			jdbc.update("UPDATE support_requests SET status = ?, "
					+ "answered_by = CASE WHEN answer IS ? THEN answered_by ELSE ? END, "
					+ "answered_at = CASE WHEN answer IS ? THEN answered_at ELSE datetime('now','localtime') END, "
					+ "answer = ? WHERE id = ?", status, answer, by, answer, answer, id);
		}
		return jdbc.queryForMap("SELECT " + COLS + " FROM support_requests WHERE id = ?", id);
	}

	// ---------- 전체 관리자 (모든 교회) ----------

	@GetMapping("/api/platform/requests")
	public List<Map<String, Object>> platformList(HttpServletRequest req) {
		platform.require(req);
		List<Map<String, Object>> out = new ArrayList<>();
		for (Church c : churches.all()) {
			if (!c.active()) continue;
			ChurchContext.run(c.code(), () -> {
				for (Map<String, Object> r : jdbc.queryForList("SELECT " + COLS + " FROM support_requests ORDER BY id DESC LIMIT 300")) {
					Map<String, Object> m = new LinkedHashMap<>(r);
					m.put("church", c.code());
					m.put("church_name", c.name());
					out.add(m);
				}
			});
		}
		out.sort(Comparator.comparing((Map<String, Object> m) -> String.valueOf(m.get("created_at"))).reversed());
		return out;
	}

	@PutMapping("/api/platform/requests/{church}/{id}")
	public Map<String, Object> platformAnswer(@PathVariable String church, @PathVariable long id, @RequestBody Map<String, Object> body, HttpServletRequest req) {
		PlatformUser me = platform.require(req);
		Church c = churches.find(church);
		if (c == null) throw ApiException.notFound("없는 교회입니다.");
		Map<String, Object> r = ChurchContext.call(c.code(), () -> update(id, body, "전체 관리자"));
		log.info("[전체 관리자] {} 요청 답변 {} #{} {}", me.username(), c.code(), id, r.get("status"));
		Map<String, Object> m = new LinkedHashMap<>(r);
		m.put("church", c.code());
		m.put("church_name", c.name());
		return m;
	}

	@DeleteMapping("/api/platform/requests/{church}/{id}")
	public Map<String, Object> platformDelete(@PathVariable String church, @PathVariable long id, HttpServletRequest req) {
		PlatformUser me = platform.require(req);
		Church c = churches.find(church);
		if (c == null) throw ApiException.notFound("없는 교회입니다.");
		int n = ChurchContext.call(c.code(), () -> jdbc.update("DELETE FROM support_requests WHERE id = ?", id));
		if (n == 0) throw ApiException.notFound("이미 삭제된 글입니다.");
		log.info("[전체 관리자] {} 요청 삭제 {} #{}", me.username(), c.code(), id);
		return Api.map("ok", true);
	}
}
