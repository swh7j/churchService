package com.church.api.auth;

import java.util.List;
import java.util.Map;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * 역할과 사용 영역.
 * - admin(관리자): 모든 영역
 * - finance(재정 담당): 재정 영역
 * - staff(교역자·사역 담당): 교회(교인·출석·소식) 영역
 * 각 영역은 Spring Security 권한 "AREA_admin", "AREA_finance", "AREA_church" 로 표현됩니다.
 */
public final class Roles {

	private Roles() {
	}

	public static final Map<String, String> LABELS = Map.of("admin", "관리자", "finance", "재정 담당", "staff", "교역자·사역 담당");

	private static final Map<String, List<String>> AREAS = Map.of(
			"admin", List.of("admin", "finance", "church"),
			"finance", List.of("finance"),
			"staff", List.of("church"));

	public static String label(String role) {
		return LABELS.getOrDefault(role, role);
	}

	public static boolean valid(String role) {
		return role != null && LABELS.containsKey(role);
	}

	public static List<String> areas(String role) {
		return AREAS.getOrDefault(role, List.of());
	}

	public static boolean has(AuthUser u, String area) {
		return u != null && areas(u.role()).contains(area);
	}

	/** 현재 로그인한 사용자 (없으면 null) */
	public static AuthUser current() {
		Authentication a = SecurityContextHolder.getContext().getAuthentication();
		return a != null && a.getPrincipal() instanceof AuthUser u ? u : null;
	}

	public static void require(boolean allowed) {
		if (!allowed) throw new AccessDeniedException("forbidden");
	}
}
