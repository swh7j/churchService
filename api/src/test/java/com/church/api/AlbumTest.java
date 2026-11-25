package com.church.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Map;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** 교회 앨범: 올리기, 공개/비공개, 내려받기, 사진 파일 백업·삭제 보관 */
class AlbumTest extends IntegrationTest {

	private static String jpegDataUrl(int w, int h) throws IOException {
		BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = img.createGraphics();
		g.setColor(Color.ORANGE);
		g.fillRect(0, 0, w, h);
		g.dispose();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(img, "jpg", out);
		return "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
	}

	private JsonNode upload(Client a, long album) throws IOException {
		return a.post("/api/albums/" + album + "/photos", Map.of("image", jpegDataUrl(160, 120), "thumb", jpegDataUrl(48, 36), "width", 160, "height", 120))
				.ok().json();
	}

	@Test
	@DisplayName("공개 앨범은 성도 화면에 보이고, 비공개로 바꾸면 앨범·사진 모두 404")
	void publicAndPrivate() throws IOException {
		Client a = admin();
		long id = a.post("/api/albums", Map.of("title", "T추수감사절", "date", "2026-11-16", "is_public", 1)).ok().json().path("id").asLong();
		JsonNode p = upload(a, id);
		long pid = p.path("id").asLong();
		assertThat(p.path("file").asString()).matches("[0-9a-f]{20}");

		Client anon = client();
		assertThat(anon.get("/api/public/albums").ok().body()).contains("T추수감사절");
		Res photo = anon.get("/api/public/albums/" + id + "/photos/" + pid);
		assertThat(photo.status()).isEqualTo(200);
		assertThat(photo.header("Content-Type")).isEqualTo("image/jpeg");
		assertThat(anon.get("/api/public/albums/" + id + "/photos/" + pid + "/thumb").status()).isEqualTo(200);
		assertThat(anon.get("/api/public/home").ok().body()).contains("T추수감사절");

		JsonNode album = a.get("/api/albums/" + id).ok().json();
		a.put("/api/albums/" + id, Map.of("title", album.path("title").asString(), "date", "2026-11-16", "is_public", 0)).ok();
		assertThat(anon.get("/api/public/albums/" + id).status()).isEqualTo(404);
		assertThat(anon.get("/api/public/albums/" + id + "/photos/" + pid).status()).isEqualTo(404);
		assertThat(anon.get("/api/public/albums").ok().body()).doesNotContain("T추수감사절");
		assertThat(a.get("/api/albums/" + id + "/photos/" + pid).status()).as("관리자는 볼 수 있음").isEqualTo(200);
	}

	@Test
	@DisplayName("JPEG 가 아니면 거절, 다른 앨범의 사진 번호로는 못 봄")
	void validation() throws IOException {
		Client a = admin();
		long id = a.post("/api/albums", Map.of("title", "T검사", "date", "2026-01-01", "is_public", 1)).ok().json().path("id").asLong();
		long other = a.post("/api/albums", Map.of("title", "T다른앨범", "date", "2026-01-01", "is_public", 1)).ok().json().path("id").asLong();
		Res png = a.post("/api/albums/" + id + "/photos", Map.of("image", "data:image/png;base64,iVBORw0KGgo=", "thumb", "data:image/png;base64,iVBORw0KGgo="));
		assertThat(png.status()).isEqualTo(400);
		Res fake = a.post("/api/albums/" + id + "/photos", Map.of("image", "data:image/jpeg;base64," + Base64.getEncoder().encodeToString("not an image".getBytes()), "thumb", "x"));
		assertThat(fake.status()).isEqualTo(400);

		long pid = upload(a, id).path("id").asLong();
		assertThat(client().get("/api/public/albums/" + other + "/photos/" + pid).status()).isEqualTo(404);
		assertThat(a.post("/api/albums", Map.of("title", "", "date", "2026-01-01")).status()).isEqualTo(400);
	}

	@Test
	@DisplayName("사진 모두 내려받기(zip), 백업 때 새 사진 복사, 지운 사진의 백업본은 deleted 로 이동")
	void zipBackupAndDelete() throws IOException {
		Client a = admin();
		long id = a.post("/api/albums", Map.of("title", "T백업", "date", "2026-02-02", "is_public", 1)).ok().json().path("id").asLong();
		JsonNode p1 = upload(a, id);
		upload(a, id);

		Res zip = a.get("/api/albums/" + id + "/zip");
		assertThat(zip.status()).isEqualTo(200);
		assertThat(zip.header("Content-Type")).startsWith("application/zip");
		assertThat(zip.body()).startsWith("PK");

		newBackup(a);
		Path mirror = ROOT.resolve("backups").resolve("_photos").resolve(CHURCH);
		String file = p1.path("file").asString();
		assertThat(mirror.resolve(file + ".jpg")).exists();
		assertThat(mirror.resolve(file + "_t.jpg")).exists();

		a.delete("/api/albums/" + id + "/photos/" + p1.path("id").asLong()).ok();
		assertThat(ROOT.resolve("data").resolve("photos").resolve(CHURCH).resolve(file + ".jpg")).doesNotExist();
		assertThat(mirror.resolve(file + ".jpg")).doesNotExist();
		assertThat(mirror.resolve("deleted").resolve(file + ".jpg")).as("30일 보관").exists();
		assertThat(Files.size(mirror.resolve("deleted").resolve(file + ".jpg"))).isPositive();
	}
}
