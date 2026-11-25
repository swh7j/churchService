package com.church.api.audit;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.common.Api;

/** 활동 기록 조회 (관리자만). 기록 남기기는 AuditService */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasAuthority('AREA_admin')")
public class AuditController {

	private final JdbcTemplate jdbc;

	public AuditController(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
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
		Object[] out = Arrays.copyOf(a, a.length + 1);
		out[a.length] = v;
		return out;
	}
}
