package com.church.api.tenant;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;

import com.church.api.common.Json;
import com.church.api.tenant.ChurchRegistry.Church;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * API 요청마다 어느 교회 것인지 정합니다. 로그인 확인(Spring Security)보다 먼저 실행.
 * - 화면에서 보내는 X-Church 헤더 (fetch)
 * - 또는 주소의 ?church= (사진·파일 받기 링크처럼 헤더를 못 붙이는 경우)
 * 정한 교회는 ChurchContext(ThreadLocal)에 두고, 요청이 끝나면 finally 에서 꼭 지웁니다 (톰캣 스레드는 재사용되므로).
 * 비동기(@Async, CompletableFuture 등)로 넘기는 작업은 새 스레드에 교회 값이 없으니 ChurchContext.run(code, …) 으로 감쌀 것.
 */
public class ChurchFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(ChurchFilter.class);

	public static final String HEADER = "X-Church";
	public static final String PARAM = "church";

	private final ChurchRegistry registry;

	public ChurchFilter(ChurchRegistry registry) {
		this.registry = registry;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
		String uri = req.getRequestURI();
		// 앞 요청의 교회 값이 남아 있으면 어딘가에서 정리가 빠진 것 → 경고하고 지움 (다른 교회 DB로 새지 않게)
		if (ChurchContext.get() != null) {
			log.warn("앞 요청의 교회 정보가 남아 있어 지웠습니다: {} ({})", ChurchContext.get(), uri);
			ChurchContext.set(null);
		}
		// 교회 목록(선택 화면)은 교회와 상관없음
		if (!uri.startsWith("/api/") || uri.equals("/api/churches")) {
			chain.doFilter(req, res);
			return;
		}
		String code = req.getHeader(HEADER);
		if (code == null || code.isBlank()) code = req.getParameter(PARAM);
		Church c = registry.find(code);
		// 전체 관리자 페이지는 교회와 상관없음 (첫 계정을 만들 때만 운영 교회 정보를 같이 보냄)
		if (uri.startsWith("/api/platform/") && (c == null || !c.active())) {
			chain.doFilter(req, res);
			return;
		}
		if (c == null || !c.active()) {
			res.setStatus(c == null ? 400 : 403);
			res.setContentType("application/json;charset=UTF-8");
			res.getWriter().write("{\"error\":" + Json.quote(c == null ? "교회를 먼저 선택해 주세요." : "사용이 중지된 교회입니다.") + "}");
			return;
		}
		ChurchContext.set(c.code());
		try {
			chain.doFilter(req, res);
		} finally {
			ChurchContext.set(null);
		}
	}
}
