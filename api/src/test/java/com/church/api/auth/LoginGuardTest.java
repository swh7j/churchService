package com.church.api.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 로그인 실패 잠금 규칙: 남이 일부러 틀려서 관리자를 잠그지 못하게 아이디+IP 기준 */
class LoginGuardTest {

	private final LoginGuard guard = new LoginGuard();

	@Test
	@DisplayName("같은 아이디·같은 IP에서 5번 틀리면 잠김")
	void locksAfterFiveFails() {
		String[] keys = LoginGuard.keys("c1", "admin", "1.1.1.1");
		for (int i = 0; i < 4; i++) guard.failLogin(keys);
		assertThat(guard.lockedMinutes(keys)).isZero();
		guard.failLogin(keys);
		assertThat(guard.lockedMinutes(keys)).isBetween(1, 5);
	}

	@Test
	@DisplayName("다른 IP에서 틀린 것은 내 로그인을 잠그지 않음 (아이디 전체 30번 전까지)")
	void otherIpDoesNotLockMe() {
		String[] attacker = LoginGuard.keys("c1", "admin", "6.6.6.6");
		for (int i = 0; i < 10; i++) guard.failLogin(attacker);
		assertThat(guard.lockedMinutes(attacker)).isPositive();

		String[] me = LoginGuard.keys("c1", "admin", "1.1.1.1");
		assertThat(guard.lockedMinutes(me)).isZero();
	}

	@Test
	@DisplayName("여러 IP에서 한 아이디를 30번 노리면 그 아이디는 잠김")
	void accountWideLock() {
		for (int i = 0; i < 30; i++) guard.failLogin(LoginGuard.keys("c1", "pastor", "10.0.0." + i));
		assertThat(guard.lockedMinutes(LoginGuard.keys("c1", "pastor", "1.1.1.1"))).isPositive();
	}

	@Test
	@DisplayName("한 IP에서 여러 아이디로 20번 틀리면 그 IP는 잠김")
	void ipWideLock() {
		for (int i = 0; i < 20; i++) guard.failLogin(LoginGuard.keys("c1", "user" + i, "7.7.7.7"));
		assertThat(guard.lockedMinutes(LoginGuard.keys("c1", "brand-new", "7.7.7.7"))).isPositive();
		assertThat(guard.lockedMinutes(LoginGuard.keys("c1", "brand-new", "8.8.8.8"))).isZero();
	}

	@Test
	@DisplayName("성공하면 아이디 기준 실패 기록이 지워짐, 아이디는 대소문자 구분 없음")
	void successResets() {
		String[] keys = LoginGuard.keys("c1", "Admin", "1.1.1.1");
		for (int i = 0; i < 4; i++) guard.failLogin(keys);
		guard.success(keys[0], keys[2]);
		guard.failLogin(LoginGuard.keys("c1", "admin", "1.1.1.1"));
		assertThat(guard.lockedMinutes(keys)).isZero();
	}

	@Test
	@DisplayName("교회가 다르면 따로 셈")
	void perChurch() {
		for (int i = 0; i < 5; i++) guard.failLogin(LoginGuard.keys("c1", "admin", "1.1.1.1"));
		assertThat(guard.lockedMinutes(LoginGuard.keys("c1", "admin", "1.1.1.1")[0])).isPositive();
		assertThat(guard.lockedMinutes(LoginGuard.keys("c2", "admin", "1.1.1.1")[0])).isZero();
	}
}
