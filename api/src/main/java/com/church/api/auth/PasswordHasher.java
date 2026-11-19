package com.church.api.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;

import org.bouncycastle.crypto.generators.SCrypt;

import com.church.api.common.ApiException;

/**
 * 비밀번호 해시: scrypt(N=16384, r=8, p=1, 64바이트) + 랜덤 salt.
 * 저장 형식 "scrypt$<salt hex>$<hash hex>" 은 이전 Node 버전과 같아서 기존 계정을 그대로 쓸 수 있습니다.
 */
public final class PasswordHasher {

	private PasswordHasher() {
	}

	private static final SecureRandom RNG = new SecureRandom();
	private static final HexFormat HEX = HexFormat.of();
	private static final int N = 16384, R = 8, P = 1, LEN = 64;

	/** 없는 아이디로 로그인해도 같은 시간이 걸리도록 비교에 쓰는 값 */
	public static final String DUMMY = hash(HEX.formatHex(randomBytes(12)));

	private static byte[] randomBytes(int n) {
		byte[] b = new byte[n];
		RNG.nextBytes(b);
		return b;
	}

	public static String hash(String password) {
		byte[] salt = randomBytes(16);
		byte[] h = SCrypt.generate(password.getBytes(StandardCharsets.UTF_8), salt, N, R, P, LEN);
		return "scrypt$" + HEX.formatHex(salt) + "$" + HEX.formatHex(h);
	}

	public static boolean verify(String password, String stored) {
		if (password == null || stored == null) return false;
		String[] parts = stored.split("\\$");
		if (parts.length != 3 || !"scrypt".equals(parts[0])) return false;
		try {
			byte[] salt = HEX.parseHex(parts[1]);
			byte[] expected = HEX.parseHex(parts[2]);
			byte[] calc = SCrypt.generate(password.getBytes(StandardCharsets.UTF_8), salt, N, R, P, expected.length);
			return MessageDigest.isEqual(calc, expected);
		} catch (IllegalArgumentException e) {
			return false;
		}
	}

	public static void validatePassword(Object pw) {
		if (!(pw instanceof String s) || s.length() < 8) throw ApiException.bad("비밀번호는 8자 이상이어야 합니다.");
	}

	public static void validateUsername(String u) {
		if (u == null || !u.matches("^[a-zA-Z0-9_.-]{3,30}$")) throw ApiException.bad("아이디는 영문·숫자·_.- 로 3~30자여야 합니다.");
	}
}
