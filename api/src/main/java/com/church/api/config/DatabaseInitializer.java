package com.church.api.config;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

/**
 * 교회 DB를 처음 열 때 테이블을 만들고(schema.sql), 처음 만든 DB라면 기본 분류 항목을 넣습니다.
 * 기존 DB는 빠진 컬럼만 추가합니다. (ChurchDataSource 가 교회마다 한 번 호출)
 */
public final class DatabaseInitializer {

	private static final Logger log = LoggerFactory.getLogger(DatabaseInitializer.class);

	private DatabaseInitializer() {
	}

	public static void init(DataSource dataSource, String churchName) {
		JdbcTemplate jdbc = new JdbcTemplate(dataSource);
		new ResourceDatabasePopulator(new ClassPathResource("schema.sql")).execute(dataSource);
		migrate(jdbc);

		Integer types = jdbc.queryForObject("SELECT COUNT(*) FROM offering_types", Integer.class);
		if (types != null && types == 0) {
			insertDefaults(jdbc, churchName);
			log.info("새 데이터베이스에 기본 항목을 넣었습니다. ({})", churchName);
		}
	}

	/** 기존 DB에 새 컬럼 추가 (이미 있으면 건너뜀) */
	private static void migrate(JdbcTemplate jdbc) {
		for (String table : List.of("news", "bulletins", "events")) {
			List<String> cols = jdbc.queryForList("SELECT name FROM pragma_table_info(?)", String.class, table);
			if (!cols.contains("is_public")) {
				jdbc.execute("ALTER TABLE " + table + " ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1");
				log.info("{} 테이블에 is_public(성도 화면 공개) 컬럼을 추가했습니다.", table);
			}
		}

		// 4면 주보 (내용 JSON, 헌금자 명단)
		List<String> bcols = jdbc.queryForList("SELECT name FROM pragma_table_info('bulletins')", String.class);
		for (String col : List.of("layout", "offering_names")) {
			if (!bcols.contains(col)) {
				jdbc.execute("ALTER TABLE bulletins ADD COLUMN " + col + " TEXT");
				log.info("bulletins 테이블에 {} 컬럼을 추가했습니다.", col);
			}
		}

		// 비밀 기도제목 (관리자만 내용을 봄)
		if (!jdbc.queryForList("SELECT name FROM pragma_table_info('prayers')", String.class).contains("is_secret")) {
			jdbc.execute("ALTER TABLE prayers ADD COLUMN is_secret INTEGER NOT NULL DEFAULT 0");
			log.info("prayers 테이블에 is_secret(비밀 기도제목) 컬럼을 추가했습니다.");
		}

		// 교인 생일 칸 (월·일·음력 여부·성도 화면 공개 여부)
		List<String> mcols = jdbc.queryForList("SELECT name FROM pragma_table_info('members')", String.class);
		Map<String, String> add = new LinkedHashMap<>();
		add.put("birth_month", "INTEGER");
		add.put("birth_day", "INTEGER");
		add.put("birth_lunar", "INTEGER NOT NULL DEFAULT 0");
		add.put("birthday_public", "INTEGER NOT NULL DEFAULT 0");
		add.forEach((col, type) -> {
			if (!mcols.contains(col)) {
				jdbc.execute("ALTER TABLE members ADD COLUMN " + col + " " + type);
				log.info("members 테이블에 {} 컬럼을 추가했습니다.", col);
			}
		});

		// 생년월일이 있으면 생일 월·일로 복사
		jdbc.update("""
				UPDATE members SET birth_month = CAST(substr(birth_date,6,2) AS INTEGER), birth_day = CAST(substr(birth_date,9,2) AS INTEGER)
				 WHERE birth_month IS NULL AND birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'""");

		// 메모에 적어둔 "생일: 1월 28일 (음력)" → 생일 칸으로 옮기고 메모에서 지움
		Pattern p = Pattern.compile("생일:\\s*(\\d{1,2})월\\s*(\\d{1,2})일\\s*\\((음력|양력)\\)");
		int moved = 0;
		for (Map<String, Object> r : jdbc.queryForList("SELECT id, memo FROM members WHERE birth_month IS NULL AND memo LIKE '%생일:%'")) {
			Matcher m = p.matcher((String) r.get("memo"));
			if (!m.find()) continue;
			int month = Integer.parseInt(m.group(1)), day = Integer.parseInt(m.group(2));
			if (month < 1 || month > 12 || day < 1 || day > 31) continue;
			String rest = (m.replaceFirst("")).trim();
			jdbc.update("UPDATE members SET birth_month = ?, birth_day = ?, birth_lunar = ?, memo = ? WHERE id = ?",
					month, day, "음력".equals(m.group(3)) ? 1 : 0, rest.isEmpty() ? null : rest, r.get("id"));
			moved++;
		}
		if (moved > 0) log.info("메모의 생일 {}건을 생일 칸으로 옮겼습니다.", moved);
	}

	private static void insertDefaults(JdbcTemplate jdbc, String churchName) {
		jdbc.update("INSERT OR IGNORE INTO settings (key, value) VALUES ('church_name', ?)", churchName == null || churchName.isBlank() ? "우리교회" : churchName);
		List<String> types = List.of("십일조", "주일헌금", "감사헌금", "건축헌금", "선교헌금", "절기헌금");
		for (int i = 0; i < types.size(); i++) jdbc.update("INSERT INTO offering_types (name, sort) VALUES (?, ?)", types.get(i), i + 1);
		List<String> income = List.of("전기이월금", "이자수입", "기타수입");
		for (int i = 0; i < income.size(); i++) jdbc.update("INSERT INTO categories (kind, name, sort) VALUES ('income', ?, ?)", income.get(i), i + 1);
		List<String> expense = List.of("사례비", "관리비", "교육비", "선교비", "구제비", "행사비", "비품비", "기타지출");
		for (int i = 0; i < expense.size(); i++) jdbc.update("INSERT INTO categories (kind, name, sort) VALUES ('expense', ?, ?)", expense.get(i), i + 1);
		List<String> services = List.of("주일 1부 예배", "주일 2부 예배", "수요 예배", "금요 기도회");
		for (int i = 0; i < services.size(); i++) jdbc.update("INSERT INTO services (name, sort) VALUES (?, ?)", services.get(i), i + 1);
	}
}
