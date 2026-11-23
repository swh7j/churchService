package com.church.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.church.api.common.ApiException;

/** 비밀번호 해시 (scrypt) */
class PasswordHasherTest {

	@Test
	@DisplayName("같은 비밀번호도 매번 다른 해시(소금값), 확인은 됨")
	void hashAndVerify() {
		String a = PasswordHasher.hash("correct horse");
		String b = PasswordHasher.hash("correct horse");
		assertThat(a).startsWith("scrypt$").isNotEqualTo(b);
		assertThat(PasswordHasher.verify("correct horse", a)).isTrue();
		assertThat(PasswordHasher.verify("correct horsE", a)).isFalse();
		assertThat(PasswordHasher.verify("", a)).isFalse();
	}

	@Test
	@DisplayName("망가진 해시 값이면 예외 없이 false")
	void brokenHash() {
		assertThat(PasswordHasher.verify("x", "not-a-hash")).isFalse();
		assertThat(PasswordHasher.verify("x", "scrypt$zz$zz")).isFalse();
	}

	@Test
	@DisplayName("비밀번호 8자 이상, 아이디 규칙")
	void validation() {
		assertThatThrownBy(() -> PasswordHasher.validatePassword("1234567")).isInstanceOf(ApiException.class);
		PasswordHasher.validatePassword("12345678");
		assertThatThrownBy(() -> PasswordHasher.validateUsername("ab")).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> PasswordHasher.validateUsername("관리자")).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> PasswordHasher.validateUsername("a b c")).isInstanceOf(ApiException.class);
		PasswordHasher.validateUsername("pastor.kim_01");
	}
}
