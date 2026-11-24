package com.church.api.church;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;

import org.apache.poi.ddf.EscherBSERecord;
import org.apache.poi.ddf.EscherContainerRecord;
import org.apache.poi.ddf.EscherOptRecord;
import org.apache.poi.ddf.EscherPropertyTypes;
import org.apache.poi.ddf.EscherRecord;
import org.apache.poi.ddf.EscherSimpleProperty;
import org.apache.poi.hslf.usermodel.HSLFBackground;
import org.apache.poi.hslf.usermodel.HSLFFill;
import org.apache.poi.hslf.usermodel.HSLFGroupShape;
import org.apache.poi.hslf.usermodel.HSLFMasterSheet;
import org.apache.poi.hslf.usermodel.HSLFPictureData;
import org.apache.poi.hslf.usermodel.HSLFPictureShape;
import org.apache.poi.hslf.usermodel.HSLFShape;
import org.apache.poi.hslf.usermodel.HSLFSheet;
import org.apache.poi.hslf.usermodel.HSLFSlide;
import org.apache.poi.hslf.usermodel.HSLFSlideShow;

import com.church.api.common.ApiException;

/**
 * 옛날 파워포인트(.ppt) 찬송가·교독문 파일 → 화면 그림들.
 * 찬송가 PPT는 보통 '배경 사진(슬라이드 마스터 배경)' 위에 '악보·가사 그림(투명 PNG)'을 얹은 구조라,
 * 슬라이드마다 배경 + 그림들을 한 장으로 겹쳐서 파워포인트 화면과 같은 그림을 만듭니다.
 * (글자·도형은 그리지 않음 — 서버에 글꼴이 없어도 되게. 찬송가 PPT는 내용이 모두 그림)
 */
public final class PptImages {

	/** 만들 그림 높이 (4:3 이면 1440×1080 — 풀HD 화면에 가득) */
	private static final int HEIGHT = 1080;
	/** 배경 채우기 종류 (MS-PPT 형식 값: msofillSolid 0, Pattern 1, Texture 2, Picture 3) */
	private static final int FILL_SOLID = 0, FILL_PATTERN = 1, FILL_TEXTURE = 2, FILL_PICTURE = 3;

	private PptImages() {
	}

	public record Result(byte[] zip, int count, int skipped) {
	}

	/** .ppt → 서버에 저장하는 형식의 zip (001.jpg, 002.jpg …) */
	public static Result toZip(byte[] ppt) {
		// .ppt 는 OLE2 파일 (D0 CF 11 E0 으로 시작)
		if (ppt.length < 8 || (ppt[0] & 0xFF) != 0xD0 || (ppt[1] & 0xFF) != 0xCF) {
			throw ApiException.bad("파워포인트 97-2003(.ppt) 파일이 아닙니다.");
		}
		List<byte[]> images = new ArrayList<>();
		int skipped = 0;
		try (HSLFSlideShow show = new HSLFSlideShow(new ByteArrayInputStream(ppt))) {
			java.awt.Dimension size = show.getPageSize();
			double scale = (double) HEIGHT / size.height;
			int w = (int) Math.round(size.width * scale);
			Pictures pics = new Pictures(show);
			for (HSLFSlide slide : show.getSlides()) {
				byte[] jpg = render(pics, slide, w, HEIGHT, scale);
				if (jpg == null) skipped++;
				else images.add(jpg);
			}
		} catch (IOException | RuntimeException e) {
			if (e instanceof ApiException a) throw a;
			throw ApiException.bad("PPT 파일을 읽지 못했습니다. 파워포인트에서 열어 .pptx 로 저장한 뒤 올려 주세요.");
		}
		if (images.isEmpty()) throw ApiException.bad("PPT에서 그림을 찾지 못했습니다. 글자로 된 PPT는 파워포인트에서 다른 이름으로 저장 → JPEG 로 그림을 만들어 올려 주세요.");
		if (images.size() > 40) throw ApiException.bad("화면은 40장까지 넣을 수 있습니다.");

		ByteArrayOutputStream out = new ByteArrayOutputStream();
		try (ZipOutputStream z = new ZipOutputStream(out)) {
			z.setLevel(0); // JPEG 는 더 줄지 않음
			for (int i = 0; i < images.size(); i++) {
				z.putNextEntry(new ZipEntry(String.format("%03d.jpg", i + 1)));
				z.write(images.get(i));
				z.closeEntry();
			}
		} catch (IOException e) {
			throw ApiException.bad("화면을 저장하지 못했습니다.");
		}
		return new Result(out.toByteArray(), images.size(), skipped);
	}

	/** 슬라이드 한 장 → JPEG (그림이 하나도 없으면 null) */
	private static byte[] render(Pictures pics, HSLFSlide slide, int w, int h, double scale) throws IOException {
		BufferedImage canvas = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = canvas.createGraphics();
		g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
		g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
		g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		g.setColor(Color.WHITE);
		g.fillRect(0, 0, w, h);
		int drawn = 0;
		try {
			// 1) 배경: 슬라이드 자체 배경, 없으면 마스터 배경
			HSLFSheet bgSheet = slide.getFollowMasterBackground() && slide.getMasterSheet() != null ? slide.getMasterSheet() : slide;
			drawn += background(pics, g, bgSheet.getBackground(), w, h);
			// 2) 마스터에 놓인 그림 (로고·배경 그림 등)
			HSLFMasterSheet master = slide.getMasterSheet();
			if (master != null && slide.getFollowMasterObjects()) drawn += pictures(pics, g, master.getShapes(), scale, null, null);
			// 3) 슬라이드의 그림들 (위에 얹힌 악보·가사)
			drawn += pictures(pics, g, slide.getShapes(), scale, null, null);
		} finally {
			g.dispose();
		}
		if (drawn == 0) return null;
		return jpeg(canvas, 0.86f);
	}

	private static int background(Pictures pics, Graphics2D g, HSLFBackground bg, int w, int h) {
		if (bg == null) return 0;
		HSLFFill fill = bg.getFill();
		if (fill == null) return 0;
		int type = fill.getFillType();
		if (type == FILL_PICTURE || type == FILL_TEXTURE || type == FILL_PATTERN) {
			HSLFPictureData data = fill.getPictureData();
			if (data == null) data = pics.byIndex(blipIndex(bg));
			BufferedImage img = image(data);
			if (img != null) {
				if (type == FILL_PICTURE) {
					g.drawImage(img, 0, 0, w, h, null);
				} else { // 바둑판처럼 반복
					for (int y = 0; y < h; y += img.getHeight()) for (int x = 0; x < w; x += img.getWidth()) g.drawImage(img, x, y, null);
				}
				return 1;
			}
		}
		Color c = fill.getForegroundColor();
		if (type == FILL_SOLID && c != null) {
			g.setColor(c);
			g.fillRect(0, 0, w, h);
		}
		return 0;
	}

	/**
	 * 그림 도형들을 제자리에 그림. 묶음 도형은 안쪽 좌표를 바깥 좌표로 바꿔서.
	 * group/interior: 묶음 안이면 (바깥 자리, 안쪽 좌표계)
	 */
	private static int pictures(Pictures pics, Graphics2D g, List<HSLFShape> shapes, double scale, Rectangle2D group, Rectangle2D interior) {
		int n = 0;
		for (HSLFShape s : shapes) {
			if (s instanceof HSLFGroupShape gs) {
				Rectangle2D outer = map(gs.getAnchor(), group, interior);
				n += pictures(pics, g, gs.getShapes(), scale, outer, gs.getInteriorAnchor());
			} else if (s instanceof HSLFPictureShape p) {
				HSLFPictureData data = p.getPictureData();
				if (data == null) data = pics.byIndex(p.getPictureIndex());
				BufferedImage img = image(data);
				if (img == null) continue;
				Rectangle2D a = map(p.getAnchor(), group, interior);
				g.drawImage(img, (int) Math.round(a.getX() * scale), (int) Math.round(a.getY() * scale),
						(int) Math.round(a.getWidth() * scale), (int) Math.round(a.getHeight() * scale), null);
				n++;
			}
		}
		return n;
	}

	/**
	 * 그림 번호(BSE 번호) → 그림 데이터. 중간에 지워진 빈 칸이 있는 PPT는 라이브러리가 그림을 엉뚱한 칸에 연결해
	 * '그림 없음'이 되므로, 그림마다 붙은 고유값(UID)으로 직접 찾음. 못 찾으면 파일 안 위치(offset)로 찾음.
	 */
	private static final class Pictures {
		private final List<EscherBSERecord> bses = new ArrayList<>();
		private final List<HSLFPictureData> data;

		Pictures(HSLFSlideShow show) {
			data = show.getPictureData();
			try {
				EscherContainerRecord bstore = show.getDocumentRecord().getPPDrawingGroup().getDggContainer()
						.getChildById(EscherContainerRecord.BSTORE_CONTAINER);
				if (bstore != null) for (EscherRecord r : bstore.getChildRecords()) if (r instanceof EscherBSERecord b) bses.add(b);
			} catch (RuntimeException ignored) {
				// 그림 목록을 못 읽으면 라이브러리가 찾은 것만 씀
			}
		}

		HSLFPictureData byIndex(int index) {
			if (index < 1 || index > bses.size()) return null;
			EscherBSERecord b = bses.get(index - 1);
			if (b.getSize() == 0) return null;
			for (HSLFPictureData d : data) if (Arrays.equals(d.getUID(), b.getUid())) return d;
			for (HSLFPictureData d : data) if (d.getOffset() == b.getOffset()) return d;
			return null;
		}
	}

	/** 배경 채우기에 쓴 그림 번호 (fillBlip 속성, 0x186 — POI 에서는 FILL__PATTERNTEXTURE 라는 이름) */
	private static int blipIndex(HSLFBackground bg) {
		EscherOptRecord opt = bg.getEscherChild(EscherOptRecord.RECORD_ID);
		if (opt == null) return 0;
		EscherSimpleProperty p = opt.lookup(EscherPropertyTypes.FILL__PATTERNTEXTURE);
		return p == null ? 0 : p.getPropertyValue();
	}

	/** 묶음 안쪽 좌표 → 슬라이드 좌표 */
	private static Rectangle2D map(Rectangle2D r, Rectangle2D group, Rectangle2D interior) {
		if (group == null || interior == null || interior.getWidth() == 0 || interior.getHeight() == 0) return r;
		double sx = group.getWidth() / interior.getWidth(), sy = group.getHeight() / interior.getHeight();
		return new Rectangle2D.Double(group.getX() + (r.getX() - interior.getX()) * sx, group.getY() + (r.getY() - interior.getY()) * sy,
				r.getWidth() * sx, r.getHeight() * sy);
	}

	/** 그림 데이터 → 이미지 (jpg·png·bmp 등. EMF·WMF 같은 형식은 null) */
	private static BufferedImage image(HSLFPictureData d) {
		if (d == null) return null;
		try {
			return ImageIO.read(new ByteArrayInputStream(d.getData()));
		} catch (IOException | RuntimeException e) {
			return null;
		}
	}

	private static byte[] jpeg(BufferedImage img, float quality) throws IOException {
		ImageWriter writer = ImageIO.getImageWritersByFormatName("jpg").next();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
			writer.setOutput(ios);
			ImageWriteParam p = writer.getDefaultWriteParam();
			p.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
			p.setCompressionQuality(quality);
			writer.write(null, new IIOImage(img, null, null), p);
		} finally {
			writer.dispose();
		}
		return out.toByteArray();
	}
}
