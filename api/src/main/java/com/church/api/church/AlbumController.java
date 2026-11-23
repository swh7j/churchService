package com.church.api.church;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
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

import jakarta.servlet.http.HttpServletResponse;

import com.church.api.audit.AuditService;
import com.church.api.common.Api;
import com.church.api.common.ApiException;

/**
 * 교회 앨범. 관리자가 행사 사진을 앨범으로 올리고, 성도 화면(교회 소식 → 교회 앨범)에서 봅니다.
 * 사진은 화면에서 줄여서(긴 쪽 1600px, 목록용 작은 사진 따로) 올리고, 파일은 PhotoStore 가 DB 밖에 보관합니다.
 */
@RestController
public class AlbumController {

	private static final String DATA_URL = "data:image/jpeg;base64,";
	private static final int MAX_PHOTO = 4_000_000;
	private static final int MAX_THUMB = 400_000;
	private static final int MAX_PER_ALBUM = 300;

	/** 앨범 + 사진 수 + 대표 사진(지정 안 했으면 첫 사진). "SELECT " + ALBUM_FROM + " WHERE ..." 로 씀 */
	private static final String ALBUM_FROM = """
			a.id, a.date, a.title, a.description, a.is_public, a.cover_id, a.updated_at,
			(SELECT COUNT(*) FROM album_photos p WHERE p.album_id = a.id) AS count,
			(SELECT COALESCE(SUM(p.size), 0) FROM album_photos p WHERE p.album_id = a.id) AS size,
			c.id AS cover_photo, c.file AS cover_file
			FROM albums a
			LEFT JOIN album_photos c ON c.id = COALESCE(
			  (SELECT p.id FROM album_photos p WHERE p.album_id = a.id AND p.id = a.cover_id),
			  (SELECT p.id FROM album_photos p WHERE p.album_id = a.id ORDER BY p.sort, p.id LIMIT 1))""";
	private static final String PHOTO_COLS = "id, album_id, sort, width, height, size, file";

	private final JdbcTemplate jdbc;
	private final PhotoStore photos;
	private final AuditService audit;

	public AlbumController(JdbcTemplate jdbc, PhotoStore photos, AuditService audit) {
		this.jdbc = jdbc;
		this.photos = photos;
		this.audit = audit;
	}

	// ---------- 성도 화면 (공개한 앨범만) ----------

	/** 성도 화면 앨범 목록: 공개 + 사진이 있는 앨범, 최근 순 */
	static final String PUBLIC_LIST = "SELECT " + ALBUM_FROM + " WHERE a.is_public = 1"
			+ " AND EXISTS (SELECT 1 FROM album_photos p WHERE p.album_id = a.id) ORDER BY a.date DESC, a.id DESC";

	@GetMapping("/api/public/albums")
	public List<Map<String, Object>> publicList() {
		return jdbc.queryForList(PUBLIC_LIST + " LIMIT 300");
	}

	@GetMapping("/api/public/albums/{id}")
	public Map<String, Object> publicOne(@PathVariable long id) {
		return withPhotos(album(id, true));
	}

	@GetMapping("/api/public/albums/{id}/photos/{photoId}")
	public ResponseEntity<byte[]> publicPhoto(@PathVariable long id, @PathVariable long photoId) {
		return photo(id, photoId, false, true);
	}

	@GetMapping("/api/public/albums/{id}/photos/{photoId}/thumb")
	public ResponseEntity<byte[]> publicThumb(@PathVariable long id, @PathVariable long photoId) {
		return photo(id, photoId, true, true);
	}

	// ---------- 관리자 화면 ----------

	@GetMapping("/api/albums")
	@PreAuthorize("hasAuthority('AREA_church')")
	public List<Map<String, Object>> list() {
		return jdbc.queryForList("SELECT " + ALBUM_FROM + " ORDER BY a.date DESC, a.id DESC");
	}

	@GetMapping("/api/albums/{id}")
	@PreAuthorize("hasAuthority('AREA_church')")
	public Map<String, Object> one(@PathVariable long id) {
		return withPhotos(album(id, false));
	}

	@GetMapping("/api/albums/{id}/photos/{photoId}")
	@PreAuthorize("hasAuthority('AREA_church')")
	public ResponseEntity<byte[]> adminPhoto(@PathVariable long id, @PathVariable long photoId) {
		return photo(id, photoId, false, false);
	}

	@GetMapping("/api/albums/{id}/photos/{photoId}/thumb")
	@PreAuthorize("hasAuthority('AREA_church')")
	public ResponseEntity<byte[]> adminThumb(@PathVariable long id, @PathVariable long photoId) {
		return photo(id, photoId, true, false);
	}

	@PostMapping("/api/albums")
	@PreAuthorize("hasAuthority('AREA_church')")
	public Map<String, Object> create(@RequestBody Map<String, Object> body) {
		jdbc.update("INSERT INTO albums (date, title, description, is_public) VALUES (?, ?, ?, ?)",
				date(body), title(body), description(body), isPublic(body));
		Long id = jdbc.queryForObject("SELECT last_insert_rowid()", Long.class);
		audit.log("앨범 만들기", "albums", id, Api.map("title", title(body), "date", date(body)));
		return album(id, false);
	}

	/** 제목·날짜·설명·공개 여부 수정, cover_id 를 보내면 대표 사진 바꿈 */
	@PutMapping("/api/albums/{id}")
	@PreAuthorize("hasAuthority('AREA_church')")
	public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> body) {
		album(id, false);
		jdbc.update("UPDATE albums SET date = ?, title = ?, description = ?, is_public = ?, updated_at = datetime('now','localtime') WHERE id = ?",
				date(body), title(body), description(body), isPublic(body), id);
		if (body.containsKey("cover_id")) {
			Object c = body.get("cover_id");
			Long cover = c == null ? null : Api.num(c);
			if (cover != null && jdbc.queryForObject("SELECT COUNT(*) FROM album_photos WHERE id = ? AND album_id = ?", Integer.class, cover, id) == 0)
				throw ApiException.bad("이 앨범의 사진이 아닙니다.");
			jdbc.update("UPDATE albums SET cover_id = ? WHERE id = ?", cover, id);
		}
		audit.log("앨범 수정", "albums", id, Api.map("title", title(body), "date", date(body)));
		return album(id, false);
	}

	@DeleteMapping("/api/albums/{id}")
	@PreAuthorize("hasAuthority('AREA_church')")
	public Map<String, Object> delete(@PathVariable long id) {
		Map<String, Object> a = album(id, false);
		List<String> files = jdbc.queryForList("SELECT file FROM album_photos WHERE album_id = ?", String.class, id);
		jdbc.update("DELETE FROM album_photos WHERE album_id = ?", id);
		jdbc.update("DELETE FROM albums WHERE id = ?", id);
		for (String f : files) {
			photos.delete(f + ".jpg");
			photos.delete(f + "_t.jpg");
		}
		audit.log("앨범 삭제", "albums", id, Api.map("title", a.get("title"), "date", a.get("date"), "photos", files.size()));
		return Api.map("ok", true);
	}

	/** 사진 한 장 올리기 (화면에서 줄인 JPEG): { image: data URL, thumb: data URL, width, height } */
	@PostMapping("/api/albums/{id}/photos")
	@PreAuthorize("hasAuthority('AREA_church')")
	public Map<String, Object> upload(@PathVariable long id, @RequestBody Map<String, Object> body) {
		album(id, false);
		int count = jdbc.queryForObject("SELECT COUNT(*) FROM album_photos WHERE album_id = ?", Integer.class, id);
		if (count >= MAX_PER_ALBUM) throw ApiException.bad("앨범 하나에는 사진을 " + MAX_PER_ALBUM + "장까지 올릴 수 있습니다. 새 앨범을 만들어 주세요.");
		byte[] img = jpeg(body.get("image"), MAX_PHOTO);
		byte[] thumb = jpeg(body.get("thumb"), MAX_THUMB);
		if (img == null || thumb == null) throw ApiException.bad("사진을 골라 주세요.");
		String file = PhotoStore.newName();
		photos.save(file + "_t.jpg", thumb);
		photos.save(file + ".jpg", img);
		Integer sort = jdbc.queryForObject("SELECT COALESCE(MAX(sort), 0) + 1 FROM album_photos WHERE album_id = ?", Integer.class, id);
		jdbc.update("INSERT INTO album_photos (album_id, sort, width, height, size, file) VALUES (?, ?, ?, ?, ?, ?)",
				id, sort, dim(body.get("width")), dim(body.get("height")), img.length + thumb.length, file);
		Long pid = jdbc.queryForObject("SELECT last_insert_rowid()", Long.class);
		jdbc.update("UPDATE albums SET updated_at = datetime('now','localtime') WHERE id = ?", id);
		return jdbc.queryForMap("SELECT " + PHOTO_COLS + " FROM album_photos WHERE id = ?", pid);
	}

	@DeleteMapping("/api/albums/{id}/photos/{photoId}")
	@PreAuthorize("hasAuthority('AREA_church')")
	public Map<String, Object> deletePhoto(@PathVariable long id, @PathVariable long photoId) {
		Map<String, Object> p = photoRow(id, photoId, false);
		jdbc.update("DELETE FROM album_photos WHERE id = ?", photoId);
		jdbc.update("UPDATE albums SET cover_id = NULL WHERE id = ? AND cover_id = ?", id, photoId);
		photos.delete(p.get("file") + ".jpg");
		photos.delete(p.get("file") + "_t.jpg");
		audit.log("앨범 사진 삭제", "albums", id, Api.map("photo", photoId));
		return Api.map("ok", true);
	}

	/** 앨범 사진 전체를 zip 으로 내려받기 (PC에 따로 보관용) */
	@GetMapping("/api/albums/{id}/zip")
	@PreAuthorize("hasAuthority('AREA_church')")
	public void zip(@PathVariable long id, HttpServletResponse res) throws IOException {
		Map<String, Object> a = album(id, false);
		List<Path> files = jdbc.queryForList("SELECT file FROM album_photos WHERE album_id = ? ORDER BY sort, id", String.class, id)
				.stream().map(f -> photos.file(f + ".jpg")).filter(f -> f != null).toList();
		String name = (a.get("date") + " " + a.get("title")).replaceAll("[\\\\/:*?\"<>|]", "_") + ".zip";
		res.setContentType("application/zip");
		res.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"album.zip\"; filename*=UTF-8''" + URLEncoder.encode(name, StandardCharsets.UTF_8).replace("+", "%20"));
		res.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
		// 메모리에 모으지 않고 바로 보냄 (서버 메모리가 작음)
		try (ZipOutputStream zip = new ZipOutputStream(res.getOutputStream())) {
			zip.setLevel(0); // JPEG 는 더 줄지 않음
			int n = 0;
			for (Path f : files) {
				zip.putNextEntry(new ZipEntry(String.format("%03d.jpg", ++n)));
				Files.copy(f, zip);
				zip.closeEntry();
			}
		}
	}

	// ---------- 공통 ----------

	private Map<String, Object> album(long id, boolean publicOnly) {
		List<Map<String, Object>> r = jdbc.queryForList("SELECT " + ALBUM_FROM + " WHERE a.id = ?" + (publicOnly ? " AND a.is_public = 1" : ""), id);
		if (r.isEmpty()) throw ApiException.notFound("없는 앨범입니다.");
		return r.get(0);
	}

	private Map<String, Object> withPhotos(Map<String, Object> a) {
		a.put("photos", jdbc.queryForList("SELECT " + PHOTO_COLS + " FROM album_photos WHERE album_id = ? ORDER BY sort, id", a.get("id")));
		return a;
	}

	private Map<String, Object> photoRow(long albumId, long photoId, boolean publicOnly) {
		List<Map<String, Object>> r = jdbc.queryForList("SELECT p.id, p.file FROM album_photos p JOIN albums a ON a.id = p.album_id"
				+ " WHERE p.id = ? AND p.album_id = ?" + (publicOnly ? " AND a.is_public = 1" : ""), photoId, albumId);
		if (r.isEmpty()) throw ApiException.notFound("없는 사진입니다.");
		return r.get(0);
	}

	private ResponseEntity<byte[]> photo(long albumId, long photoId, boolean thumb, boolean publicOnly) {
		Map<String, Object> p = photoRow(albumId, photoId, publicOnly);
		Path f = photos.file(p.get("file") + (thumb ? "_t.jpg" : ".jpg"));
		if (f == null) throw ApiException.notFound("사진 파일이 없습니다.");
		try {
			// 주소에 ?v=파일이름 을 붙여 부르므로 같은 주소면 내용이 바뀌지 않음 → 오래 캐시
			CacheControl cache = publicOnly ? CacheControl.maxAge(Duration.ofDays(30)).cachePublic() : CacheControl.maxAge(Duration.ofDays(30)).cachePrivate();
			return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).cacheControl(cache).body(Files.readAllBytes(f));
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	private static byte[] jpeg(Object o, int max) {
		String s = Api.str(o);
		if (s.isEmpty()) return null;
		if (!s.startsWith(DATA_URL)) throw ApiException.bad("JPEG 사진만 올릴 수 있습니다.");
		if (s.length() > max / 3 * 4 + DATA_URL.length() + 4) throw ApiException.bad("사진이 너무 큽니다.");
		byte[] b;
		try {
			b = Base64.getDecoder().decode(s.substring(DATA_URL.length()));
		} catch (IllegalArgumentException e) {
			throw ApiException.bad("사진을 읽지 못했습니다.");
		}
		if (b.length < 3 || (b[0] & 0xFF) != 0xFF || (b[1] & 0xFF) != 0xD8) throw ApiException.bad("JPEG 사진만 올릴 수 있습니다.");
		return b;
	}

	private static Integer dim(Object o) {
		if (!(o instanceof Number n)) return null;
		int v = n.intValue();
		return v > 0 && v < 20000 ? v : null;
	}

	private static String title(Map<String, Object> body) {
		String t = Api.str(body.get("title")).trim();
		if (t.isEmpty()) throw ApiException.bad("앨범 제목을 입력해 주세요.");
		if (t.length() > 100) throw ApiException.bad("제목은 100자까지 쓸 수 있습니다.");
		return t;
	}

	private static String description(Map<String, Object> body) {
		String d = Api.str(body.get("description")).trim();
		if (d.length() > 1000) throw ApiException.bad("설명은 1000자까지 쓸 수 있습니다.");
		return d.isEmpty() ? null : d;
	}

	private static String date(Map<String, Object> body) {
		String d = Api.str(body.get("date"));
		if (!d.matches("\\d{4}-\\d{2}-\\d{2}")) throw ApiException.bad("날짜를 입력해 주세요.");
		return d;
	}

	private static int isPublic(Map<String, Object> body) {
		Object v = body.get("is_public");
		return Boolean.FALSE.equals(v) || "0".equals(String.valueOf(v)) ? 0 : 1;
	}
}
