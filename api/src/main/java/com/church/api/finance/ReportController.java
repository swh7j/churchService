package com.church.api.finance;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.common.Api;
import com.church.api.common.ApiException;

@RestController
@RequestMapping("/api/reports")
@PreAuthorize("hasAuthority('AREA_finance')")
public class ReportController {

	private final JdbcTemplate jdbc;
	private final AuditService audit;

	public ReportController(JdbcTemplate jdbc, AuditService audit) {
		this.jdbc = jdbc;
		this.audit = audit;
	}

	private static String year(String y) {
		return y == null || y.isEmpty() ? Api.today().substring(0, 4) : y;
	}

	private static Map<String, Object> row(String group, String key, String grp, String name, long[] months) {
		long total = 0;
		List<Long> list = new ArrayList<>();
		for (long v : months) {
			list.add(v);
			total += v;
		}
		return Api.map("group", group, "key", key, "grp", grp == null || grp.isBlank() ? null : grp.trim(), "name", name, "months", list, "total", total);
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
		for (Map<String, Object> t : jdbc.queryForList("SELECT id, name, grp, sort FROM offering_types ORDER BY sort, id")) {
			long[] months = new long[12];
			for (Map<String, Object> o : off)
				if (Api.num(o.get("type_id")) == Api.num(t.get("id"))) months[(int) Api.num(o.get("m")) - 1] += Api.num(o.get("v"));
			Map<String, Object> r = row("헌금", "o:" + Api.num(t.get("id")), (String) t.get("grp"), (String) t.get("name"), months);
			r.put("sort", t.get("sort") == null ? 0L : Api.num(t.get("sort")));
			income.add(r);
		}

		List<Map<String, Object>> cats = jdbc.queryForList("SELECT id, kind, name, grp, sort FROM categories ORDER BY sort, id");
		List<Map<String, Object>> tx = jdbc.queryForList("""
				SELECT category_id, kind, CAST(substr(date,6,2) AS INTEGER) AS m, SUM(amount) AS v
				  FROM transactions WHERE substr(date,1,4) = ? GROUP BY category_id, kind, m""", y);
		for (Map<String, Object> c : cats) {
			long[] months = new long[12];
			for (Map<String, Object> x : tx)
				if (x.get("category_id") != null && Api.num(x.get("category_id")) == Api.num(c.get("id")) && c.get("kind").equals(x.get("kind")))
					months[(int) Api.num(x.get("m")) - 1] += Api.num(x.get("v"));
			boolean isIncome = "income".equals(c.get("kind"));
			Map<String, Object> r = row(isIncome ? "기타수입" : "지출", "c:" + Api.num(c.get("id")), (String) c.get("grp"), (String) c.get("name"), months);
			r.put("sort", c.get("sort") == null ? 0L : Api.num(c.get("sort")));
			(isIncome ? income : expense).add(r);
		}
		// 수입은 헌금 종류와 수입 계정과목을 순서(sort) 하나로 섞어서 정렬 (예: 전기이월을 맨 위에). 같으면 헌금이 먼저
		income.sort(java.util.Comparator.comparingLong(r -> Api.num(r.get("sort"))));
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
			if (any) ("income".equals(kind) ? income : expense).add(row("income".equals(kind) ? "기타수입" : "지출", null, null, "미분류", months));
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

	/** 예산: 해당 연도와 다음 연도 (예결산서에 결산 · 다음 해 예산을 나란히 보여 주기 위해) */
	@GetMapping("/budgets")
	public Map<String, Object> budgets(@RequestParam(required = false) String year) {
		int y;
		try {
			y = Integer.parseInt(year(year));
		} catch (NumberFormatException e) {
			throw new ApiException(400, "연도가 올바르지 않습니다.");
		}
		Map<String, Object> out = new LinkedHashMap<>();
		for (int yy : new int[] { y, y + 1 }) {
			Map<String, Object> items = new LinkedHashMap<>();
			for (Map<String, Object> r : jdbc.queryForList("SELECT item, amount, memo FROM budgets WHERE year = ?", yy))
				items.put((String) r.get("item"), Api.map("amount", Api.num(r.get("amount")), "memo", r.get("memo")));
			out.put(String.valueOf(yy), items);
		}
		return Api.map("year", y, "budgets", out);
	}

	/** 예산 저장: { year, items: [{ item: "o:1", amount, memo }] } — 금액 0 · 비고 없음은 삭제 */
	@PutMapping("/budgets")
	@Transactional
	public Map<String, Object> saveBudgets(@RequestBody Map<String, Object> body) {
		int y = (int) Api.num(body.get("year"));
		if (y < 2000 || y > 2100) throw new ApiException(400, "연도가 올바르지 않습니다.");
		Object raw = body.get("items");
		if (!(raw instanceof List<?> items)) throw new ApiException(400, "예산 항목이 없습니다.");
		int[] saved = { 0 };
		for (Object o : items) {
			if (!(o instanceof Map<?, ?> m)) continue;
			String item = Api.str(m.get("item"));
			if (!item.matches("[oc]:\\d+")) continue;
			if (!(m.get("amount") == null || m.get("amount") instanceof Number)) throw new ApiException(400, "예산 금액은 숫자로 입력해 주세요.");
			long amount = Api.num(m.get("amount"));
			if (amount < 0) throw new ApiException(400, "예산 금액은 0 이상이어야 합니다.");
			String memo = Api.str(m.get("memo"));
			memo = memo.isBlank() ? null : memo.trim();
			if (amount == 0 && memo == null) {
				jdbc.update("DELETE FROM budgets WHERE year = ? AND item = ?", y, item);
			} else {
				jdbc.update("""
						INSERT INTO budgets (year, item, amount, memo) VALUES (?, ?, ?, ?)
						ON CONFLICT(year, item) DO UPDATE SET amount = excluded.amount, memo = excluded.memo""", y, item, amount, memo);
				saved[0]++;
			}
		}
		audit.log("예산 저장", "budgets", y, Api.map("items", saved[0]));
		return Api.map("ok", true, "year", y, "saved", saved[0]);
	}
}
