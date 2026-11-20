package com.church.api.config;

import java.io.PrintWriter;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

import javax.sql.DataSource;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.AbstractDataSource;

import com.church.api.tenant.ChurchContext;
import com.church.api.tenant.ChurchRegistry;
import com.church.api.tenant.ChurchRegistry.Church;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

/**
 * SQLite 파일 DB 연결. 교회마다 데이터 파일이 따로 있고,
 * 요청의 교회(ChurchContext)에 맞는 파일로 연결합니다. 그래서 다른 코드는 교회를 신경 쓰지 않아도 됩니다.
 */
@Configuration
public class DatabaseConfig {

	@Bean
	public DataSource dataSource(ChurchRegistry registry) {
		return new ChurchDataSource(registry);
	}

	public static class ChurchDataSource extends AbstractDataSource {

		private final ChurchRegistry registry;
		private final Map<String, HikariDataSource> pools = new ConcurrentHashMap<>();

		ChurchDataSource(ChurchRegistry registry) {
			this.registry = registry;
		}

		/** 지금 교회의 연결 풀 (처음이면 만들고 테이블 준비) */
		private DataSource current() {
			String code = ChurchContext.get();
			if (code == null) throw new IllegalStateException("교회가 선택되지 않은 상태에서 DB를 사용했습니다.");
			HikariDataSource ds = pools.get(code);
			if (ds != null) return ds;
			synchronized (this) {
				return pools.computeIfAbsent(code, this::open);
			}
		}

		private HikariDataSource open(String code) {
			Church church = registry.find(code);
			if (church == null) throw new IllegalStateException("없는 교회입니다: " + code);
			HikariConfig c = new HikariConfig();
			c.setDriverClassName("org.sqlite.JDBC");
			c.setJdbcUrl("jdbc:sqlite:" + registry.dbPath(church));
			// 연결마다 적용되는 SQLite 설정
			c.addDataSourceProperty("foreign_keys", "true"); // 외래키 검사 켜기
			c.addDataSourceProperty("journal_mode", "WAL"); // 읽기/쓰기 동시 처리
			c.addDataSourceProperty("busy_timeout", "5000"); // 다른 쓰기가 끝날 때까지 최대 5초 대기
			c.setMaximumPoolSize(4);
			c.setMinimumIdle(0); // 안 쓰는 교회는 연결을 닫아 메모리 절약
			c.setIdleTimeout(120_000);
			c.setPoolName("church-" + code);
			HikariDataSource ds = new HikariDataSource(c);
			DatabaseInitializer.init(ds, church.name());
			return ds;
		}

		@Override
		public Connection getConnection() throws SQLException {
			return current().getConnection();
		}

		@Override
		public Connection getConnection(String username, String password) throws SQLException {
			return current().getConnection(username, password);
		}

		@Override
		public PrintWriter getLogWriter() {
			return null;
		}

		@Override
		public Logger getParentLogger() {
			return Logger.getLogger("church-db");
		}
	}
}
