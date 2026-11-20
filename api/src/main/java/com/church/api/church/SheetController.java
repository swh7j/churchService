package com.church.api.church;

import java.util.Base64;
import java.util.List;
import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.common.Api;
import com.church.api.common.ApiException;

/**
 * 악보. 관리자 화면에서 여러 장을 세로로 이어 붙여 JPEG 한 장으로 올리고, 성도 화면에서 봅니다.
 * 사진은 DB(BLOB)에 넣어서 백업·복원에 같이 들어갑니다.
 */
@RestController
public class SheetController {

	private static final String COLS = "id, date, title, pages, is_public, updated_at, length(image) AS size";
	private static final String DATA_URL = "data:image/jpeg;base64,";
	private static final int MAX_BYTES = 8_000_000;

	private final JdbcTemplate jdbc;
	private final AuditService audit;

	public SheetController(JdbcTemplate jdbc, AuditService audit) {
		this.jdbc = jdbc;
		this.audit = audit;
	}

	// ---------- 성도 화면 (공개한 악보만) ----------

	@GetMapping("/api/public/sheets")
	public List<Map<String, Object>> publicList() {
		return jdbc.queryForList("SELECT " + COLS + " FROM sheets WHERE is_public = 1 ORDER BY date DESC, id DESC LIMIT 200");
	}

	@GetMapping("/api/public/sheets/{id}")
	public Map<String, Object> publicOne(@PathVariable long id) {
		return one(id, true);
	}

	@GetMapping("/api/public/sheets/{id}/image")
	public ResponseEntity<byte[]> publicImage(@PathVariable long id) {
		return image(id, true);
	}

	// ---------- 관리자 화면 (교역자·사역 담당·관리자) ----------

	@GetMapping("/api/sheets")
	@PreAuthorize("hasAuthority('AREA_church')")
	public List<Map<String, Object>> list() {
		return jdbc.queryForList("SELECT " + COLS + " FROM sheets ORDER BY date DESC, id DESC");
	}

	@GetMapping("/api/sheets/{id}/image")
	@PreAuthorize("hasAuthority('AREA_church')")
	public ResponseEntity<byte[]> adminImage(@PathVariable long id) {
		return image(id, false);
	}

	@PostMapping("/api/sheets")
	@PreAuthorize("hasAuthority('AREA_church')")
	public Map<String, Object> create(@RequestBody Map<String, Object> body) {
		byte[] img = decode(body.get("image"));
		if (img == null) throw ApiException.bad("악보 사진을 골라 주세요.");
		jdbc.update("INSERT INTO sheets (date, title, pages, is_public, image) VALUES (?, ?, ?, ?, ?)",
				date(body), title(body), pages(body), isPublic(body), img);
		Long id = jdbc.queryForObject("SELECT last_insert_rowid()", Long.class);
		audit.log("악보 등록", "sheets", id, Api.map("title", title(body), "date", date(body), "pages", pages(body), "size", img.length));
		return one(id, false);
	}

	/** 제목·날짜·공개 여부 수정. image 를 보내면 사진도 바꿈 */
	@PutMapping("/api/sheets/{id}")
	@PreAuthorize("hasAuthority('AREA_church')")
	public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> body) {
		one(id, false);
		byte[] img = decode(body.get("image"));
		if (img == null) {
			jdbc.update("UPDATE sheets SET date = ?, title = ?, is_public = ?, updated_at = datetime('now','localtime') WHERE id = ?",
					date(body), title(body), isPublic(body), id);
		} else {
			jdbc.update("UPDATE sheets SET date = ?, title = ?, is_public = ?, pages = ?, image = ?, updated_at = datetime('now','localtime') WHERE id = ?",
					date(body), title(body), isPublic(body), pages(body), img, id);
		}
		audit.log("악보 수정", "sheets", id, Api.map("title", title(body), "date", date(body), "newImage", img != null));
		return one(id, false);
	}

	@DeleteMapping("/api/sheets/{id}")
	@PreAuthorize("hasAuthority('AREA_church')")
	public Map<String, Object> delete(@PathVariable long id) {
		Map<String, Object> row = one(id, false);
		jdbc.update("DELETE FROM sheets WHERE id = ?", id);
		audit.log("악보 삭제", "sheets", id, row);
		return Api.map("ok", true);
	}

	// ---------- 공통 ----------

	private Map<String, Object> one(long id, boolean publicOnly) {
		List<Map<String, Object>> r = jdbc.queryForList("SELECT " + COLS + " FROM sheets WHERE id = ?" + (publicOnly ? " AND is_public = 1" : ""), id);
		if (r.isEmpty()) throw ApiException.notFound("없는 악보입니다.");
		return r.get(0);
	}

	private ResponseEntity<byte[]> image(long id, boolean publicOnly) {
		List<byte[]> r = jdbc.queryForList("SELECT image FROM sheets WHERE id = ?" + (publicOnly ? " AND is_public = 1" : ""), byte[].class, id);
		if (r.isEmpty()) throw ApiException.notFound("없는 악보입니다.");
		// 주소에 ?v=수정시각 을 붙여 부르므로 바뀌면 새로 받음
		CacheControl cache = publicOnly ? CacheControl.maxAge(java.time.Duration.ofDays(1)) : CacheControl.noCache().cachePrivate();
		return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).cacheControl(cache).body(r.get(0));
	}

	private static byte[] decode(Object o) {
		String s = Api.str(o);
		if (s.isEmpty()) return null;
		if (!s.startsWith(DATA_URL)) throw ApiException.bad("JPEG 사진만 올릴 수 있습니다.");
		if (s.length() > MAX_BYTES / 3 * 4 + DATA_URL.length() + 4) throw ApiException.bad("악보 사진이 너무 큽니다. 장 수를 줄여 주세요.");
		byte[] b;
		try {
			b = Base64.getDecoder().decode(s.substring(DATA_URL.length()));
		} catch (IllegalArgumentException e) {
			throw ApiException.bad("사진을 읽지 못했습니다.");
		}
		if (b.length < 3 || (b[0] & 0xFF) != 0xFF || (b[1] & 0xFF) != 0xD8) throw ApiException.bad("JPEG 사진만 올릴 수 있습니다.");
		return b;
	}

	private static String title(Map<String, Object> body) {
		String t = Api.str(body.get("title")).trim();
		if (t.isEmpty()) throw ApiException.bad("제목(곡 이름)을 입력해 주세요.");
		if (t.length() > 100) throw ApiException.bad("제목은 100자까지 쓸 수 있습니다.");
		return t;
	}

	private static String date(Map<String, Object> body) {
		String d = Api.str(body.get("date"));
		if (!d.matches("\\d{4}-\\d{2}-\\d{2}")) throw ApiException.bad("날짜를 입력해 주세요.");
		return d;
	}

	private static int pages(Map<String, Object> body) {
		long n = Api.blank(body.get("pages")) ? 1 : Api.num(body.get("pages"));
		return (int) Math.max(1, Math.min(50, n));
	}

	private static int isPublic(Map<String, Object> body) {
		Object v = body.get("is_public");
		return Boolean.FALSE.equals(v) || "0".equals(String.valueOf(v)) ? 0 : 1;
	}
}
