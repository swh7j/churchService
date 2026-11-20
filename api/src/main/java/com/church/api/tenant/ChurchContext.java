package com.church.api.tenant;

import java.util.concurrent.Callable;

/** 지금 처리 중인 요청이 어느 교회 것인지 (교회 코드). 요청마다 ChurchFilter 가 정함 */
public final class ChurchContext {

	private static final ThreadLocal<String> CODE = new ThreadLocal<>();

	private ChurchContext() {
	}

	public static String get() {
		return CODE.get();
	}

	public static void set(String code) {
		if (code == null) CODE.remove();
		else CODE.set(code);
	}

	/** 요청 밖(자동 백업, 시작 시 준비 등)에서 특정 교회 DB로 작업할 때 */
	public static <T> T call(String code, Callable<T> work) {
		String prev = CODE.get();
		set(code);
		try {
			return work.call();
		} catch (RuntimeException e) {
			throw e;
		} catch (Exception e) {
			throw new IllegalStateException(e);
		} finally {
			set(prev);
		}
	}

	public static void run(String code, Runnable work) {
		call(code, () -> {
			work.run();
			return null;
		});
	}
}
