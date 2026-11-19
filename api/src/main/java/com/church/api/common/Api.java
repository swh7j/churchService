package com.church.api.common;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.Map;

/** 컨트롤러에서 자주 쓰는 작은 도우미 */
public final class Api {

	private Api() {
	}

	/** map("a", 1, "b", 2) → 순서가 유지되는 Map (null 값 허용) */
	public static Map<String, Object> map(Object... kv) {
		Map<String, Object> m = new LinkedHashMap<>();
		for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
		return m;
	}

	public static String today() {
		return LocalDate.now().toString();
	}

	/** "2026-11" 또는 "2026-11-19" → 그 달의 마지막 날 "2026-11-30" */
	public static String monthEnd(String ymOrDate) {
		return YearMonth.parse(ymOrDate.substring(0, 7)).atEndOfMonth().toString();
	}

	public static long num(Object o) {
		return o == null ? 0 : ((Number) o).longValue();
	}

	public static String str(Object o) {
		return o == null ? "" : String.valueOf(o);
	}

	public static boolean blank(Object o) {
		return o == null || String.valueOf(o).isBlank();
	}
}
