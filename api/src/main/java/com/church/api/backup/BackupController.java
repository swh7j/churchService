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
		return Api.map("dir", backups.dir().toString(), "list", backups.list());
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

	@GetMapping("/audit")
	public List<Map<String, Object>> auditLog(@RequestParam(required = false) String q, @RequestParam(required = false) Integer limit) {
		int n = Math.min(limit == null || limit <= 0 ? 300 : limit, 2000);
		if (q == null || q.isEmpty()) return jdbc.queryForList("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", n);
		String like = "%" + q + "%";
		return jdbc.queryForList(
				"SELECT * FROM audit_log WHERE user_name LIKE ? OR action LIKE ? OR target LIKE ? OR detail LIKE ? ORDER BY id DESC LIMIT ?",
				like, like, like, like, n);
	}
}
