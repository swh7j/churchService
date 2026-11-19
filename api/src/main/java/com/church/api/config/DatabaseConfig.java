package com.church.api.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

/** SQLite 파일 DB 연결 (data/church.db) */
@Configuration
public class DatabaseConfig {

	@Bean
	public Path dbFile(@Value("${app.data-dir}") String dataDir) throws IOException {
		Path dir = Path.of(dataDir).toAbsolutePath().normalize();
		Files.createDirectories(dir);
		return dir.resolve("church.db");
	}

	@Bean
	public DataSource dataSource(Path dbFile) {
		HikariConfig c = new HikariConfig();
		c.setDriverClassName("org.sqlite.JDBC");
		c.setJdbcUrl("jdbc:sqlite:" + dbFile);
		// 연결마다 적용되는 SQLite 설정
		c.addDataSourceProperty("foreign_keys", "true"); // 외래키 검사 켜기
		c.addDataSourceProperty("journal_mode", "WAL"); // 읽기/쓰기 동시 처리
		c.addDataSourceProperty("busy_timeout", "5000"); // 다른 쓰기가 끝날 때까지 최대 5초 대기
		c.setMaximumPoolSize(4);
		c.setPoolName("church-db");
		return new HikariDataSource(c);
	}
}
