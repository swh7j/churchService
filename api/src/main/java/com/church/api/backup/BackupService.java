package com.church.api.backup;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Statement;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.sqlite.SQLiteConfig;

import com.church.api.common.Api;
import com.church.api.common.ApiException;

/**
 * 백업 / 복원
 * - 백업: SQLite "VACUUM INTO" 로 사용 중에도 일관된 복사본 생성
 * - 복원: sqlite-jdbc 의 "restore from" (SQLite 온라인 백업 API) 로 현재 DB 내용을 교체
 * - 자동 백업: 서버가 켜져 있으면 하루 한 번, 최근 30개 보관
 */
@Service
public class BackupService {

	private static final Logger log = LoggerFactory.getLogger(BackupService.class);
	private static final Pattern NAME = Pattern.compile("^church-(\\d{4})(\\d{2})(\\d{2})-(\\d{2})(\\d{2})(\\d{2})-(auto|manual|before-restore)\\.db$");
	private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");
	private static final int KEEP_AUTO = 30;

	private final JdbcTemplate jdbc;
	private final Path dir;

	public BackupService(JdbcTemplate jdbc, @Value("${app.backup-dir}") String backupDir) {
		this.jdbc = jdbc;
		this.dir = Path.of(backupDir).toAbsolutePath().normalize();
	}

	public Path dir() {
		return dir;
	}

	public List<Map<String, Object>> list() {
		if (!Files.isDirectory(dir)) return List.of();
		List<Map<String, Object>> out = new ArrayList<>();
		try (Stream<Path> files = Files.list(dir)) {
			for (Path p : files.toList()) {
				Matcher m = NAME.matcher(p.getFileName().toString());
				if (!m.matches()) continue;
				out.add(Api.map(
						"name", p.getFileName().toString(),
						"kind", m.group(7),
						"created_at", "%s-%s-%s %s:%s:%s".formatted(m.group(1), m.group(2), m.group(3), m.group(4), m.group(5), m.group(6)),
						"size", Files.size(p)));
			}
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
		out.sort(Comparator.comparing((Map<String, Object> b) -> (String) b.get("created_at")).reversed());
		return out;
	}

	public synchronized Map<String, Object> create(String kind) {
		try {
			Files.createDirectories(dir);
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
		String name = "church-" + LocalDateTime.now().format(STAMP) + "-" + kind + ".db";
		Path file = dir.resolve(name);
		if (Files.exists(file)) throw ApiException.bad("방금 백업했습니다. 잠시 후 다시 시도해 주세요.");
		jdbc.execute("VACUUM INTO '" + file.toString().replace("'", "''") + "'");
		if ("auto".equals(kind)) {
			list().stream().filter(b -> "auto".equals(b.get("kind"))).skip(KEEP_AUTO)
					.forEach(b -> dir.resolve((String) b.get("name")).toFile().delete());
		}
		return list().stream().filter(b -> name.equals(b.get("name"))).findFirst().orElseThrow();
	}

	/** 이름 검사 후 실제 파일 경로 (다른 폴더의 파일에 접근하지 못하게) */
	public Path path(String name) {
		if (name == null || !NAME.matcher(name).matches()) throw ApiException.bad("잘못된 백업 파일 이름입니다.");
		Path p = dir.resolve(name);
		if (!Files.isRegularFile(p)) throw ApiException.notFound("백업 파일을 찾을 수 없습니다.");
		return p;
	}

	public void delete(String name) {
		try {
			Files.delete(path(name));
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	/** 복원. 복원 직전 상태는 'before-restore' 백업으로 남기고, 그 파일 이름을 돌려줌 */
	public synchronized String restore(String name) {
		Path src = path(name);
		// 올바른 백업 파일인지 먼저 확인 (읽기 전용으로 열어봄)
		SQLiteConfig ro = new SQLiteConfig();
		ro.setReadOnly(true);
		try (Connection c = ro.createConnection("jdbc:sqlite:" + src); Statement st = c.createStatement()) {
			st.executeQuery("SELECT COUNT(*) FROM members").close();
			st.executeQuery("SELECT COUNT(*) FROM offerings").close();
		} catch (Exception e) {
			throw ApiException.bad("올바른 백업 파일이 아닙니다.");
		}
		String safety = (String) create("before-restore").get("name");
		jdbc.execute((Connection c) -> {
			try (Statement st = c.createStatement()) {
				st.executeUpdate("restore from \"" + src.toString().replace("\\", "/") + "\"");
			}
			return null;
		});
		return safety;
	}

	/** 1시간마다 확인해서 마지막 자동 백업이 24시간 지났으면 백업 */
	@Scheduled(initialDelay = 5_000, fixedDelay = 3_600_000)
	public void autoBackup() {
		try {
			var last = list().stream().filter(b -> "auto".equals(b.get("kind"))).findFirst();
			boolean due = last.isEmpty() || Duration.between(
					LocalDateTime.parse(((String) last.get().get("created_at")).replace(' ', 'T')), LocalDateTime.now()).toHours() >= 24;
			if (due) log.info("자동 백업 완료: {}", create("auto").get("name"));
		} catch (Exception e) {
			log.error("자동 백업 실패: {}", e.getMessage());
		}
	}
}
