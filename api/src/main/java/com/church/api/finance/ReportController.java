package com.church.api.finance;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.common.Api;

@RestController
@RequestMapping("/api/reports")
@PreAuthorize("hasAuthority('AREA_finance')")
public class ReportController {

	private final JdbcTemplate jdbc;

	public ReportController(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	private static String year(String y) {
		return y == null || y.isEmpty() ? Api.today().substring(0, 4) : y;
	}

	private static Map<String, Object> row(String group, String name, long[] months) {
		long total = 0;
		List<Long> list = new ArrayList<>();
		for (long v : months) {
			list.add(v);
			total += v;
		}
		return Api.map("group", group, "name", name, "months", list, "total", total);
	}

	private static List<Long> sum(List<Map<String, Object>> rows) {
		long[] s = new long[12];
		for (Map<String, Object> r : rows) {
			@SuppressWarnings("unchecked")
			List<Long> m = (List<Long>) r.get("months");
			for (int i = 0; i < 12; i++) s[i] += m.get(i);
		}
		List<Long> out = new ArrayList<>();
		for (long v : s) out.add(v);
		return out;
	}

	/** 연간 월별 결산: 수입(헌금 종류별 + 기타수입 계정) / 지출(계정별) */
	@GetMapping("/summary")
	public Map<String, Object> summary(@RequestParam(required = false) String year) {
		String y = year(year);
		List<Map<String, Object>> income = new ArrayList<>();
		List<Map<String, Object>> expense = new ArrayList<>();

		List<Map<String, Object>> off = jdbc.queryForList("""
				SELECT type_id, CAST(substr(date,6,2) AS INTEGER) AS m, SUM(amount) AS v
				  FROM offerings WHERE substr(date,1,4) = ? GROUP BY type_id, m""", y);
		for (Map<String, Object> t : jdbc.queryForList("SELECT id, name FROM offering_types ORDER BY sort, id")) {
			long[] months = new long[12];
			for (Map<String, Object> o : off)
				if (Api.num(o.get("type_id")) == Api.num(t.get("id"))) months[(int) Api.num(o.get("m")) - 1] += Api.num(o.get("v"));
			income.add(row("헌금", (String) t.get("name"), months));
		}

		List<Map<String, Object>> cats = jdbc.queryForList("SELECT id, kind, name FROM categories ORDER BY sort, id");
		List<Map<String, Object>> tx = jdbc.queryForList("""
				SELECT category_id, kind, CAST(substr(date,6,2) AS INTEGER) AS m, SUM(amount) AS v
				  FROM transactions WHERE substr(date,1,4) = ? GROUP BY category_id, kind, m""", y);
		for (Map<String, Object> c : cats) {
			long[] months = new long[12];
			for (Map<String, Object> x : tx)
				if (x.get("category_id") != null && Api.num(x.get("category_id")) == Api.num(c.get("id")) && c.get("kind").equals(x.get("kind")))
					months[(int) Api.num(x.get("m")) - 1] += Api.num(x.get("v"));
			boolean isIncome = "income".equals(c.get("kind"));
			(isIncome ? income : expense).add(row(isIncome ? "기타수입" : "지출", (String) c.get("name"), months));
		}
		// 계정과목이 없거나 맞지 않는 기록은 '미분류'
		for (String kind : List.of("income", "expense")) {
			long[] months = new long[12];
			boolean any = false;
			for (Map<String, Object> x : tx) {
				if (!kind.equals(x.get("kind"))) continue;
				boolean matched = cats.stream().anyMatch(c -> x.get("category_id") != null
						&& Api.num(c.get("id")) == Api.num(x.get("category_id")) && kind.equals(c.get("kind")));
				if (!matched) {
					months[(int) Api.num(x.get("m")) - 1] += Api.num(x.get("v"));
					any = true;
				}
			}
			if (any) ("income".equals(kind) ? income : expense).add(row("income".equals(kind) ? "기타수입" : "지출", "미분류", months));
		}
		return Api.map("year", y, "income", income, "expense", expense, "incomeMonths", sum(income), "expenseMonths", sum(expense));
	}

	/** 교인별 연간 헌금 합계 (기부금 영수증 자료) */
	@GetMapping("/donations")
	public Map<String, Object> donations(@RequestParam(required = false) String year) {
		String y = year(year);
		List<Map<String, Object>> rows = jdbc.queryForList("""
				SELECT m.id, m.name, m.position, m.district, o.type_id, SUM(o.amount) AS v
				  FROM offerings o JOIN members m ON m.id = o.member_id
				 WHERE substr(o.date,1,4) = ? GROUP BY m.id, o.type_id ORDER BY m.name, m.id""", y);
		Map<Long, Map<String, Object>> byMember = new LinkedHashMap<>();
		for (Map<String, Object> r : rows) {
			long id = Api.num(r.get("id"));
			Map<String, Object> e = byMember.computeIfAbsent(id, k -> Api.map("id", id, "name", r.get("name"), "position", r.get("position"),
					"district", r.get("district"), "byType", new LinkedHashMap<String, Long>(), "total", 0L));
			@SuppressWarnings("unchecked")
			Map<String, Long> byType = (Map<String, Long>) e.get("byType");
			byType.put(String.valueOf(Api.num(r.get("type_id"))), Api.num(r.get("v")));
			e.put("total", Api.num(e.get("total")) + Api.num(r.get("v")));
		}
		long anonymous = Api.num(jdbc.queryForObject(
				"SELECT COALESCE(SUM(amount),0) FROM offerings WHERE member_id IS NULL AND substr(date,1,4) = ?", Long.class, y));
		return Api.map("year", y, "types", jdbc.queryForList("SELECT id, name FROM offering_types ORDER BY sort, id"),
				"rows", new ArrayList<>(byMember.values()), "anonymous", anonymous);
	}
}
