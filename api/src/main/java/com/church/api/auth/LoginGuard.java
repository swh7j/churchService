package com.church.api.auth;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/** 아이디별 로그인 실패 횟수 제한: 5번 실패하면 5분 잠금 (메모리에 보관) */
@Component
public class LoginGuard {

	private static final int MAX_FAILS = 5;
	private static final long LOCK_MS = 5 * 60_000L;

	private record State(int count, long until) {
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

	public void fail(String key) {
		fails.compute(key, (k, s) -> {
			int count = (s == null ? 0 : s.count) + 1;
			return new State(count, count >= MAX_FAILS ? System.currentTimeMillis() + LOCK_MS : 0);
		});
	}

	public void success(String key) {
		fails.remove(key);
	}
}
