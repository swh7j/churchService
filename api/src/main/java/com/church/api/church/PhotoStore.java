package com.church.api.church;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.FileTime;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.church.api.common.ApiException;
import com.church.api.tenant.ChurchRegistry;

/**
 * 교회 앨범 사진 파일 보관.
 * - 사진은 DB 밖 data/photos/{교회코드}/ 에 둠 → 매일 하는 DB 백업(30개 보관)이 사진 때문에 커지지 않음
 * - 백업: backups/_photos/{교회코드}/ 에 새로 올라온 사진만 복사 (backup() — 매일 자동 백업 때 같이)
 * - 지운 사진의 백업본은 backups/_photos/{교회코드}/deleted/ 로 옮겨 30일 보관 후 삭제 (실수로 지웠을 때 되살릴 수 있게)
 */
@Service
public class PhotoStore {

	private static final Logger log = LoggerFactory.getLogger(PhotoStore.class);
	private static final SecureRandom RANDOM = new SecureRandom();
	/** 디스크 남은 공간이 이보다 적으면 사진을 받지 않음 (DB·백업 공간 보호) */
	private static final long MIN_FREE_BYTES = 1_000_000_000L;
	private static final Duration KEEP_DELETED = Duration.ofDays(30);

	private final ChurchRegistry churches;
	private final Path dataRoot;
	private final Path backupRoot;

	public PhotoStore(ChurchRegistry churches, @Value("${app.backup-dir}") String backupDir) {
		this.churches = churches;
		this.dataRoot = churches.dataDir().resolve("photos");
		this.backupRoot = Path.of(backupDir).toAbsolutePath().normalize().resolve("_photos");
	}

	/** 지금 교회의 사진 폴더 */
	public Path dir() {
		return dataRoot.resolve(churches.current().code());
	}

	private Path backupDir() {
		return backupRoot.resolve(churches.current().code());
	}

	/** 새 파일 이름 (추측할 수 없게 무작위) */
	public static String newName() {
		byte[] b = new byte[10];
		RANDOM.nextBytes(b);
		return HexFormat.of().formatHex(b);
	}

	/** 파일 이름 검사 (다른 폴더에 접근하지 못하게) */
	private static String checked(String name) {
		if (name == null || !name.matches("[0-9a-f]{20}(_t)?\\.jpg")) throw ApiException.notFound("없는 사진입니다.");
		return name;
	}

	public void save(String name, byte[] bytes) {
		try {
			Path dir = dir();
			Files.createDirectories(dir);
			if (Files.getFileStore(dir).getUsableSpace() < MIN_FREE_BYTES) {
				throw ApiException.bad("서버 저장 공간이 부족해서 사진을 더 올릴 수 없습니다. 관리자에게 알려 주세요.");
			}
			Path tmp = dir.resolve(checked(name) + ".part");
			Files.write(tmp, bytes);
			Files.move(tmp, dir.resolve(name), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	/** 사진 파일 (없으면 null) */
	public Path file(String name) {
		Path p = dir().resolve(checked(name));
		return Files.isRegularFile(p) ? p : null;
	}

	/** 지우기: 원본은 바로 지우고, 백업본은 deleted 폴더로 옮겨 30일 보관 */
	public void delete(String name) {
		checked(name);
		try {
			Files.deleteIfExists(dir().resolve(name));
			Path b = backupDir().resolve(name);
			if (Files.exists(b)) {
				Path del = backupDir().resolve("deleted");
				Files.createDirectories(del);
				Path to = del.resolve(name);
				Files.move(b, to, StandardCopyOption.REPLACE_EXISTING);
				Files.setLastModifiedTime(to, FileTime.from(Instant.now()));
			}
		} catch (IOException e) {
			log.warn("사진 파일 삭제 중 문제: {} {}", name, e.getMessage());
		}
	}

	/** 사진 백업: 새로 올라온 사진만 복사하고, 지운 지 30일 지난 백업본은 정리. 복사한 장 수를 돌려줌 */
	public int backup() {
		Path src = dir();
		if (!Files.isDirectory(src)) return 0;
		int copied = 0;
		try {
			Path dst = backupDir();
			Files.createDirectories(dst);
			try (Stream<Path> files = Files.list(src)) {
				for (Path p : files.filter(f -> f.getFileName().toString().endsWith(".jpg")).toList()) {
					Path to = dst.resolve(p.getFileName().toString());
					if (!Files.exists(to)) {
						Files.copy(p, to, StandardCopyOption.COPY_ATTRIBUTES);
						copied++;
					}
				}
			}
			Path del = dst.resolve("deleted");
			if (Files.isDirectory(del)) {
				Instant limit = Instant.now().minus(KEEP_DELETED);
				try (Stream<Path> files = Files.list(del)) {
					for (Path p : files.toList()) {
						if (Files.getLastModifiedTime(p).toInstant().isBefore(limit)) Files.deleteIfExists(p);
					}
				}
			}
		} catch (IOException e) {
			log.error("사진 백업 실패: {}", e.getMessage());
		}
		return copied;
	}
}
