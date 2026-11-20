package com.church.api.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.church.api.tenant.ChurchContext;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 로그인 세션: 랜덤 토큰을 httpOnly 쿠키(sid)로 주고, DB(sessions)에는 토큰의 SHA-256 해시만 저장합니다.
 * DB에 저장하므로 서버를 재시작해도 로그인이 유지됩니다.
 */
@Service
public class SessionService {

	private static final String COOKIE = "sid_"; // + 교회 코드
	private static final Duration TTL = Duration.ofHours(12); // 마지막 사용 후 12시간 지나면 로그아웃
	private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);
	private static final SecureRandom RNG = new SecureRandom();

	private final JdbcTemplate jdbc;
	private final boolean forceSecure;

	public SessionService(JdbcTemplate jdbc, @Value("${app.cookie-secure}") boolean forceSecure) {
		this.jdbc = jdbc;
		this.forceSecure = forceSecure;
	}

	private static String now() {
		return ISO.format(Instant.now());
	}

	private static String expiry() {
		return ISO.format(Instant.now().plus(TTL));
	}

	private static String sha256(String s) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	private static String readToken(HttpServletRequest req) {
		Cookie[] cookies = req.getCookies();
		if (cookies == null) return null;
		for (Cookie c : cookies) if (cookieName().equals(c.getName())) return c.getValue();
		return null;
	}

	/** 교회마다 다른 쿠키 이름 */
	private static String cookieName() {
		return COOKIE + ChurchContext.get();
	}

	public void start(HttpServletRequest req, HttpServletResponse res, long userId) {
		byte[] b = new byte[32];
		RNG.nextBytes(b);
		String token = HexFormat.of().formatHex(b);
		jdbc.update("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", sha256(token), userId, expiry());
		jdbc.update("UPDATE users SET last_login = datetime('now','localtime') WHERE id = ?", userId);
		jdbc.update("DELETE FROM sessions WHERE expires_at < ?", now());
		ResponseCookie cookie = ResponseCookie.from(cookieName(), token)
				.httpOnly(true) // 자바스크립트에서 읽을 수 없게
				.sameSite("Lax")
				.secure(req.isSecure() || forceSecure) // HTTPS 배포 시
				.path("/")
				.build();
		res.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
	}

	public void end(HttpServletRequest req, HttpServletResponse res) {
		String token = readToken(req);
		if (token != null) jdbc.update("DELETE FROM sessions WHERE token_hash = ?", sha256(token));
		res.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(cookieName(), "").path("/").maxAge(0).build().toString());
	}

	public void endAllFor(long userId) {
		jdbc.update("DELETE FROM sessions WHERE user_id = ?", userId);
	}

	/** 쿠키로 현재 사용자를 찾음. 만료/중지된 계정이면 null */
	public AuthUser current(HttpServletRequest req) {
		String token = readToken(req);
		if (token == null) return null;
		String th = sha256(token);
		List<Map<String, Object>> rows = jdbc.queryForList(
				"SELECT u.id, u.username, u.name, u.role, u.active, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
				th);
		if (rows.isEmpty()) return null;
		Map<String, Object> r = rows.get(0);
		String expires = (String) r.get("expires_at");
		if (((Number) r.get("active")).intValue() == 0 || expires.compareTo(now()) < 0) {
			jdbc.update("DELETE FROM sessions WHERE token_hash = ?", th);
			return null;
		}
		// 사용 중이면 만료 시간 연장 (남은 시간이 절반 이하일 때만)
		if (expires.compareTo(ISO.format(Instant.now().plus(TTL.dividedBy(2)))) < 0) {
			jdbc.update("UPDATE sessions SET expires_at = ? WHERE token_hash = ?", expiry(), th);
		}
		return new AuthUser(((Number) r.get("id")).longValue(), (String) r.get("username"), (String) r.get("name"), (String) r.get("role"));
	}
}
