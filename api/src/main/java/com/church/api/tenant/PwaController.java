package com.church.api.tenant;

import java.util.List;
import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.common.Api;
import com.church.api.tenant.ChurchRegistry.Church;

/**
 * 휴대폰 홈 화면 앱(PWA) 정보. 교회마다 이름·시작 주소가 달라서 주소별로 만들어 줌.
 *  - 성도 앱  : /c/{교회}/manifest.webmanifest       → /c/{교회}/ 로 열림, 파란 아이콘
 *  - 관리자 앱: /c/{교회}/admin/manifest.webmanifest → /c/{교회}/admin/ 로 열림, 남색 '관리' 아이콘
 * 로그인 없이 받을 수 있음 (교회 이름은 교회 선택 화면에도 공개된 정보)
 */
@RestController
public class PwaController {

	private static final MediaType MANIFEST = MediaType.parseMediaType("application/manifest+json;charset=UTF-8");

	private final ChurchRegistry churches;

	public PwaController(ChurchRegistry churches) {
		this.churches = churches;
	}

	@GetMapping("/c/{code}/manifest.webmanifest")
	public ResponseEntity<Map<String, Object>> member(@PathVariable String code) {
		return manifest(code, false);
	}

	@GetMapping("/c/{code}/admin/manifest.webmanifest")
	public ResponseEntity<Map<String, Object>> admin(@PathVariable String code) {
		return manifest(code, true);
	}

	private ResponseEntity<Map<String, Object>> manifest(String code, boolean admin) {
		Church c = churches.find(code);
		if (c == null || !c.active()) return ResponseEntity.notFound().build();
		String base = "/c/" + c.code() + (admin ? "/admin/" : "/");
		String name = admin ? c.name() + " 관리" : c.name();
		String icon = admin ? "admin" : "member";
		Map<String, Object> m = Api.map(
				"id", base,
				"name", name,
				// 홈 화면 아이콘 아래 이름 (길면 잘림)
				"short_name", admin ? shortName(c.name(), 6) + " 관리" : shortName(c.name(), 10),
				"description", admin ? c.name() + " 교회 관리 (재정·교인·주보)" : c.name() + " 소식·주보·행사",
				"lang", "ko",
				"start_url", base,
				"scope", base,
				"display", "standalone",
				"background_color", admin ? "#f4f5f7" : "#f6f4ef",
				"theme_color", "#1b2440",
				"icons", List.of(
						icon(icon + "-192.png", "192x192", "any"),
						icon(icon + "-512.png", "512x512", "any"),
						icon(icon + "-maskable-512.png", "512x512", "maskable")));
		return ResponseEntity.ok().contentType(MANIFEST).cacheControl(CacheControl.noCache()).body(m);
	}

	private static String shortName(String s, int max) {
		return s.length() <= max ? s : s.substring(0, max);
	}

	private static Map<String, Object> icon(String file, String sizes, String purpose) {
		return Api.map("src", "/icons/" + file, "sizes", sizes, "type", "image/png", "purpose", purpose);
	}
}
