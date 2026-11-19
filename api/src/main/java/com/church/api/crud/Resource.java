package com.church.api.crud;

import java.util.List;

/**
 * 일반 CRUD 대상 테이블 정의.
 * area: "church"(교역자·사역) / "finance"(재정) — 해당 영역 권한이 있어야 조회·수정 가능
 * adminWrite: 조회는 area, 수정은 관리자만 (분류 항목)
 * alsoRead: 다른 영역에서도 조회 가능 (재정 담당이 헌금 입력 시 교인 검색)
 */
public record Resource(
		String table,
		String area,
		boolean adminWrite,
		List<String> alsoRead,
		String alias,
		List<String> cols,
		String select,
		String dateCol,
		List<String> filters,
		List<String> search,
		String order) {

	String col(String c) {
		return alias == null ? c : alias + "." + c;
	}

	String baseSelect() {
		return select != null ? select : "SELECT * FROM " + table;
	}

	static Builder of(String table, String area) {
		return new Builder(table, area);
	}

	static final class Builder {
		private final String table, area;
		private boolean adminWrite;
		private List<String> alsoRead = List.of(), cols = List.of(), filters = List.of(), search = List.of();
		private String alias, select, dateCol, order = "id";

		private Builder(String table, String area) {
			this.table = table;
			this.area = area;
		}

		Builder adminWrite() { this.adminWrite = true; return this; }
		Builder alsoRead(String... a) { this.alsoRead = List.of(a); return this; }
		Builder alias(String a) { this.alias = a; return this; }
		Builder cols(String... c) { this.cols = List.of(c); return this; }
		Builder select(String s) { this.select = s; return this; }
		Builder dateCol(String d) { this.dateCol = d; return this; }
		Builder filters(String... f) { this.filters = List.of(f); return this; }
		Builder search(String... s) { this.search = List.of(s); return this; }
		Builder order(String o) { this.order = o; return this; }

		Resource build() {
			return new Resource(table, area, adminWrite, alsoRead, alias, cols, select, dateCol, filters, search, order);
		}
	}
}
