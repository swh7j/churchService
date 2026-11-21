package com.church.api.tenant;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.sqlite.SQLiteDataSource;

import com.church.api.common.ApiException;

/**
 * 교회 목록 (data/platform.db). 교회마다 데이터 파일이 따로 있습니다.
 * - 처음 실행하면 기존 data/church.db 를 첫 번째 교회(app.default-church)로 등록합니다.
 * - 새 교회의 데이터는 data/church-{코드}.db
 */
@Component
public class ChurchRegistry {

	private static final Logger log = LoggerFactory.getLogger(ChurchRegistry.class);
	private static final String CODE_RULE = "^[a-z][a-z0-9-]{1,29}$";
	/** 주소에 쓰이는 다른 이름과 겹치지 않게 */
	private static final Set<String> RESERVED = Set.of("admin", "api", "assets", "c", "public", "platform", "static", "www");
	private static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	private static final SecureRandom RNG = new SecureRandom();

	public record Church(String code, String name, String dbFile, boolean active, String setupCode, String createdAt) {
		/** 처음부터 쓰던 교회 (data/church.db, 백업도 backups 폴더 바로 아래) */
		public boolean legacy() {
			return "church.db".equals(dbFile);
		}
	}

	private final Path dataDir;
	private final JdbcTemplate jdbc;
	private final String defaultCode;
	private final Map<String, Church> cache = new ConcurrentHashMap<>();

	public ChurchRegistry(@Value("${app.data-dir}") String dataDir, @Value("${app.default-church}") String defaultCode) throws IOException {
		this.dataDir = Path.of(dataDir).toAbsolutePath().normalize();
		Files.createDirectories(this.dataDir);
		this.defaultCode = defaultCode.trim().toLowerCase();
		if (!this.defaultCode.matches(CODE_RULE)) throw new IllegalStateException("app.default-church 는 영문 소문자로 시작하는 2~30자여야 합니다: " + defaultCode);
		SQLiteDataSource ds = new SQLiteDataSource();
		ds.setUrl("jdbc:sqlite:" + this.dataDir.resolve("platform.db"));
		this.jdbc = new JdbcTemplate(ds);
		jdbc.execute("""
				CREATE TABLE IF NOT EXISTS churches (
				  code TEXT PRIMARY KEY,
				  name TEXT NOT NULL,
				  db_file TEXT NOT NULL UNIQUE,
				  active INTEGER NOT NULL DEFAULT 1,
				  setup_code TEXT,          -- 첫 관리자 계정을 만들 때 필요한 코드 (만들면 지움)
				  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
				)""");
		Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM churches", Integer.class);
		if (n != null && n == 0) {
			String name = legacyChurchName();
			jdbc.update("INSERT INTO churches (code, name, db_file) VALUES (?, ?, 'church.db')", this.defaultCode, name);
			log.info("기존 데이터(church.db)를 첫 번째 교회 '{}' ({})로 등록했습니다.", name, this.defaultCode);
		}
		reload();
	}

	/** 기존 church.db 의 교회 이름 (없으면 '우리교회') */
	private String legacyChurchName() {
		Path f = dataDir.resolve("church.db");
		if (!Files.isRegularFile(f)) return "우리교회";
		try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + f);
				ResultSet r = c.createStatement().executeQuery("SELECT value FROM settings WHERE key = 'church_name'")) {
			String v = r.next() ? r.getString(1) : null;
			return v == null || v.isBlank() ? "우리교회" : v.trim();
		} catch (Exception e) {
			return "우리교회";
		}
	}

	private void reload() {
		Map<String, Church> next = new ConcurrentHashMap<>();
		for (Map<String, Object> r : jdbc.queryForList("SELECT * FROM churches")) {
			Church c = new Church((String) r.get("code"), (String) r.get("name"), (String) r.get("db_file"),
					((Number) r.get("active")).intValue() == 1, (String) r.get("setup_code"), (String) r.get("created_at"));
			next.put(c.code(), c);
		}
		cache.clear();
		cache.putAll(next);
	}

	/** 교회와 상관없는 전체 데이터(platform.db): 전체 관리자 계정 등 */
	public JdbcTemplate platformJdbc() {
		return jdbc;
	}

	public Path dataDir() {
		return dataDir;
	}

	public String defaultCode() {
		return defaultCode;
	}

	public Church find(String code) {
		return code == null ? null : cache.get(code.trim().toLowerCase());
	}

	/** 지금 요청의 교회 */
	public Church current() {
		Church c = find(ChurchContext.get());
		if (c == null) throw new IllegalStateException("교회가 선택되지 않았습니다.");
		return c;
	}

	public List<Church> all() {
		return cache.values().stream().sorted((a, b) -> a.createdAt().compareTo(b.createdAt())).toList();
	}

	public Path dbPath(Church c) {
		return dataDir.resolve(c.dbFile());
	}

	public synchronized Church create(String code, String name) {
		code = code == null ? "" : code.trim().toLowerCase();
		name = name == null ? "" : name.trim();
		if (!code.matches(CODE_RULE) || RESERVED.contains(code))
			throw ApiException.bad("교회 코드는 영문 소문자로 시작하는 2~30자(영문 소문자·숫자·-)로 정해 주세요.");
		if (name.isEmpty() || name.length() > 50) throw ApiException.bad("교회 이름을 50자 이내로 입력해 주세요.");
		if (find(code) != null) throw ApiException.bad("이미 있는 교회 코드입니다.");
		String file = "church-" + code + ".db";
		if (Files.exists(dataDir.resolve(file))) throw ApiException.bad("같은 이름의 데이터 파일이 이미 있습니다. 다른 코드를 써 주세요.");
		jdbc.update("INSERT INTO churches (code, name, db_file, setup_code) VALUES (?, ?, ?, ?)", code, name, file, newSetupCode());
		reload();
		return find(code);
	}

	public synchronized Church update(String code, String name, Boolean active) {
		Church c = find(code);
		if (c == null) throw ApiException.notFound("없는 교회입니다.");
		if (name != null) {
			name = name.trim();
			if (name.isEmpty() || name.length() > 50) throw ApiException.bad("교회 이름을 50자 이내로 입력해 주세요.");
			jdbc.update("UPDATE churches SET name = ? WHERE code = ?", name, c.code());
		}
		if (active != null) jdbc.update("UPDATE churches SET active = ? WHERE code = ?", active ? 1 : 0, c.code());
		reload();
		return find(code);
	}

	/** 첫 관리자 계정 코드를 새로 만듦 (잃어버렸을 때) */
	public synchronized Church resetSetupCode(String code) {
		jdbc.update("UPDATE churches SET setup_code = ? WHERE code = ?", newSetupCode(), code);
		reload();
		return find(code);
	}

	public synchronized void clearSetupCode(String code) {
		jdbc.update("UPDATE churches SET setup_code = NULL WHERE code = ?", code);
		reload();
	}

	private static String newSetupCode() {
		StringBuilder s = new StringBuilder();
		for (int i = 0; i < 8; i++) s.append(CODE_CHARS.charAt(RNG.nextInt(CODE_CHARS.length())));
		return s.toString();
	}
}
