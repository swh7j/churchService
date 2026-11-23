package com.church.api.auth;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * 로그인 실패 횟수 제한 (메모리에 보관). 남이 일부러 틀려서 관리자를 잠그지 못하도록 '아이디+접속 IP' 기준으로 잠그고,
 * 한 IP에서 여러 아이디를 돌려 가며 시도하거나, 여러 IP에서 한 아이디를 노리는 것도 따로 막습니다.
 *
 *  - 아이디+IP : 5번 실패 → 5분 잠금 (보통 사용자가 비밀번호를 틀렸을 때)
 *  - IP 전체   : 20번 실패 → 15분 잠금 (한 곳에서 여러 아이디 시도)
 *  - 아이디 전체: 30번 실패 → 15분 잠금 (여러 곳에서 한 아이디 시도)
 *  실패 기록은 1시간이 지나면 처음부터 다시 셉니다.
 */
@Component
public class LoginGuard {

	public record Rule(int max, long lockMs) {
	}

	public static final Rule USER_IP = new Rule(5, 5 * 60_000L);
	public static final Rule IP = new Rule(20, 15 * 60_000L);
	public static final Rule USER = new Rule(30, 15 * 60_000L);
	private static final long WINDOW_MS = 60 * 60_000L;
	private static final int PRUNE_OVER = 5_000;

	private record State(int count, long first, long until) {
	}

	private final Map<String, State> fails = new ConcurrentHashMap<>();

	/** 잠겨 있으면 남은 분, 아니면 0 */
	public int lockedMinutes(String key) {
		State s = fails.get(key);
		if (s == null || s.until == 0) return 0;
		long left = s.until - System.currentTimeMillis();
		if (left <= 0) {
			fails.remove(key);
			return 0;
		}
		return (int) Math.ceil(left / 60000.0);
	}

	/** 여러 기준 중 하나라도 잠겨 있으면 가장 긴 남은 분 */
	public int lockedMinutes(String... keys) {
		int m = 0;
		for (String k : keys) m = Math.max(m, lockedMinutes(k));
		return m;
	}

	/** 실패 기록 (기본: 5번 → 5분) */
	public void fail(String key) {
		fail(key, USER_IP);
	}

	public void fail(String key, Rule rule) {
		long now = System.currentTimeMillis();
		fails.compute(key, (k, s) -> {
			if (s == null || now - s.first > WINDOW_MS) s = new State(0, now, 0);
			int count = s.count + 1;
			return new State(count, s.first, count >= rule.max ? now + rule.lockMs : 0);
		});
		if (fails.size() > PRUNE_OVER) prune(now);
	}

	public void success(String... keys) {
		for (String k : keys) fails.remove(k);
	}

	/** 오래된 기록 정리 (메모리가 계속 늘지 않게) */
	private void prune(long now) {
		fails.entrySet().removeIf(e -> e.getValue().until < now && now - e.getValue().first > WINDOW_MS);
	}

	/** 로그인 한 번의 실패 기준들: [아이디+IP, IP, 아이디] */
	public static String[] keys(String scope, String username, String ip) {
		String u = scope + ":" + username.toLowerCase();
		return new String[] { u + "@" + ip, "ip:" + ip, u };
	}

	/** keys() 로 만든 기준들에 실패 기록 */
	public void failLogin(String[] keys) {
		fail(keys[0], USER_IP);
		fail(keys[1], IP);
		fail(keys[2], USER);
	}
}
