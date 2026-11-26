package com.church.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.sqlite.SQLiteConfig;

import com.church.api.tenant.ChurchContext;

/**
 * 백업 복원: 백업이 있어도 실제로 되살릴 수 있어야 의미가 있다.
 * 데이터 넣기 → 백업 → 데이터 바꾸기 → 복원 → 백업 시점으로 돌아오는지, 복원 직전 상태로 되돌릴 수 있는지,
 * 백업 파일이 깨지지 않았는지, 잘못된 파일은 복원하지 않는지 확인한다.
 */
class BackupRestoreTest extends IntegrationTest {

	@Autowired
	private JdbcTemplate jdbc;

	private long count(String name) {
		return ChurchContext.call(CHURCH, () -> jdbc.queryForObject("SELECT COUNT(*) FROM members WHERE name = ?", Long.class, name));
	}

	private Path backupDir(Client a) {
		return Path.of(a.get("/api/backups").ok().json().path("dir").asString());
	}

	private static void nextSecond() {
		try {
			Thread.sleep(1100); // 백업 파일 이름이 초 단위라 같은 초에 두 번 만들면 거절됨
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
	}

	@Test
	@DisplayName("복원하면 백업 시점 데이터로 돌아가고, 복원 직전 백업으로 다시 되돌릴 수 있음")
	void restoreAndUndo() {
		Client a = admin();
		a.post("/api/members", Map.of("name", "복원_백업전교인")).ok();
		String backup = newBackup(a);

		// 백업 뒤에 생긴 데이터
		a.post("/api/members", Map.of("name", "복원_백업후교인")).ok();
		assertThat(count("복원_백업후교인")).isEqualTo(1);

		var res = a.post("/api/backups/" + backup + "/restore", Map.of()).ok().json();
		String safety = res.path("safety").asString();
		assertThat(safety).contains("before-restore");

		// 백업 시점으로 돌아옴: 백업 전 교인은 있고, 백업 뒤 교인은 없음
		assertThat(count("복원_백업전교인")).isEqualTo(1);
		assertThat(count("복원_백업후교인")).isZero();
		// 복원 뒤에도 로그인이 유지되고 화면 API가 정상
		a.get("/api/members").ok();

		// 실수로 복원했어도 복원 직전 백업으로 되돌릴 수 있음
		nextSecond();
		a.post("/api/backups/" + safety + "/restore", Map.of()).ok();
		assertThat(count("복원_백업전교인")).isEqualTo(1);
		assertThat(count("복원_백업후교인")).isEqualTo(1);
	}

	@Test
	@DisplayName("백업 파일은 SQLite 무결성 검사를 통과하고, 백업 시점의 교인 수와 같음")
	void backupFileIntegrity() throws Exception {
		Client a = admin();
		a.post("/api/members", Map.of("name", "무결성_교인")).ok();
		long live = ChurchContext.call(CHURCH, () -> jdbc.queryForObject("SELECT COUNT(*) FROM members", Long.class));
		Path file = backupDir(a).resolve(newBackup(a));

		SQLiteConfig ro = new SQLiteConfig();
		ro.setReadOnly(true);
		try (Connection c = ro.createConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
			try (ResultSet rs = st.executeQuery("PRAGMA integrity_check")) {
				rs.next();
				assertThat(rs.getString(1)).isEqualTo("ok");
			}
			try (ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM members")) {
				rs.next();
				assertThat(rs.getLong(1)).isEqualTo(live);
			}
		}
	}

	@Test
	@DisplayName("깨진 백업 파일은 복원하지 않고, 지금 데이터도 그대로 둠")
	void rejectBrokenFile() throws Exception {
		Client a = admin();
		a.post("/api/members", Map.of("name", "깨진파일_교인")).ok();
		Path dir = backupDir(a);
		Files.createDirectories(dir);
		String broken = "church-20000101-000000-manual.db";
		Files.write(dir.resolve(broken), "이건 SQLite 파일이 아님".getBytes());
		try {
			assertThat(a.post("/api/backups/" + broken + "/restore", Map.of()).status()).isEqualTo(400);
			assertThat(count("깨진파일_교인")).isEqualTo(1);
		} finally {
			Files.deleteIfExists(dir.resolve(broken));
		}
	}

	@Test
	@DisplayName("백업 폴더 밖 파일 이름이나 없는 파일은 복원할 수 없음")
	void rejectBadName() {
		Client a = admin();
		assertThat(a.post("/api/backups/..%2F..%2Fchurch.db/restore", Map.of()).status()).isIn(400, 404);
		assertThat(a.post("/api/backups/church-19990101-000000-manual.db/restore", Map.of()).status()).isEqualTo(404);
	}

	@Test
	@DisplayName("관리자가 아니면 복원할 수 없음")
	void onlyAdmin() {
		String name = newBackup(admin());
		Client staff = userWithRole("restorestaff", "staff");
		assertThat(staff.post("/api/backups/" + name + "/restore", Map.of()).status()).isEqualTo(403);
	}
}
