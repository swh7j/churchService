package com.church.api.church;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.common.Api;
import com.church.api.common.ApiException;

@RestController
@PreAuthorize("hasAuthority('AREA_church')")
public class AttendanceController {

	private final JdbcTemplate jdbc;
	private final AuditService audit;

	public AttendanceController(JdbcTemplate jdbc, AuditService audit) {
		this.jdbc = jdbc;
		this.audit = audit;
	}

	/** 날짜·예배별 출석 대상 교인과 출석 여부 */
	@GetMapping("/api/attendance")
	public List<Map<String, Object>> list(@RequestParam String date, @RequestParam("service_id") long serviceId) {
		return jdbc.queryForList("""
				SELECT m.id, m.name, m.position, m.district, m.status, CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS attended
				  FROM members m
				  LEFT JOIN attendance a ON a.member_id = m.id AND a.date = ? AND a.service_id = ?
				 WHERE m.status NOT IN ('전출','별세') OR a.id IS NOT NULL
				 ORDER BY m.district, m.name""", date, serviceId);
	}

	/** 출석 저장: 해당 날짜·예배의 출석을 통째로 교체 (트랜잭션) */
	@PutMapping("/api/attendance")
	@Transactional
	public Map<String, Object> save(@RequestBody Map<String, Object> body) {
		Object date = body.get("date");
		Object serviceId = body.get("service_id");
		if (Api.blank(date) || Api.blank(serviceId)) throw ApiException.bad("날짜와 예배를 선택해 주세요.");
		List<?> ids = body.get("member_ids") instanceof List<?> l ? l : List.of();
		jdbc.update("DELETE FROM attendance WHERE date = ? AND service_id = ?", date, serviceId);
		for (Object id : ids) jdbc.update("INSERT INTO attendance (date, service_id, member_id) VALUES (?, ?, ?)", date, serviceId, id);
		audit.log("출석 저장", "attendance", date + "/" + serviceId, ids.size() + "명");
		return Api.map("ok", true, "count", ids.size());
	}

	@GetMapping("/api/attendance-stats")
	public List<Map<String, Object>> stats() {
		return jdbc.queryForList("""
				SELECT a.date, s.name AS service, COUNT(*) AS cnt FROM attendance a JOIN services s ON s.id = a.service_id
				 GROUP BY a.date, a.service_id ORDER BY a.date DESC, s.sort LIMIT 40""");
	}
}
