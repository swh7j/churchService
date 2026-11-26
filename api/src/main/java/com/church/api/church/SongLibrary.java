package com.church.api.church;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.FileTime;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.church.api.common.ApiException;
import com.church.api.common.Uploads;
import com.church.api.tenant.ChurchRegistry;

/**
 * 공용 찬송가 보관함: 찬송가(hymn)·교독문(reading)·경배와 찬양(praise) 화면을 모든 교회가 같이 씀.
 * - 화면 그림 zip 은 DB 밖 data/library/{종류}/{파일}.zip 에 한 벌만 둠 → 교회마다 중복 저장하지 않고, 매일 DB 백업도 커지지 않음
 * - 목록(번호·제목·화면 수)은 platform.db 의 library_songs 표
 * - 백업: backups/_library/ 에 새로 올라온 파일만 복사 + 목록이 든 platform.db 사본 (매일 자동 백업 때)
 * - 지운 파일의 백업본은 deleted/ 로 옮겨 30일 보관
 * - 올리기·지우기는 전체 관리자만 (LibraryController), 교회는 가져다 쓰기만
 */
@Service
public class SongLibrary {

	private static final Logger log = LoggerFactory.getLogger(SongLibrary.class);
	public static final List<String> KINDS = List.of("hymn", "reading", "praise");
	public static final int MAX_ZIP = 30_000_000;
	private static final long MIN_FREE_BYTES = 1_000_000_000L;
	private static final Duration KEEP_DELETED = Duration.ofDays(30);

	private final JdbcTemplate db; // platform.db
	private final Path root;
	private final Path backupRoot;

	public SongLibrary(ChurchRegistry churches, @Value("${app.backup-dir}") String backupDir) {
		this.db = churches.platformJdbc();
		this.root = churches.dataDir().resolve("library");
		this.backupRoot = Path.of(backupDir).toAbsolutePath().normalize().resolve("_library");
		db.execute("""
				CREATE TABLE IF NOT EXISTS library_songs (
				  kind TEXT NOT NULL,              -- hymn / reading / praise
				  key TEXT NOT NULL,               -- 찬송가·교독문: 번호, 경배와 찬양: 띄어쓰기·기호를 뺀 제목
				  no TEXT,                         -- 번호 (경배와 찬양은 없을 수 있음)
				  title TEXT,                      -- 제목
				  count INTEGER NOT NULL,          -- 화면 수
				  size INTEGER NOT NULL,           -- 파일 크기
				  file TEXT NOT NULL,              -- data/library/{kind}/{file}.zip
				  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
				  PRIMARY KEY (kind, key)
				)""");
	}

	public static String kind(String k) {
		if (!KINDS.contains(k)) throw ApiException.bad("종류가 올바르지 않습니다.");
		return k;
	}

	/** 경배와 찬양 찾기용 열쇠: 띄어쓰기·기호를 빼고 소문자로 ('그 사랑(아버지…)' 과 '그사랑(아버지…)' 을 같게) */
	public static String norm(String s) {
		return s == null ? "" : s.replaceAll("[^0-9A-Za-z가-힣]", "").toLowerCase();
	}

	/** 종류·번호·제목 → 저장 열쇠 */
	public static String key(String kind, String no, String title) {
		if (kind.equals("praise")) {
			String k = norm(title);
			if (k.isEmpty()) throw ApiException.bad("곡 제목이 없습니다. 파일 이름에 제목을 넣어 주세요.");
			if (k.length() > 200) throw ApiException.bad("곡 제목이 너무 깁니다.");
			return k;
		}
		return number(no);
	}

	public static String number(String no) {
		if (no == null || !no.trim().matches("\\d{1,4}")) throw ApiException.bad("번호가 올바르지 않습니다.");
		return String.valueOf(Integer.parseInt(no.trim()));
	}

	public List<Map<String, Object>> list() {
		return db.queryForList("SELECT kind, key, no, title, count, size, updated_at FROM library_songs ORDER BY kind, CAST(no AS INTEGER), title");
	}

	/** 화면 zip 파일 (없으면 404) */
	public Path file(String kind, String key) {
		List<String> f = db.queryForList("SELECT file FROM library_songs WHERE kind = ? AND key = ?", String.class, kind(kind), key);
		if (f.isEmpty()) throw ApiException.notFound("저장된 화면이 없습니다.");
		Path p = root.resolve(kind).resolve(f.get(0) + ".zip");
		if (!Files.isRegularFile(p)) throw ApiException.notFound("화면 파일이 없습니다.");
		return p;
	}

	public boolean exists(String kind, String key) {
		return db.queryForObject("SELECT COUNT(*) FROM library_songs WHERE kind = ? AND key = ?", Integer.class, kind, key) > 0;
	}

	/** 저장 (같은 열쇠가 있으면 바꿈). 저장한 줄을 돌려줌 */
	public synchronized Map<String, Object> save(String kind, String no, String title, byte[] zip) {
		kind(kind);
		String k = key(kind, no, title);
		String n = no == null || no.isBlank() ? null : number(no);
		String t = title == null || title.isBlank() ? null : title.trim();
		if (t != null && t.length() > 200) t = t.substring(0, 200);
		if (zip.length > MAX_ZIP) throw ApiException.bad("그림이 너무 큽니다. 화면 수를 줄이거나 작은 그림으로 올려 주세요.");
		int count = countImages(zip);
		if (count == 0) throw ApiException.bad("그림이 없습니다.");
		if (count > 40) throw ApiException.bad("화면은 40장까지 넣을 수 있습니다.");

		String name = PhotoStore.newName();
		Path dir = root.resolve(kind);
		try {
			Files.createDirectories(dir);
			if (Files.getFileStore(dir).getUsableSpace() < MIN_FREE_BYTES) throw ApiException.bad("서버 저장 공간이 부족해서 더 올릴 수 없습니다.");
			Path tmp = dir.resolve(name + ".part");
			Files.write(tmp, zip);
			Files.move(tmp, dir.resolve(name + ".zip"), StandardCopyOption.ATOMIC_MOVE);
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
		List<String> old = db.queryForList("SELECT file FROM library_songs WHERE kind = ? AND key = ?", String.class, kind, k);
		// 바꿀 때 제목·번호를 비워 보내면 원래 것을 그대로 둠
		db.update("INSERT INTO library_songs (kind, key, no, title, count, size, file, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime')) "
				+ "ON CONFLICT(kind, key) DO UPDATE SET no = COALESCE(excluded.no, no), title = COALESCE(excluded.title, title), "
				+ "count = excluded.count, size = excluded.size, file = excluded.file, updated_at = excluded.updated_at",
				kind, k, n, t, count, zip.length, name);
		old.forEach(f -> removeFile(kind, f));
		return row(kind, k);
	}

	private Map<String, Object> row(String kind, String key) {
		return db.queryForMap("SELECT kind, key, no, title, count, size, updated_at FROM library_songs WHERE kind = ? AND key = ?", kind, key);
	}

	/** 제목만 바꾸기 */
	public Map<String, Object> rename(String kind, String key, String title) {
		if (!exists(kind(kind), key)) throw ApiException.notFound("저장된 화면이 없습니다.");
		if (kind.equals("praise")) throw ApiException.bad("경배와 찬양은 제목이 열쇠라 바꿀 수 없습니다. 새 이름으로 다시 올려 주세요.");
		String t = title == null || title.isBlank() ? null : title.trim();
		db.update("UPDATE library_songs SET title = ? WHERE kind = ? AND key = ?", t, kind, key);
		return row(kind, key);
	}

	public synchronized void delete(String kind, String key) {
		List<String> f = db.queryForList("SELECT file FROM library_songs WHERE kind = ? AND key = ?", String.class, kind(kind), key);
		if (f.isEmpty()) throw ApiException.notFound("저장된 화면이 없습니다.");
		db.update("DELETE FROM library_songs WHERE kind = ? AND key = ?", kind, key);
		f.forEach(x -> removeFile(kind, x));
	}

	/** 원본은 지우고, 백업본은 deleted 로 옮겨 30일 보관 */
	private void removeFile(String kind, String name) {
		try {
			Files.deleteIfExists(root.resolve(kind).resolve(name + ".zip"));
			Path b = backupRoot.resolve(kind).resolve(name + ".zip");
			if (Files.exists(b)) {
				Path del = backupRoot.resolve("deleted");
				Files.createDirectories(del);
				Path to = del.resolve(kind + "-" + name + ".zip");
				Files.move(b, to, StandardCopyOption.REPLACE_EXISTING);
				Files.setLastModifiedTime(to, FileTime.from(Instant.now()));
			}
		} catch (IOException e) {
			log.warn("보관함 파일 삭제 중 문제: {} {}", name, e.getMessage());
		}
	}

	/** 백업: 새로 올라온 파일만 복사 + 목록(platform.db) 사본. 지운 지 30일 지난 백업본 정리 */
	public synchronized int backup() {
		int copied = 0;
		try {
			Files.createDirectories(backupRoot);
			for (String kind : KINDS) {
				Path src = root.resolve(kind);
				if (!Files.isDirectory(src)) continue;
				Path dst = backupRoot.resolve(kind);
				Files.createDirectories(dst);
				try (Stream<Path> files = Files.list(src)) {
					for (Path p : files.filter(f -> f.getFileName().toString().endsWith(".zip")).toList()) {
						Path to = dst.resolve(p.getFileName().toString());
						if (!Files.exists(to)) {
							Files.copy(p, to, StandardCopyOption.COPY_ATTRIBUTES);
							copied++;
						}
					}
				}
			}
			Path tmp = backupRoot.resolve("platform.db.part");
			Files.deleteIfExists(tmp);
			db.execute("VACUUM INTO '" + tmp.toString().replace("'", "''") + "'");
			Files.move(tmp, backupRoot.resolve("platform.db"), StandardCopyOption.REPLACE_EXISTING);
			Path del = backupRoot.resolve("deleted");
			if (Files.isDirectory(del)) {
				Instant limit = Instant.now().minus(KEEP_DELETED);
				try (Stream<Path> files = Files.list(del)) {
					for (Path p : files.toList()) {
						if (Files.getLastModifiedTime(p).toInstant().isBefore(limit)) Files.deleteIfExists(p);
					}
				}
			}
		} catch (IOException | RuntimeException e) {
			log.error("공용 보관함 백업 실패: {}", e.getMessage());
		}
		if (copied > 0) log.info("공용 보관함 백업: 새 파일 {}개 복사", copied);
		return copied;
	}

	/** zip 안의 그림 수 (001.jpg 같은 이름의 jpg/png 만, 다른 파일이 있으면 거절) */
	public static int countImages(byte[] file) {
		if (file.length < 4 || file[0] != 'P' || file[1] != 'K') throw ApiException.bad("화면 파일 형식이 올바르지 않습니다.");
		int count = 0;
		try (ZipInputStream z = new ZipInputStream(new ByteArrayInputStream(file))) {
			for (ZipEntry e; (e = z.getNextEntry()) != null;) {
				if (!e.getName().matches("\\d{3}\\.(jpg|jpeg|png)")) throw ApiException.bad("jpg, png 그림만 넣을 수 있습니다.");
				// 이름만 .jpg 인 다른 파일 거절: 내용 앞부분이 이름과 같은 형식이어야 함
				String type = Uploads.imageType(z.readNBytes(8));
				if (type == null || !type.equals(e.getName().endsWith(".png") ? Uploads.PNG : Uploads.JPEG))
					throw ApiException.bad("jpg, png 그림만 넣을 수 있습니다.");
				count++;
			}
		} catch (IOException e) {
			throw ApiException.bad("화면 파일을 읽지 못했습니다.");
		}
		return count;
	}
}
