package com.church.api.finance;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.common.Api;

/** 회계 장부: 헌금(일자·종류별 합계) + 수기 입력 수입/지출, 전월 이월 포함 */
@RestController
@PreAuthorize("hasAuthority('AREA_finance')")
public class LedgerController {

	private final JdbcTemplate jdbc;

	public LedgerController(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@GetMapping("/api/ledger")
	public Map<String, Object> ledger(@RequestParam(required = false) String from, @RequestParam(required = false) String to) {
		String t = Api.today();
		if (from == null || from.isEmpty()) from = t.substring(0, 7) + "-01";
		if (to == null || to.isEmpty()) to = Api.monthEnd(t);

		long carry = Api.num(jdbc.queryForObject("""
				SELECT (SELECT COALESCE(SUM(amount),0) FROM offerings WHERE date < ?)
				     + (SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount ELSE -amount END),0) FROM transactions WHERE date < ?)""",
				Long.class, from, from));

		List<Map<String, Object>> rows = jdbc.queryForList("""
				SELECT 'offering' AS source, NULL AS id, o.date, 'income' AS kind, t.name AS category_name,
				       '헌금 집계 (' || COUNT(*) || '건)' AS description, SUM(o.amount) AS amount, NULL AS method, NULL AS memo, NULL AS category_id
				  FROM offerings o LEFT JOIN offering_types t ON t.id = o.type_id
				 WHERE o.date BETWEEN ? AND ? GROUP BY o.date, o.type_id
				UNION ALL
				SELECT 'manual', x.id, x.date, x.kind, c.name, x.description, x.amount, x.method, x.memo, x.category_id
				  FROM transactions x LEFT JOIN categories c ON c.id = x.category_id
				 WHERE x.date BETWEEN ? AND ?
				ORDER BY date, source DESC, id""", from, to, from, to);

		long income = rows.stream().filter(r -> "income".equals(r.get("kind"))).mapToLong(r -> Api.num(r.get("amount"))).sum();
		long expense = rows.stream().filter(r -> "expense".equals(r.get("kind"))).mapToLong(r -> Api.num(r.get("amount"))).sum();
		return Api.map("from", from, "to", to, "carry", carry, "rows", rows, "income", income, "expense", expense, "balance", carry + income - expense);
	}
}
