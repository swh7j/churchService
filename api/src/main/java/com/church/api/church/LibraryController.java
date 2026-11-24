package com.church.api.church;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.common.Api;
import com.church.api.tenant.PlatformAuth;
import com.church.api.tenant.PlatformAuth.PlatformUser;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 공용 찬송가 보관함 (SongLibrary).
 * - 교회 관리자: 목록 보기·화면 받기 (예배 PPT 에 넣을 때) — /api/library
 * - 전체 관리자: 올리기·지우기·제목 고치기 — /api/platform/library
 */
@RestController
public class LibraryController {

	private static final Logger log = LoggerFactory.getLogger(LibraryController.class);
	private static final MediaType ZIP = MediaType.parseMediaType("application/zip");

	private final SongLibrary lib;
	private final PlatformAuth auth;

	public LibraryController(SongLibrary lib, PlatformAuth auth) {
		this.lib = lib;
		this.auth = auth;
	}

	private ResponseEntity<byte[]> zip(String kind, String key) {
		try {
			return ResponseEntity.ok().contentType(ZIP).cacheControl(CacheControl.noCache().cachePrivate()).body(Files.readAllBytes(lib.file(kind, key)));
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	// ---------- 교회 관리자 (가져다 쓰기만) ----------

	@GetMapping("/api/library")
	@PreAuthorize("hasAuthority('AREA_church')")
	public List<Map<String, Object>> list() {
		return lib.list();
	}

	@GetMapping("/api/library/{kind}/{key}/file")
	@PreAuthorize("hasAuthority('AREA_church')")
	public ResponseEntity<byte[]> file(@PathVariable String kind, @PathVariable String key) {
		return zip(kind, key);
	}

	// ---------- 전체 관리자 ----------

	@GetMapping("/api/platform/library")
	public List<Map<String, Object>> platformList(HttpServletRequest req) {
		auth.require(req);
		return lib.list();
	}

	@GetMapping("/api/platform/library/{kind}/{key}/file")
	public ResponseEntity<byte[]> platformFile(@PathVariable String kind, @PathVariable String key, HttpServletRequest req) {
		auth.require(req);
		return zip(kind, key);
	}

	/** 그림(jpg/png)들을 담은 zip 저장 */
	@PutMapping(value = "/api/platform/library/{kind}", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
	public Map<String, Object> save(@PathVariable String kind, @RequestParam(required = false) String no, @RequestParam(required = false) String title,
			@RequestBody byte[] zip, HttpServletRequest req) {
		PlatformUser me = auth.require(req);
		Map<String, Object> r = lib.save(SongLibrary.kind(kind), no, title, zip);
		log.info("[전체 관리자] {} 공용 보관함 저장 {} {}", me.username(), kind, r.get("key"));
		return r;
	}

	/** 옛날 파워포인트(.ppt): 서버에서 슬라이드마다 그림을 꺼내 저장 */
	@PutMapping(value = "/api/platform/library/{kind}/ppt", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
	public Map<String, Object> savePpt(@PathVariable String kind, @RequestParam(required = false) String no, @RequestParam(required = false) String title,
			@RequestBody byte[] ppt, HttpServletRequest req) {
		PlatformUser me = auth.require(req);
		String k = SongLibrary.kind(kind);
		SongLibrary.key(k, no, title); // 번호·제목부터 확인 (변환 전에)
		if (ppt.length > SongLibrary.MAX_ZIP) throw com.church.api.common.ApiException.bad("PPT 파일이 너무 큽니다.");
		PptImages.Result p = PptImages.toZip(ppt);
		Map<String, Object> r = new LinkedHashMap<>(lib.save(k, no, title, p.zip()));
		r.put("skipped", p.skipped());
		log.info("[전체 관리자] {} 공용 보관함 저장 {} {}", me.username(), kind, r.get("key"));
		return r;
	}

	/** 제목 바꾸기 (찬송가·교독문) */
	@PutMapping("/api/platform/library/{kind}/{key}/title")
	public Map<String, Object> rename(@PathVariable String kind, @PathVariable String key, @RequestBody Map<String, Object> body, HttpServletRequest req) {
		auth.require(req);
		return lib.rename(kind, key, Api.str(body.get("title")));
	}

	@DeleteMapping("/api/platform/library/{kind}/{key}")
	public Map<String, Object> delete(@PathVariable String kind, @PathVariable String key, HttpServletRequest req) {
		PlatformUser me = auth.require(req);
		lib.delete(kind, key);
		log.info("[전체 관리자] {} 공용 보관함 삭제 {} {}", me.username(), kind, key);
		return Map.of("ok", true);
	}
}
