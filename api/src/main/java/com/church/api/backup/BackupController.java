package com.church.api.backup;

import java.nio.file.Path;
import java.util.Map;

import org.springframework.core.io.FileSystemResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.common.Api;

/** 백업·복원 (관리자만). 활동 기록 조회는 audit.AuditController */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasAuthority('AREA_admin')")
public class BackupController {

	private final BackupService backups;
	private final AuditService audit;

	public BackupController(BackupService backups, AuditService audit) {
		this.backups = backups;
		this.audit = audit;
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
}
