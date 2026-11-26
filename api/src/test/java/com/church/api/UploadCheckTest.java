package com.church.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 파일 올리기 검사: 이름(확장자)이 아니라 내용을 봄.
 * 그림인 척하는 스크립트·HTML, 파워포인트인 척하는 아무 zip 은 거절
 */
class UploadCheckTest extends IntegrationTest {

	private static final String OCTET = "application/octet-stream";

	/** 앞 3바이트만 JPEG 표시이고 나머지는 HTML (흔한 위장 방법) */
	private static byte[] fakeJpeg() {
		byte[] html = "<html><script>alert(1)</script></html>".getBytes(StandardCharsets.UTF_8);
		byte[] b = new byte[html.length + 3];
		b[0] = (byte) 0xFF;
		b[1] = (byte) 0xD8;
		b[2] = (byte) 0xFF;
		System.arraycopy(html, 0, b, 3, html.length);
		return b;
	}

	private static byte[] zip(String... entries) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		try (ZipOutputStream z = new ZipOutputStream(out)) {
			for (String e : entries) {
				z.putNextEntry(new ZipEntry(e));
				z.write("<x/>".getBytes(StandardCharsets.UTF_8));
				z.closeEntry();
			}
		}
		return out.toByteArray();
	}

	@Test
	@DisplayName("배경 그림: 진짜 jpg·png 는 받고, 앞부분만 그림인 척한 파일은 거절")
	void background() {
		Client a = admin();
		assertThat(a.putRaw("/api/worship-ppt/background", OCTET, image("png")).status()).isEqualTo(200);
		assertThat(a.putRaw("/api/worship-ppt/background", OCTET, fakeJpeg()).status()).isEqualTo(400);
		assertThat(a.putRaw("/api/worship-ppt/background", OCTET, image("gif")).status()).isEqualTo(400);
		a.delete("/api/worship-ppt/background").ok();
	}

	@Test
	@DisplayName("앨범 사진: 위장한 JPEG 거절")
	void albumPhoto() {
		Client a = admin();
		long id = a.post("/api/albums", Map.of("title", "검사용", "date", "2026-11-26")).ok().json().path("id").asLong();
		String fake = "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(fakeJpeg());
		assertThat(a.post("/api/albums/" + id + "/photos", Map.of("image", fake, "thumb", fake)).status()).isEqualTo(400);
	}

	@Test
	@DisplayName("예배 PPT 서식·PDF: 파워포인트 파일이 든 zip 만 받음")
	void pptx() throws IOException {
		Client a = admin();
		byte[] notPpt = zip("index.html", "run.js");
		assertThat(a.putRaw("/api/worship-ppt/file?name=x.pptx", OCTET, notPpt).status()).isEqualTo(400);
		assertThat(a.postRaw("/api/worship-ppt/pdf", OCTET, notPpt).status()).isEqualTo(400);
		assertThat(a.putRaw("/api/worship-ppt/file?name=x.pptx", OCTET, zip("../../evil.txt", "[Content_Types].xml", "ppt/presentation.xml")).status()).isEqualTo(400);
	}

	@Test
	@DisplayName("공용 보관함: 이름만 .jpg 인 파일이 든 zip 거절")
	void library() throws IOException {
		Client p = platform();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		try (ZipOutputStream z = new ZipOutputStream(out)) {
			z.putNextEntry(new ZipEntry("001.jpg"));
			z.write("<script>alert(1)</script>".getBytes(StandardCharsets.UTF_8));
			z.closeEntry();
		}
		assertThat(p.putRaw("/api/platform/library/hymn?no=777", OCTET, out.toByteArray()).status()).isEqualTo(400);
	}
}
