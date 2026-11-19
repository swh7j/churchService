package com.church.api.common;

/** 사용자에게 그대로 보여줄 메시지를 담은 예외. {"error": message} 로 응답됩니다. */
public class ApiException extends RuntimeException {

	private final int status;

	public ApiException(int status, String message) {
		super(message);
		this.status = status;
	}

	public int status() {
		return status;
	}

	public static ApiException bad(String message) {
		return new ApiException(400, message);
	}

	public static ApiException notFound(String message) {
		return new ApiException(404, message);
	}
}
