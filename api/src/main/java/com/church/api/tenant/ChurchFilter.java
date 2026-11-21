package com.church.api.tenant;

import java.io.IOException;

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
 */
public class ChurchFilter extends OncePerRequestFilter {

	public static final String HEADER = "X-Church";
	public static final String PARAM = "church";

	private final ChurchRegistry registry;

	public ChurchFilter(ChurchRegistry registry) {
		this.registry = registry;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
		String uri = req.getRequestURI();
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
