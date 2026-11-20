package com.church.api.church;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.common.ApiException;

/**
 * 주보 기본 정보 (표지 사진, 교회 비전, 예배 시간표 등 매주 바뀌지 않는 내용).
 * settings 테이블의 bulletin_template 키에 JSON 으로 저장합니다.
 * 주보를 만드는 교역자·사역 담당도 고칠 수 있도록 일반 설정과 따로 둡니다.
 */
@RestController
@RequestMapping("/api/bulletin-template")
@PreAuthorize("hasAuthority('AREA_church')")
public class BulletinTemplateController {

	private static final String KEY = "bulletin_template";
	/** 표지 사진(화면에서 줄여서 올림) 포함 최대 크기 */
	private static final int MAX_CHARS = 3_000_000;

	private final JdbcTemplate jdbc;
	private final AuditService audit;

	public BulletinTemplateController(JdbcTemplate jdbc, AuditService audit) {
		this.jdbc = jdbc;
		this.audit = audit;
	}

	@GetMapping
	public Map<String, Object> get() {
		List<String> r = jdbc.queryForList("SELECT value FROM settings WHERE key = ?", String.class, KEY);
		return Map.of("template", r.isEmpty() || r.get(0) == null ? "" : r.get(0));
	}

	@PutMapping
	public Map<String, Object> put(@RequestBody Map<String, Object> body) {
		Object t = body.get("template");
		if (!(t instanceof String s)) throw ApiException.bad("주보 기본 정보가 없습니다.");
		if (s.length() > MAX_CHARS) throw ApiException.bad("표지 사진이 너무 큽니다. 더 작은 사진을 골라 주세요.");
		jdbc.update("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", KEY, s);
		// 활동 기록에는 사진 데이터를 빼고 남김
		audit.log("주보 기본 정보 변경", "settings", null, Map.of("size", s.length()));
		return Map.of("ok", true);
	}
}
