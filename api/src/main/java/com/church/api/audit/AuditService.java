package com.church.api.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.church.api.auth.AuthUser;
import com.church.api.auth.Roles;
import com.church.api.common.Json;

/** 활동 기록: 누가 언제 무엇을 등록·수정·삭제했는지 */
@Service
public class AuditService {

	private static final Logger log = LoggerFactory.getLogger(AuditService.class);
	private final JdbcTemplate jdbc;

	public AuditService(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public void log(String action, String target, Object targetId, Object detail) {
		log(Roles.current(), action, target, targetId, detail);
	}

	public void log(AuthUser user, String action, String target, Object targetId, Object detail) {
		try {
			String d = detail == null ? null : detail instanceof String s ? s : Json.of(detail);
			if (d != null && d.length() > 1000) d = d.substring(0, 1000);
			jdbc.update("INSERT INTO audit_log (user_id, user_name, action, target, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)",
					user == null ? null : user.id(), user == null ? null : user.name(), action, target,
					targetId == null ? null : String.valueOf(targetId), d);
		} catch (Exception e) {
			log.error("활동 기록 실패: {}", e.getMessage());
		}
	}
}
