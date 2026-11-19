package com.church.api.church;

import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.auth.Roles;
import com.church.api.common.Api;

/** 대시보드: 재정 권한이 없으면 finance 는 null */
@RestController
public class DashboardController {

	private final JdbcTemplate jdbc;
	private final BirthdayService birthdays;

	public DashboardController(JdbcTemplate jdbc, BirthdayService birthdays) {
		this.jdbc = jdbc;
		this.birthdays = birthdays;
	}

	@GetMapping("/api/dashboard")
	public Map<String, Object> dashboard() {
		String t = Api.today();
		String ms = t.substring(0, 7) + "-01";
		String me = Api.monthEnd(t);

		Map<String, Object> members = jdbc.queryForMap("""
				SELECT COALESCE(SUM(status IN ('재적','새가족')),0) AS active, COUNT(*) AS total,
				       COALESCE(SUM(registered_date BETWEEN ? AND ?),0) AS newThisMonth FROM members""", ms, me);

		Map<String, Object> finance = null;
		if (Roles.has(Roles.current(), "finance")) {
			long offering = Api.num(jdbc.queryForObject("SELECT COALESCE(SUM(amount),0) FROM offerings WHERE date BETWEEN ? AND ?", Long.class, ms, me));
			Map<String, Object> tx = jdbc.queryForMap("""
					SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount END),0) AS inc,
					       COALESCE(SUM(CASE WHEN kind='expense' THEN amount END),0) AS exp
					  FROM transactions WHERE date BETWEEN ? AND ?""", ms, me);
			long balance = Api.num(jdbc.queryForObject("""
					SELECT (SELECT COALESCE(SUM(amount),0) FROM offerings)
					     + (SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount ELSE -amount END),0) FROM transactions)""", Long.class));
			finance = Api.map(
					"month", Api.map("offering", offering, "income", offering + Api.num(tx.get("inc")), "expense", Api.num(tx.get("exp"))),
					"balance", balance,
					"byType", jdbc.queryForList("""
							SELECT t.name, SUM(o.amount) AS amount FROM offerings o JOIN offering_types t ON t.id = o.type_id
							 WHERE o.date BETWEEN ? AND ? GROUP BY t.id ORDER BY t.sort, t.id""", ms, me));
		}

		String lastAtt = jdbc.queryForObject("SELECT MAX(date) FROM attendance WHERE date <= ?", String.class, t);
		List<Map<String, Object>> attList = lastAtt == null ? List.of() : jdbc.queryForList("""
				SELECT s.name, COUNT(*) AS cnt FROM attendance a JOIN services s ON s.id = a.service_id
				 WHERE a.date = ? GROUP BY s.id ORDER BY s.sort""", lastAtt);

		return Api.map(
				"today", t,
				"members", members,
				"finance", finance,
				"attendance", Api.map("date", lastAtt, "list", attList),
				"news", jdbc.queryForList("SELECT id, title, category, date, pinned FROM news ORDER BY pinned DESC, date DESC, id DESC LIMIT 5"),
				"events", jdbc.queryForList("SELECT * FROM events WHERE COALESCE(end_date, start_date) >= ? ORDER BY start_date LIMIT 5", t),
				"birthdays", birthdays.inMonth(YearMonth.now(), false));
	}
}
