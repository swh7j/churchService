package com.church.api.common;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

/**
 * 올린 파일 검사. 파일 이름(확장자)은 바꾸기 쉬우므로 내용을 직접 봅니다.
 * - 그림: 파일 앞부분이 JPEG/PNG 표시이고, 실제로 그림으로 읽혀야 함 (그림인 척하는 HTML·스크립트 거절)
 * - .pptx: zip 이고 그 안에 파워포인트 필수 파일이 있어야 함 (아무 zip 이나 거절)
 */
public final class Uploads {

	public static final String JPEG = "jpeg";
	public static final String PNG = "png";
	/** 그림 한 변 최대(px). 아주 큰 가로세로를 적어 둔 파일로 메모리를 터뜨리는 것 방지 */
	private static final int MAX_SIDE = 12_000;
	private static final int MAX_ZIP_ENTRIES = 20_000;

	private Uploads() {
	}

	/** 파일 앞부분으로 본 그림 형식 (jpeg, png), 아니면 null */
	public static String imageType(byte[] b) {
		if (b == null || b.length < 8) return null;
		if ((b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) return JPEG;
		if ((b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G' && b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A) return PNG;
		return null;
	}

	/** 허용한 형식의 진짜 그림인지 확인하고 형식을 돌려줌. 아니면 400 */
	public static String requireImage(byte[] b, Set<String> allowed, String message) {
		String type = imageType(b);
		if (type == null || !allowed.contains(type) || !readable(b, type)) throw ApiException.bad(message);
		return type;
	}

	/** 그림 머리글(가로·세로)을 실제로 읽을 수 있는지 (그림 전체를 풀지는 않음) */
	private static boolean readable(byte[] b, String type) {
		try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(b))) {
			Iterator<ImageReader> it = ImageIO.getImageReadersByFormatName(type);
			if (in == null || !it.hasNext()) return false;
			ImageReader r = it.next();
			try {
				r.setInput(in, true, true);
				int w = r.getWidth(0);
				int h = r.getHeight(0);
				return w > 0 && h > 0 && w <= MAX_SIDE && h <= MAX_SIDE;
			} finally {
				r.dispose();
			}
		} catch (IOException | RuntimeException e) {
			return false;
		}
	}

	/** 파워포인트 .pptx 인지 확인. 아니면 400 */
	public static void requirePptx(byte[] b, String message) {
		if (b == null || b.length < 4 || b[0] != 'P' || b[1] != 'K') throw ApiException.bad(message);
		boolean types = false;
		boolean pres = false;
		int n = 0;
		try (ZipInputStream z = new ZipInputStream(new ByteArrayInputStream(b))) {
			for (ZipEntry e; (e = z.getNextEntry()) != null;) {
				String name = e.getName();
				if (++n > MAX_ZIP_ENTRIES || name.startsWith("/") || name.contains("..") || name.contains("\\")) throw ApiException.bad(message);
				if (name.equals("[Content_Types].xml")) types = true;
				if (name.equals("ppt/presentation.xml")) pres = true;
			}
		} catch (IOException | IllegalArgumentException e) {
			throw ApiException.bad(message);
		}
		if (!types || !pres) throw ApiException.bad(message);
	}
}
