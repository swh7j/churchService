package com.church.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.church.api.tenant.ChurchContext;

import tools.jackson.databind.JsonNode;

/** 백업 알림: 백업을 내려받은 지 30일이 지났거나 한 번도 안 받았으면 관리자 대시보드에 알림 */
class BackupReminderTest extends IntegrationTest {

	@Autowired
	private JdbcTemplate jdbc;

	private void setDownloaded(String sqlTime) {
		ChurchContext.run(CHURCH, () -> {
			jdbc.update("DELETE FROM settings WHERE key = 'backup_downloaded_at'");
			if (sqlTime != null) jdbc.update("INSERT INTO settings (key, value) VALUES ('backup_downloaded_at', " + sqlTime + ")");
		});
	}

	@Test
	@DisplayName("한 번도 안 받았으면 알림 → 내려받으면 알림이 사라짐 → 31일 지나면 다시 알림")
	void reminder() {
		Client a = admin();
		setDownloaded(null);
		JsonNode b = a.get("/api/dashboard").ok().json().path("backup");
		assertThat(b.path("due").asBoolean()).isTrue();
		assertThat(b.path("lastDownload").isNull()).isTrue();

		String name = newBackup(a);
		a.get("/api/backups/" + name + "/download").ok();
		b = a.get("/api/dashboard").ok().json().path("backup");
		assertThat(b.path("due").asBoolean()).isFalse();
		assertThat(b.path("days").asInt()).isZero();
		assertThat(a.get("/api/backups").ok().json().path("reminder").path("lastDownload").asString()).isNotBlank();

		setDownloaded("datetime('now','localtime','-31 days')");
		b = a.get("/api/dashboard").ok().json().path("backup");
		assertThat(b.path("due").asBoolean()).isTrue();
		assertThat(b.path("days").asInt()).isEqualTo(31);
		setDownloaded(null);
	}

	@Test
	@DisplayName("관리자가 아니면 대시보드에 백업 알림이 오지 않음")
	void onlyAdmin() {
		Client staff = userWithRole("remindstaff", "staff");
		assertThat(staff.get("/api/dashboard").ok().json().path("backup").isNull()).isTrue();
	}
}
