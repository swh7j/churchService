package com.church.api.church;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** 음력 → 양력 변환 (음력 생일). 기준: 한국천문연구원 음양력 */
class BirthdayServiceTest {

	@DisplayName("명절 날짜로 음력 → 양력 변환 확인")
	@ParameterizedTest(name = "음력 {0}년 {1}월 {2}일 → {3}")
	@CsvSource({
			"2024, 8, 15, 2024-09-17", // 2024 추석
			"2025, 1, 1, 2025-01-29", // 2025 설날
			"2026, 1, 1, 2026-02-17", // 2026 설날
			"2026, 8, 15, 2026-09-25", // 2026 추석
			"2027, 1, 1, 2027-02-07", // 2027 설날
	})
	void lunarToSolar(int y, int m, int d, String expected) {
		assertThat(BirthdayService.lunarToSolar(y, m, d)).isEqualTo(LocalDate.parse(expected));
	}

	@DisplayName("작은달(29일)에 30일 생일이면 하루 앞당김 — null 이 아님")
	@ParameterizedTest(name = "{0}년 음력 {1}월 30일")
	@CsvSource({ "2025, 1", "2025, 2", "2025, 3", "2025, 4", "2025, 5", "2025, 6" })
	void day30AlwaysResolves(int y, int m) {
		LocalDate d = BirthdayService.lunarToSolar(y, m, 30);
		assertThat(d).isNotNull();
		// 30일이 있는 달이면 29일 다음 날, 없으면 29일과 같은 날
		LocalDate d29 = BirthdayService.lunarToSolar(y, m, 29);
		assertThat(d).isIn(d29, d29.plusDays(1));
	}
}
