package com.church.api.tenant;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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

import com.church.api.common.ApiException;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 전체 관리자 로그인 (교회 계정과 완전히 별도). 계정·세션은 platform.db 에 저장, 쿠키 이름은 psid.
 */
@Service
public class PlatformAuth {

	public record PlatformUser(long id, String username, String name) {
		public Map<String, Object> toPublic() {
			return Map.of("id", id, "username", username, "name", name);
		}
	}

	private static final String COOKIE = "psid";
	private static final Duration TTL = Duration.ofHours(8);
	private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);
	private static final SecureRandom RNG = new SecureRandom();

	private final JdbcTemplate jdbc;
	private final boolean forceSecure;

	public PlatformAuth(ChurchRegistry registry, @Value("${app.cookie-secure}") boolean forceSecure) {
		this.jdbc = registry.platformJdbc();
		this.forceSecure = forceSecure;
		jdbc.execute("""
				CREATE TABLE IF NOT EXISTS platform_users (
				  id INTEGER PRIMARY KEY AUTOINCREMENT,
				  username TEXT NOT NULL UNIQUE,
				  name TEXT NOT NULL,
				  password_hash TEXT NOT NULL,
				  active INTEGER NOT NULL DEFAULT 1,
				  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
				  last_login TEXT
				)""");
		jdbc.execute("""
				CREATE TABLE IF NOT EXISTS platform_sessions (
				  token_hash TEXT PRIMARY KEY,
				  user_id INTEGER NOT NULL,
				  expires_at TEXT NOT NULL
				)""");
	}

	public JdbcTemplate jdbc() {
		return jdbc;
	}

	public int userCount() {
		return jdbc.queryForObject("SELECT COUNT(*) FROM platform_users", Integer.class);
	}

	private static String now() {
		return ISO.format(Instant.now());
	}

	private static String sha256(String s) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	private static String readToken(HttpServletRequest req) {
		Cookie[] cookies = req.getCookies();
		if (cookies == null) return null;
		for (Cookie c : cookies) if (COOKIE.equals(c.getName())) return c.getValue();
		return null;
	}

	public void start(HttpServletRequest req, HttpServletResponse res, long userId) {
		byte[] b = new byte[32];
		RNG.nextBytes(b);
		String token = HexFormat.of().formatHex(b);
		jdbc.update("INSERT INTO platform_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", sha256(token), userId, ISO.format(Instant.now().plus(TTL)));
		jdbc.update("UPDATE platform_users SET last_login = datetime('now','localtime') WHERE id = ?", userId);
		jdbc.update("DELETE FROM platform_sessions WHERE expires_at < ?", now());
		res.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(COOKIE, token).httpOnly(true).sameSite("Strict")
				.secure(req.isSecure() || forceSecure).path("/").build().toString());
	}

	public void end(HttpServletRequest req, HttpServletResponse res) {
		String token = readToken(req);
		if (token != null) jdbc.update("DELETE FROM platform_sessions WHERE token_hash = ?", sha256(token));
		res.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(COOKIE, "").path("/").maxAge(0).build().toString());
	}

	public void endAllFor(long userId) {
		jdbc.update("DELETE FROM platform_sessions WHERE user_id = ?", userId);
	}

	/** 로그인한 전체 관리자 (없거나 만료·중지면 null) */
	public PlatformUser current(HttpServletRequest req) {
		String token = readToken(req);
		if (token == null) return null;
		String th = sha256(token);
		List<Map<String, Object>> rows = jdbc.queryForList(
				"SELECT u.id, u.username, u.name, u.active, s.expires_at FROM platform_sessions s JOIN platform_users u ON u.id = s.user_id WHERE s.token_hash = ?", th);
		if (rows.isEmpty()) return null;
		Map<String, Object> r = rows.get(0);
		if (((Number) r.get("active")).intValue() == 0 || ((String) r.get("expires_at")).compareTo(now()) < 0) {
			jdbc.update("DELETE FROM platform_sessions WHERE token_hash = ?", th);
			return null;
		}
		if (((String) r.get("expires_at")).compareTo(ISO.format(Instant.now().plus(TTL.dividedBy(2)))) < 0)
			jdbc.update("UPDATE platform_sessions SET expires_at = ? WHERE token_hash = ?", ISO.format(Instant.now().plus(TTL)), th);
		return new PlatformUser(((Number) r.get("id")).longValue(), (String) r.get("username"), (String) r.get("name"));
	}

	public PlatformUser require(HttpServletRequest req) {
		PlatformUser u = current(req);
		if (u == null) throw new ApiException(401, "전체 관리자 로그인이 필요합니다.");
		return u;
	}
}
