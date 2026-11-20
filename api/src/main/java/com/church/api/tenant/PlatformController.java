package com.church.api.tenant;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.auth.AuthUser;
import com.church.api.auth.Roles;
import com.church.api.common.Api;
import com.church.api.common.ApiException;
import com.church.api.tenant.ChurchRegistry.Church;

/**
 * 교회 목록·등록. 전체 관리자 = 운영 교회(app.platform-church)의 '관리자' 계정.
 * 교회 데이터(교인·헌금 등)는 여기서 보지 않고, 각 교회의 첫 관리자는 등록 코드로 그 교회가 직접 만듭니다.
 */
@RestController
public class PlatformController {

	private final ChurchRegistry churches;
	private final JdbcTemplate jdbc;
	private final AuditService audit;
	private static String platformChurch;

	public PlatformController(ChurchRegistry churches, JdbcTemplate jdbc, AuditService audit, @Value("${app.platform-church:}") String platform) {
		this.churches = churches;
		this.jdbc = jdbc;
		this.audit = audit;
		setPlatformChurch(platform == null || platform.isBlank() ? churches.defaultCode() : platform.trim().toLowerCase());
	}

	private static void setPlatformChurch(String code) {
		platformChurch = code;
	}

	public static boolean isPlatformAdmin(AuthUser u, ChurchRegistry churches) {
		String code = ChurchContext.get();
		return u != null && "admin".equals(u.role()) && code != null && code.equals(platformChurch != null ? platformChurch : churches.defaultCode());
	}

	private void requirePlatform() {
		if (!isPlatformAdmin(Roles.current(), churches)) throw new ApiException(403, "전체 관리자만 사용할 수 있습니다.");
	}

	/** 교회 선택 화면용 (로그인 없이) */
	@GetMapping("/api/churches")
	public List<Map<String, Object>> publicList() {
		return churches.all().stream().filter(Church::active).map(c -> Api.map("code", c.code(), "name", c.name())).toList();
	}

	@GetMapping("/api/platform/churches")
	public List<Map<String, Object>> list() {
		requirePlatform();
		return churches.all().stream().map(this::view).toList();
	}

	@PostMapping("/api/platform/churches")
	public Map<String, Object> create(@RequestBody Map<String, Object> body) {
		requirePlatform();
		Church c = churches.create(Api.str(body.get("code")), Api.str(body.get("name")));
		// 데이터 파일을 바로 만들어 둠 (테이블·기본 항목)
		ChurchContext.run(c.code(), () -> jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class));
		audit.log("교회 등록", "churches", c.code(), Api.map("name", c.name()));
		return view(c);
	}

	@PutMapping("/api/platform/churches/{code}")
	public Map<String, Object> update(@PathVariable String code, @RequestBody Map<String, Object> body) {
		requirePlatform();
		Boolean active = body.get("active") == null ? null : Api.num(body.get("active")) == 1 || Boolean.TRUE.equals(body.get("active"));
		if (Boolean.FALSE.equals(active) && code.equals(platformChurch)) throw ApiException.bad("전체 관리자가 속한 교회는 중지할 수 없습니다.");
		Church c = churches.update(code, body.get("name") == null ? null : Api.str(body.get("name")), active);
		audit.log("교회 정보 변경", "churches", c.code(), Api.map("name", c.name(), "active", c.active()));
		return view(c);
	}

	/** 첫 관리자 등록 코드를 새로 만듦 (아직 관리자 계정이 없을 때만) */
	@PostMapping("/api/platform/churches/{code}/setup-code")
	public Map<String, Object> resetSetupCode(@PathVariable String code) {
		requirePlatform();
		Church c = churches.find(code);
		if (c == null) throw ApiException.notFound("없는 교회입니다.");
		if (c.legacy()) throw ApiException.bad("이 교회는 서버 설치 코드를 씁니다.");
		int users = ChurchContext.call(c.code(), () -> jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class));
		if (users > 0) throw ApiException.bad("이미 관리자 계정이 있습니다. 비밀번호를 잊었다면 그 교회 관리자가 사용자 관리에서 바꿀 수 있습니다.");
		audit.log("교회 등록 코드 재발급", "churches", c.code(), null);
		return view(churches.resetSetupCode(c.code()));
	}

	private Map<String, Object> view(Church c) {
		int users = ChurchContext.call(c.code(), () -> jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class));
		return Api.map("code", c.code(), "name", c.name(), "active", c.active(), "created_at", c.createdAt(),
				"users", users, "setup_code", users == 0 ? c.setupCode() : null, "platform", c.code().equals(platformChurch));
	}
}
