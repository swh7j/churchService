package com.church.api.crud;

import java.util.Map;

/** /api/{이름} 으로 조회·등록·수정·삭제할 수 있는 테이블 목록 */
final class Resources {

	private Resources() {
	}

	static final Map<String, Resource> ALL = Map.ofEntries(
			Map.entry("members", Resource.of("members", "church").alsoRead("finance")
					.cols("name", "gender", "birth_date", "birth_month", "birth_day", "birth_lunar", "birthday_public", "phone", "email", "address", "position", "district", "household", "status", "registered_date", "baptism", "memo")
					.filters("status", "position", "district")
					.search("name", "phone", "district", "household", "address")
					.order("name, id").build()),

			Map.entry("offering_types", Resource.of("offering_types", "finance").adminWrite()
					.cols("name", "grp", "sort").order("sort, id").build()),

			Map.entry("categories", Resource.of("categories", "finance").adminWrite()
					.cols("kind", "name", "grp", "sort").filters("kind").order("kind, sort, id").build()),

			Map.entry("services", Resource.of("services", "church").adminWrite()
					.cols("name", "sort").order("sort, id").build()),

			Map.entry("offerings", Resource.of("offerings", "finance").alias("o")
					.cols("date", "member_id", "donor_name", "type_id", "amount", "method", "memo")
					.select("""
							SELECT o.*, m.name AS member_name, m.position AS member_position, t.name AS type_name
							  FROM offerings o LEFT JOIN members m ON m.id = o.member_id LEFT JOIN offering_types t ON t.id = o.type_id""")
					.dateCol("date").filters("type_id", "member_id", "method")
					.search("m.name", "o.donor_name", "o.memo")
					.order("o.date DESC, o.id DESC").build()),

			Map.entry("transactions", Resource.of("transactions", "finance").alias("x")
					.cols("date", "kind", "category_id", "amount", "description", "method", "memo")
					.select("SELECT x.*, c.name AS category_name FROM transactions x LEFT JOIN categories c ON c.id = x.category_id")
					.dateCol("date").filters("kind", "category_id")
					.search("x.description", "x.memo")
					.order("x.date DESC, x.id DESC").build()),

			Map.entry("small_groups", Resource.of("small_groups", "finance").alias("g")
					.cols("name", "leader", "description")
					.select("""
							SELECT g.*, COALESCE((SELECT SUM(CASE WHEN kind='income' THEN amount ELSE -amount END)
							  FROM group_transactions WHERE group_id = g.id), 0) AS balance FROM small_groups g""")
					.order("g.name, g.id").build()),

			Map.entry("group_transactions", Resource.of("group_transactions", "finance")
					.cols("group_id", "date", "kind", "amount", "description", "memo")
					.dateCol("date").filters("group_id").order("date, id").build()),

			Map.entry("news", Resource.of("news", "church")
					.cols("title", "category", "content", "pinned", "date", "is_public")
					.filters("category").search("title", "content")
					.order("pinned DESC, date DESC, id DESC").build()),

			Map.entry("bulletins", Resource.of("bulletins", "church")
					.cols("date", "title", "preacher", "sermon_title", "scripture", "worship_order", "announcements", "prayer_requests", "memo", "is_public", "layout", "offering_names")
					.search("title", "sermon_title", "preacher", "scripture")
					.order("date DESC, id DESC").build()),

			Map.entry("events", Resource.of("events", "church")
					.cols("title", "start_date", "end_date", "location", "description", "is_public")
					.dateCol("start_date").search("title", "location", "description")
					.order("start_date DESC, id DESC").build()));
}
