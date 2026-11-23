package com.church.api.church;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.common.Api;
import com.church.api.common.ApiException;
import com.church.api.tenant.ChurchRegistry;
import com.church.api.tenant.PlatformController;

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

	// ── 끼워 넣을 화면 (찬송 악보 / 교독문) ──

	private static final int MAX_INSERT = 30_000_000;

	private static String kind(String k) {
		if (!k.equals("hymn") && !k.equals("reading")) throw ApiException.bad("종류가 올바르지 않습니다.");
		return k;
	}

	private static String no(String n) {
		if (!n.matches("\\d{1,4}")) throw ApiException.bad("번호가 올바르지 않습니다.");
		return String.valueOf(Integer.parseInt(n));
	}

	/** 저장해 둔 악보·교독문 목록 */
	@GetMapping("/inserts")
	public List<Map<String, Object>> inserts() {
		return jdbc.queryForList("SELECT kind, no, count, length(file) AS size, updated_at FROM ppt_inserts ORDER BY kind, CAST(no AS INTEGER)");
	}

	@GetMapping("/inserts/{kind}/{no}")
	public ResponseEntity<byte[]> insertFile(@PathVariable String kind, @PathVariable String no) {
		List<byte[]> r = jdbc.queryForList("SELECT file FROM ppt_inserts WHERE kind = ? AND no = ?", byte[].class, kind(kind), no(no));
		if (r.isEmpty()) throw ApiException.notFound("저장된 화면이 없습니다.");
		return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/zip")).cacheControl(CacheControl.noCache().cachePrivate()).body(r.get(0));
	}

	/** 화면 저장: 그림(jpg/png)들을 담은 zip 을 body 로 받음 */
	@PutMapping(value = "/inserts/{kind}/{no}", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
	public Map<String, Object> saveInsert(@PathVariable String kind, @PathVariable String no, @RequestBody byte[] file) {
		return store(kind(kind), no(no), file);
	}

	/** 옛날 파워포인트(.ppt) 그대로 올리기: 서버에서 슬라이드마다 그림을 꺼내 저장 (찬송가 보관함) */
	@PutMapping(value = "/inserts/{kind}/{no}/ppt", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
	public Map<String, Object> saveInsertPpt(@PathVariable String kind, @PathVariable String no, @RequestBody byte[] ppt) {
		String k = kind(kind), n = no(no);
		if (ppt.length > MAX_INSERT) throw ApiException.bad("PPT 파일이 너무 큽니다.");
		PptImages.Result r = PptImages.toZip(ppt);
		Map<String, Object> saved = new java.util.LinkedHashMap<>(store(k, n, r.zip()));
		saved.put("skipped", r.skipped());
		return saved;
	}

	private Map<String, Object> store(String k, String n, byte[] file) {
		if (file.length > MAX_INSERT) throw ApiException.bad("그림이 너무 큽니다. 화면 수를 줄이거나 작은 그림으로 올려 주세요.");
		int count = countImages(file);
		if (count == 0) throw ApiException.bad("그림이 없습니다.");
		if (count > 40) throw ApiException.bad("화면은 40장까지 넣을 수 있습니다.");
		jdbc.update("INSERT INTO ppt_inserts (kind, no, count, file, updated_at) VALUES (?, ?, ?, ?, datetime('now','localtime')) "
				+ "ON CONFLICT(kind, no) DO UPDATE SET count = excluded.count, file = excluded.file, updated_at = excluded.updated_at", k, n, count, file);
		audit.log(k.equals("hymn") ? "찬송 악보 저장" : "교독문 저장", "ppt_inserts", Long.valueOf(n), Api.map("count", count, "size", file.length));
		return Map.of("kind", k, "no", n, "count", count);
	}

	@DeleteMapping("/inserts/{kind}/{no}")
	public Map<String, Object> deleteInsert(@PathVariable String kind, @PathVariable String no) {
		String k = kind(kind), n = no(no);
		jdbc.update("DELETE FROM ppt_inserts WHERE kind = ? AND no = ?", k, n);
		audit.log(k.equals("hymn") ? "찬송 악보 삭제" : "교독문 삭제", "ppt_inserts", Long.valueOf(n), Map.of());
		return Map.of("ok", true);
	}

	/** zip 안의 그림 수 (jpg/png 만, 폴더·다른 파일이 있으면 거절) */
	private static int countImages(byte[] file) {
		if (file.length < 4 || file[0] != 'P' || file[1] != 'K') throw ApiException.bad("화면 파일 형식이 올바르지 않습니다.");
		int count = 0;
		try (ZipInputStream z = new ZipInputStream(new ByteArrayInputStream(file))) {
			for (ZipEntry e; (e = z.getNextEntry()) != null;) {
				if (!e.getName().matches("\\d{3}\\.(jpg|jpeg|png)")) throw ApiException.bad("jpg, png 그림만 넣을 수 있습니다.");
				count++;
			}
		} catch (IOException e) {
			throw ApiException.bad("화면 파일을 읽지 못했습니다.");
		}
		return count;
	}
}
