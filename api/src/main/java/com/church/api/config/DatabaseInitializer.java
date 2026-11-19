package com.church.api.config;

import java.util.List;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

/**
 * 앱 시작 시 테이블을 만들고(schema.sql), 처음 만든 DB라면 기본 분류 항목을 넣습니다.
 * 기존 data/church.db 가 있으면 그대로 사용합니다.
 */
@Component
public class DatabaseInitializer {

	private static final Logger log = LoggerFactory.getLogger(DatabaseInitializer.class);

	public DatabaseInitializer(DataSource dataSource, JdbcTemplate jdbc) {
		new ResourceDatabasePopulator(new ClassPathResource("schema.sql")).execute(dataSource);
		migrate(jdbc);

		Integer types = jdbc.queryForObject("SELECT COUNT(*) FROM offering_types", Integer.class);
		if (types != null && types == 0) {
			insertDefaults(jdbc);
			log.info("새 데이터베이스에 기본 항목을 넣었습니다.");
		}
	}

	/** 기존 DB에 새 컬럼 추가 (이미 있으면 건너뜀) */
	private void migrate(JdbcTemplate jdbc) {
		for (String table : List.of("news", "bulletins", "events")) {
			List<String> cols = jdbc.queryForList("SELECT name FROM pragma_table_info(?)", String.class, table);
			if (!cols.contains("is_public")) {
				jdbc.execute("ALTER TABLE " + table + " ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1");
				log.info("{} 테이블에 is_public(성도 화면 공개) 컬럼을 추가했습니다.", table);
			}
		}
	}

	private void insertDefaults(JdbcTemplate jdbc) {
		jdbc.update("INSERT OR IGNORE INTO settings (key, value) VALUES ('church_name', '우리교회')");
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
