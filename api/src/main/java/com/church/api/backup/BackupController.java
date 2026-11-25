package com.church.api.backup;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.springframework.core.io.FileSystemResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.common.Api;

/** 백업·복원, 활동 기록 조회 (관리자만) */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasAuthority('AREA_admin')")
public class BackupController {

	private final BackupService backups;
	private final AuditService audit;
	private final JdbcTemplate jdbc;

	public BackupController(BackupService backups, AuditService audit, JdbcTemplate jdbc) {
		this.backups = backups;
		this.audit = audit;
		this.jdbc = jdbc;
	}

	@GetMapping("/backups")
	public Map<String, Object> list() {
		return Api.map("dir", backups.dir().toString(), "list", backups.list(), "reminder", backups.reminder());
	}

	@PostMapping("/backups")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> create() {
		Map<String, Object> b = backups.create("manual");
		audit.log("백업", "backups", b.get("name"), null);
		return b;
	}

	@GetMapping("/backups/{name}/download")
	public ResponseEntity<FileSystemResource> download(@PathVariable String name) {
		Path p = backups.path(name);
		audit.log("백업 다운로드", "backups", name, null);
		backups.markDownloaded(); // 백업 알림: 마지막으로 내려받은 날
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(name).build().toString())
				.contentType(MediaType.APPLICATION_OCTET_STREAM)
				.body(new FileSystemResource(p));
	}

	@PostMapping("/backups/{name}/restore")
	public Map<String, Object> restore(@PathVariable String name) {
		String safety = backups.restore(name);
		// 복원 후 DB가 바뀌었으므로, 복원된 DB에 기록
		audit.log("복원", "backups", name, "복원 직전 상태는 " + safety + " 에 보관");
		return Api.map("ok", true, "safety", safety);
	}

	@DeleteMapping("/backups/{name}")
	public Map<String, Object> delete(@PathVariable String name) {
		backups.delete(name);
		audit.log("백업 삭제", "backups", name, null);
		return Map.of("ok", true);
	}

	/** 최근 기록 목록 (엑셀 내보내기용, 최대 2000건) */
	@GetMapping("/audit")
	public List<Map<String, Object>> auditLog(@RequestParam(required = false) String q, @RequestParam(required = false) Integer limit) {
		int n = Math.min(limit == null || limit <= 0 ? 300 : limit, 2000);
		Object[] w = auditWhere(q);
		return jdbc.queryForList("SELECT * FROM audit_log" + w[0] + " ORDER BY id DESC LIMIT ?", append((Object[]) w[1], n));
	}

	/** 화면용: 페이지로 나눠서 (page 는 1부터, size 는 10~100) */
	@GetMapping("/audit/page")
	public Map<String, Object> auditPage(@RequestParam(required = false) String q, @RequestParam(defaultValue = "1") int page,
			@RequestParam(defaultValue = "30") int size) {
		int sz = Math.max(10, Math.min(size, 100));
		Object[] w = auditWhere(q);
		Object[] args = (Object[]) w[1];
		Integer total = jdbc.queryForObject("SELECT COUNT(*) FROM audit_log" + w[0], Integer.class, args);
		int pages = Math.max(1, (total + sz - 1) / sz);
		int p = Math.max(1, Math.min(page, pages));
		List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM audit_log" + w[0] + " ORDER BY id DESC LIMIT ? OFFSET ?",
				append(append(args, sz), (p - 1) * sz));
		return Api.map("rows", rows, "total", total, "page", p, "size", sz, "pages", pages);
	}

	/** 검색 조건: [WHERE 절, 인자] */
	private static Object[] auditWhere(String q) {
		if (q == null || q.isBlank()) return new Object[] { "", new Object[0] };
		String like = "%" + q.trim() + "%";
		return new Object[] { " WHERE user_name LIKE ? OR action LIKE ? OR target LIKE ? OR detail LIKE ?", new Object[] { like, like, like, like } };
	}

	private static Object[] append(Object[] a, Object v) {
		Object[] out = java.util.Arrays.copyOf(a, a.length + 1);
		out[a.length] = v;
		return out;
	}
}
