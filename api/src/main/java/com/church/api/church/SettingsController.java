package com.church.api.church;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;

@RestController
@RequestMapping("/api/settings")
public class SettingsController {

	private final JdbcTemplate jdbc;
	private final AuditService audit;

	public SettingsController(JdbcTemplate jdbc, AuditService audit) {
		this.jdbc = jdbc;
		this.audit = audit;
	}

	@GetMapping
	public Map<String, Object> get() {
		Map<String, Object> m = new LinkedHashMap<>();
		jdbc.queryForList("SELECT key, value FROM settings").forEach(r -> m.put((String) r.get("key"), r.get("value")));
		return m;
	}

	@PutMapping
	@PreAuthorize("hasAuthority('AREA_admin')")
	public Map<String, Object> put(@RequestBody Map<String, Object> body) {
		body.forEach((k, v) -> jdbc.update(
				"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
				k, v == null ? "" : String.valueOf(v)));
		audit.log("설정 변경", "settings", null, body);
		return Map.of("ok", true);
	}
}
