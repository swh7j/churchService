package com.church.api.church;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.common.Api;
import com.church.api.common.ApiException;
import com.church.api.common.Uploads;
import com.church.api.tenant.ChurchRegistry;
import com.church.api.tenant.PlatformController;

/**
 * 예배 PPT. 서식 .pptx 를 보관하고, 채우기는 관리자 화면(브라우저)에서 합니다.
 * 찬송 제목(장 번호 → 제목)은 한 번 입력하면 다음에 자동으로 채우도록 settings 에 보관합니다.
 * 찬송가·교독문·찬양 화면은 공용 찬송가 보관함(SongLibrary, /api/library)에서 가져옵니다.
 */
@RestController
@RequestMapping("/api/worship-ppt")
@PreAuthorize("hasAuthority('AREA_church')")
public class WorshipPptController {

	private static final MediaType PPTX = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.presentationml.presentation");
	private static final int MAX_BYTES = 40_000_000;
	private static final String HYMNS = "hymn_titles";
	private static final int MAX_BG_BYTES = 8_000_000;

	private final JdbcTemplate jdbc;
	private final AuditService audit;
	private final ChurchRegistry churches;

	public WorshipPptController(JdbcTemplate jdbc, AuditService audit, ChurchRegistry churches) {
		this.jdbc = jdbc;
		this.audit = audit;
		this.churches = churches;
	}

	/** 공통 양식 (전체 관리자가 올린 기본 서식) 정보 */
	@GetMapping("/common")
	public Map<String, Object> common() {
		return PlatformController.commonInfo(churches);
	}

	/** 공통 양식 받기 */
	@GetMapping("/common/file")
	public ResponseEntity<byte[]> commonFile() {
		return PlatformController.commonFile(churches);
	}

	/** 올려 둔 서식 정보 (없으면 빈 값) */
	@GetMapping
	public Map<String, Object> info() {
		List<Map<String, Object>> r = jdbc.queryForList("SELECT name, length(file) AS size, updated_at FROM worship_ppt WHERE id = 1");
		Map<String, Object> m = r.isEmpty() ? new java.util.LinkedHashMap<>() : new java.util.LinkedHashMap<>(r.get(0));
		List<String> bg = jdbc.queryForList("SELECT updated_at FROM worship_ppt_bg WHERE id = 1", String.class);
		if (!bg.isEmpty()) m.put("background_at", bg.get(0));
		return m;
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
		// .pptx 는 zip 안에 파워포인트 파일들이 든 것. 옛날 .ppt 나 다른 zip 은 여기서 걸러짐
		Uploads.requirePptx(file, "파워포인트에서 'PowerPoint 프레젠테이션(*.pptx)'으로 저장한 파일을 올려 주세요.");
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

	/** 배경 그림 (올리지 않았으면 404) */
	@GetMapping("/background")
	public ResponseEntity<byte[]> background() {
		List<byte[]> r = jdbc.queryForList("SELECT file FROM worship_ppt_bg WHERE id = 1", byte[].class);
		if (r.isEmpty()) throw ApiException.notFound("올린 배경 그림이 없습니다.");
		byte[] f = r.get(0);
		MediaType type = f.length > 3 && (f[0] & 0xff) == 0x89 && f[1] == 'P' ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG;
		return ResponseEntity.ok().contentType(type).cacheControl(CacheControl.noCache().cachePrivate()).body(f);
	}

	/** 배경 그림 바꾸기: 그림 파일(jpg·png) 내용을 그대로 body 로 받음 */
	@PutMapping(value = "/background", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
	public Map<String, Object> uploadBackground(@RequestBody byte[] file) {
		if (file.length > MAX_BG_BYTES) throw ApiException.bad("그림 파일이 너무 큽니다.");
		Uploads.requireImage(file, Set.of(Uploads.JPEG, Uploads.PNG), "jpg 나 png 그림을 올려 주세요.");
		jdbc.update("INSERT INTO worship_ppt_bg (id, file, updated_at) VALUES (1, ?, datetime('now','localtime')) "
				+ "ON CONFLICT(id) DO UPDATE SET file = excluded.file, updated_at = excluded.updated_at", file);
		audit.log("예배 PPT 배경 변경", "worship_ppt_bg", 1L, Api.map("size", file.length));
		return info();
	}

	/** 만든 PPT 를 휴대폰 확인용 PDF 로: 화면에서 만든 .pptx 내용을 그대로 body 로 받음 (저장하지 않음) */
	@PostMapping(value = "/pdf", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
	public ResponseEntity<byte[]> pdf(@RequestBody byte[] file) {
		if (file.length > MAX_BYTES) throw ApiException.bad("PPT 파일이 너무 큽니다.");
		Uploads.requirePptx(file, ".pptx 파일이 아닙니다.");
		return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).cacheControl(CacheControl.noStore()).body(PptPdf.render(file));
	}

	/** 배경 그림 빼기 (서식에 들어 있는 원래 배경으로) */
	@DeleteMapping("/background")
	public Map<String, Object> deleteBackground() {
		if (jdbc.update("DELETE FROM worship_ppt_bg WHERE id = 1") > 0) audit.log("예배 PPT 배경 삭제", "worship_ppt_bg", 1L, Map.of());
		return info();
	}
}
