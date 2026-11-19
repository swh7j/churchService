package com.church.api.common;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** 모든 오류를 {"error": "사용자가 이해할 수 있는 문장"} 형태로 응답 */
@RestControllerAdvice
public class GlobalExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	private static ResponseEntity<Map<String, String>> error(int status, String message) {
		return ResponseEntity.status(status).body(Map.of("error", message));
	}

	@ExceptionHandler(ApiException.class)
	public ResponseEntity<Map<String, String>> api(ApiException e) {
		return error(e.status(), e.getMessage());
	}

	@ExceptionHandler(AccessDeniedException.class)
	public ResponseEntity<Map<String, String>> denied(AccessDeniedException e) {
		return error(403, "이 기능을 사용할 권한이 없습니다.");
	}

	@ExceptionHandler(NoResourceFoundException.class)
	public ResponseEntity<Map<String, String>> noResource(NoResourceFoundException e) {
		return error(404, "없는 API입니다.");
	}

	@ExceptionHandler({ HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class })
	public ResponseEntity<Map<String, String>> badRequest(Exception e) {
		return error(400, "잘못된 요청입니다.");
	}

	// DB 제약 조건 위반 등 → 이해하기 쉬운 문장으로
	@ExceptionHandler(Exception.class)
	public ResponseEntity<Map<String, String>> other(Exception e) {
		StringBuilder chain = new StringBuilder();
		for (Throwable t = e; t != null; t = t.getCause()) chain.append(t.getMessage()).append(' ');
		String m = chain.toString();
		if (m.contains("FOREIGN KEY")) return error(400, "다른 데이터에서 사용 중인 항목이라 삭제하거나 변경할 수 없습니다.");
		if (m.contains("NOT NULL")) return error(400, "필수 항목을 입력해 주세요.");
		if (m.contains("CHECK constraint")) return error(400, "입력값을 확인해 주세요. (금액은 0보다 커야 합니다)");
		if (m.contains("UNIQUE")) return error(400, "이미 같은 이름(아이디)이 있습니다.");
		log.error("처리하지 못한 오류", e);
		return error(500, "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
	}
}
