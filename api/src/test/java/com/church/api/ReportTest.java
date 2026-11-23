package com.church.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** 결산보고서: 월별 합계, 소계 묶음, 수입 정렬, 예산 저장 */
class ReportTest extends IntegrationTest {

	private static JsonNode row(JsonNode rows, String name) {
		for (JsonNode r : rows) if (name.equals(r.path("name").asString())) return r;
		throw new AssertionError("행이 없음: " + name + " in " + rows);
	}

	private static List<String> names(JsonNode rows) {
		List<String> l = new ArrayList<>();
		rows.forEach(r -> l.add(r.path("name").asString()));
		return l;
	}

	@Test
	@DisplayName("헌금·장부 기록이 월별·항목별로 더해지고, 소계 묶음·정렬이 반영됨")
	void summary() {
		Client a = admin();
		long thanks = a.post("/api/offering_types", Map.of("name", "T감사", "grp", "T기본", "sort", 2)).ok().json().path("id").asLong();
		long tithe = a.post("/api/offering_types", Map.of("name", "T십일조", "grp", "T기본", "sort", 3)).ok().json().path("id").asLong();
		long carry = a.post("/api/categories", Map.of("kind", "income", "name", "T전기이월", "sort", 1)).ok().json().path("id").asLong();
		long power = a.post("/api/categories", Map.of("kind", "expense", "name", "T전기요금", "grp", "T관리비", "sort", 1)).ok().json().path("id").asLong();

		a.post("/api/offerings", Map.of("date", "2024-03-03", "type_id", thanks, "amount", 10_000)).ok();
		a.post("/api/offerings", Map.of("date", "2024-03-10", "type_id", thanks, "amount", 5_000)).ok();
		a.post("/api/offerings", Map.of("date", "2024-11-03", "type_id", tithe, "amount", 100_000)).ok();
		a.post("/api/offerings", Map.of("date", "2023-12-31", "type_id", tithe, "amount", 999_999)).ok(); // 다른 해: 빠져야 함
		a.post("/api/transactions", Map.of("date", "2024-01-01", "kind", "income", "category_id", carry, "amount", 1_000_000)).ok();
		a.post("/api/transactions", Map.of("date", "2024-03-20", "kind", "expense", "category_id", power, "amount", 70_000)).ok();

		JsonNode d = a.get("/api/reports/summary?year=2024").ok().json();

		JsonNode t = row(d.path("income"), "T감사");
		assertThat(t.path("total").asLong()).isEqualTo(15_000);
		assertThat(t.path("months").get(2).asLong()).as("3월").isEqualTo(15_000);
		assertThat(t.path("grp").asString()).isEqualTo("T기본");
		assertThat(t.path("key").asString()).isEqualTo("o:" + thanks);
		assertThat(row(d.path("income"), "T십일조").path("total").asLong()).as("다른 해 기록 제외").isEqualTo(100_000);
		assertThat(row(d.path("expense"), "T전기요금").path("grp").asString()).isEqualTo("T관리비");

		// 수입은 헌금 종류와 수입 계정을 한 순서로: 순서 1 인 전기이월이 순서 2·3 인 헌금보다 앞
		List<String> income = names(d.path("income"));
		assertThat(income.indexOf("T전기이월")).isLessThan(income.indexOf("T감사"));
		assertThat(income.indexOf("T감사")).isLessThan(income.indexOf("T십일조"));

		long incomeSum = 0;
		for (JsonNode v : d.path("incomeMonths")) incomeSum += v.asLong();
		assertThat(incomeSum).isEqualTo(1_115_000);
	}

	@Test
	@DisplayName("예산 저장·조회, 금액이 0 이고 비고도 없으면 지움")
	void budgets() {
		Client a = admin();
		long cat = a.post("/api/categories", Map.of("kind", "expense", "name", "T선교비", "sort", 9)).ok().json().path("id").asLong();
		String key = "c:" + cat;

		a.put("/api/reports/budgets", Map.of("year", 2030, "items", List.of(Map.of("item", key, "amount", 1_200_000, "memo", "100,000*12")))).ok();
		JsonNode b = a.get("/api/reports/budgets?year=2029").ok().json().path("budgets");
		assertThat(b.path("2030").path(key).path("amount").asLong()).as("다음 해 예산도 같이 내려옴").isEqualTo(1_200_000);
		assertThat(b.path("2030").path(key).path("memo").asString()).isEqualTo("100,000*12");

		a.put("/api/reports/budgets", Map.of("year", 2030, "items", List.of(Map.of("item", key, "amount", 0, "memo", "")))).ok();
		assertThat(a.get("/api/reports/budgets?year=2030").ok().json().path("budgets").path("2030").has(key)).isFalse();
	}

	@Test
	@DisplayName("예산: 숫자가 아니거나 음수면 거절, 이상한 항목 키는 무시")
	void budgetValidation() {
		Client a = admin();
		assertThat(a.put("/api/reports/budgets", Map.of("year", 2030, "items", List.of(Map.of("item", "c:1", "amount", "abc")))).status()).isEqualTo(400);
		assertThat(a.put("/api/reports/budgets", Map.of("year", 2030, "items", List.of(Map.of("item", "c:1", "amount", -5)))).status()).isEqualTo(400);
		assertThat(a.put("/api/reports/budgets", Map.of("year", 1800, "items", List.of())).status()).isEqualTo(400);
		JsonNode saved = a.put("/api/reports/budgets", Map.of("year", 2030, "items", List.of(Map.of("item", "x:1; DROP TABLE budgets", "amount", 5)))).ok().json();
		assertThat(saved.path("saved").asInt()).isZero();
	}
}
