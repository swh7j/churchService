package com.church.api.church;

import java.util.List;
import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.common.Api;
import com.church.api.common.ApiException;

/**
 * 예배 PPT. 서식 .pptx 를 보관하고, 채우기는 관리자 화면(브라우저)에서 합니다.
 * 찬송 제목(장 번호 → 제목)은 한 번 입력하면 다음에 자동으로 채우도록 settings 에 보관합니다.
 */
@RestController
@RequestMapping("/api/worship-ppt")
@PreAuthorize("hasAuthority('AREA_church')")
public class WorshipPptController {

	private static final MediaType PPTX = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.presentationml.presentation");
	private static final int MAX_BYTES = 40_000_000;
	private static final String HYMNS = "hymn_titles";

	private final JdbcTemplate jdbc;
	private final AuditService audit;

	public WorshipPptController(JdbcTemplate jdbc, AuditService audit) {
		this.jdbc = jdbc;
		this.audit = audit;
	}

	/** 올려 둔 서식 정보 (없으면 빈 값) */
	@GetMapping
	public Map<String, Object> info() {
		List<Map<String, Object>> r = jdbc.queryForList("SELECT name, length(file) AS size, updated_at FROM worship_ppt WHERE id = 1");
		return r.isEmpty() ? Map.of() : r.get(0);
	}

	@GetMapping("/file")
	public ResponseEntity<byte[]> file() {
		List<byte[]> r = jdbc.queryForList("SELECT file FROM worship_ppt WHERE id = 1", byte[].class);
		if (r.isEmpty()) throw ApiException.notFound("올린 서식 PPT가 없습니다.");
		return ResponseEntity.ok().contentType(PPTX).cacheControl(CacheControl.noCache().cachePrivate()).body(r.get(0));
	}

	/** 서식 바꾸기: 파일 내용을 그대로 body 로 받음 */
	@PutMapping(value = "/file", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
	public Map<String, Object> upload(@RequestParam String name, @RequestBody byte[] file) {
		if (file.length > MAX_BYTES) throw ApiException.bad("PPT 파일이 너무 큽니다. 찬송 악보 화면은 빼고 서식만 올려 주세요.");
		// .pptx 는 zip 파일 (PK 로 시작). 옛날 .ppt 는 여기서 걸러짐
		if (file.length < 4 || file[0] != 'P' || file[1] != 'K') throw ApiException.bad("파워포인트에서 'PowerPoint 프레젠테이션(*.pptx)'으로 저장한 파일을 올려 주세요.");
		String n = name.trim().isEmpty() ? "서식.pptx" : name.trim();
		if (n.length() > 200) n = n.substring(0, 200);
		jdbc.update("INSERT INTO worship_ppt (id, name, file, updated_at) VALUES (1, ?, ?, datetime('now','localtime')) "
				+ "ON CONFLICT(id) DO UPDATE SET name = excluded.name, file = excluded.file, updated_at = excluded.updated_at", n, file);
		audit.log("예배 PPT 서식 변경", "worship_ppt", 1L, Api.map("name", n, "size", file.length));
		return info();
	}

	@GetMapping("/hymns")
	public Map<String, Object> hymns() {
		List<String> r = jdbc.queryForList("SELECT value FROM settings WHERE key = ?", String.class, HYMNS);
		return Map.of("hymns", r.isEmpty() || r.get(0) == null ? "{}" : r.get(0));
	}

	/** 찬송 제목 모음 저장 ({"62":"고요히 머리숙여"} 형태의 JSON 문자열) */
	@PutMapping("/hymns")
	public Map<String, Object> saveHymns(@RequestBody Map<String, Object> body) {
		String s = Api.str(body.get("hymns"));
		if (!s.startsWith("{") || s.length() > 200_000) throw ApiException.bad("찬송 제목을 저장하지 못했습니다.");
		jdbc.update("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", HYMNS, s);
		return Map.of("ok", true);
	}
}
