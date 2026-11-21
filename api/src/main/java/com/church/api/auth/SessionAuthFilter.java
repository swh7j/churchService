package com.church.api.auth;

import java.io.IOException;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import com.church.api.tenant.ChurchContext;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** 요청마다 sid 쿠키로 사용자를 찾아 SecurityContext 에 넣습니다. (SecurityConfig 에서 등록) */
public class SessionAuthFilter extends OncePerRequestFilter {

	private final SessionService sessions;

	public SessionAuthFilter(SessionService sessions) {
		this.sessions = sessions;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
		// 교회가 정해진 요청만 (전체 관리자 페이지는 따로 로그인)
		if (req.getRequestURI().startsWith("/api/") && ChurchContext.get() != null) {
			AuthUser u = sessions.current(req);
			if (u != null) {
				var authorities = Roles.areas(u.role()).stream().map(a -> new SimpleGrantedAuthority("AREA_" + a)).toList();
				SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(u, null, authorities));
			}
		}
		chain.doFilter(req, res);
	}
}
