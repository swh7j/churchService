package com.church.api.config;

import java.io.IOException;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import com.church.api.auth.SessionAuthFilter;
import com.church.api.auth.SessionService;
import com.church.api.common.Json;

import jakarta.servlet.http.HttpServletResponse;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity // @PreAuthorize 사용
public class SecurityConfig {

	/**
	 * 보안 헤더(CSP). 스크립트·연결은 이 서버만, 그림은 사진 미리보기용 data:/blob: 도 허용,
	 * 스타일은 화면에서 쓰는 style 속성·인쇄 설정 때문에 inline 허용, 다른 사이트 안에 넣는 것(frame) 금지
	 */
	static final String CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
			+ "font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; "
			+ "form-action 'self'; frame-ancestors 'none'";

	@Bean
	public SecurityFilterChain filterChain(HttpSecurity http, SessionService sessions) throws Exception {
		http
				// 쿠키가 SameSite=Lax 이고 API가 JSON만 받으므로 CSRF 토큰은 사용하지 않음
				.csrf(c -> c.disable())
				.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				// 화면 공격(XSS)이 생겨도 다른 곳의 스크립트를 불러오거나 정보를 빼돌리지 못하게: 우리 서버 것만 허용
				.headers(h -> h.contentSecurityPolicy(c -> c.policyDirectives(CSP)))
				.httpBasic(b -> b.disable())
				.formLogin(f -> f.disable())
				.logout(l -> l.disable())
				.authorizeHttpRequests(a -> a
						.requestMatchers("/api/auth/me", "/api/auth/setup", "/api/auth/login", "/api/auth/logout").permitAll()
						.requestMatchers(HttpMethod.GET, "/api/public/**").permitAll() // 성도 화면 (조회만)
						.requestMatchers(HttpMethod.GET, "/api/churches").permitAll() // 교회 선택 화면
						.requestMatchers("/api/platform/**").permitAll() // 전체 관리자 페이지: 자체 로그인(PlatformAuth)으로 확인
						// 성도 화면 익명 기도제목: 작성, 비밀번호로 삭제
						.requestMatchers(HttpMethod.POST, "/api/public/prayers", "/api/public/prayers/*/delete").permitAll()
						.requestMatchers("/api/**").authenticated()
						.anyRequest().permitAll()) // 화면 파일
				.exceptionHandling(e -> e
						.authenticationEntryPoint((req, res, ex) -> error(res, 401, "로그인이 필요합니다."))
						.accessDeniedHandler((req, res, ex) -> error(res, 403, "이 기능을 사용할 권한이 없습니다.")))
				.addFilterBefore(new SessionAuthFilter(sessions), UsernamePasswordAuthenticationFilter.class);
		return http.build();
	}

	// Spring Boot 기본 계정(콘솔에 출력되는 임시 비밀번호)을 만들지 않도록
	@Bean
	public UserDetailsService noDefaultUser() {
		return username -> {
			throw new UsernameNotFoundException(username);
		};
	}

	private static void error(HttpServletResponse res, int status, String message) throws IOException {
		res.setStatus(status);
		res.setContentType("application/json;charset=UTF-8");
		res.getWriter().write("{\"error\":" + Json.quote(message) + "}");
	}
}
