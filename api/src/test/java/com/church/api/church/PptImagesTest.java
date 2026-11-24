package com.church.api.church;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.imageio.ImageIO;

import org.apache.poi.hslf.usermodel.HSLFFill;
import org.apache.poi.hslf.usermodel.HSLFPictureData;
import org.apache.poi.hslf.usermodel.HSLFPictureShape;
import org.apache.poi.hslf.usermodel.HSLFSlide;
import org.apache.poi.hslf.usermodel.HSLFSlideShow;
import org.apache.poi.sl.usermodel.PictureData.PictureType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.church.api.common.ApiException;

/**
 * 옛날 파워포인트(.ppt) 찬송가 → 화면 그림.
 * 실제 찬송가 PPT처럼 '배경 그림(빨강)' 위에 '투명 그림(가운데 파란 네모)'을 얹은 .ppt 를 만들어서,
 * 바꾼 그림의 구석은 배경색, 가운데는 위 그림 색인지 확인 (배경이 빠지던 문제 재발 방지)
 */
class PptImagesTest {

	private static final int FILL_PICTURE = 3; // MS-PPT msofillPicture

	@Test
	@DisplayName("배경 + 투명 그림을 한 장으로 겹쳐서, 슬라이드마다 JPEG 한 장")
	void composesBackgroundAndPicture() throws IOException {
		byte[] ppt = sampleHymnPpt(3);
		PptImages.Result r = PptImages.toZip(ppt);

		assertThat(r.count()).isEqualTo(3);
		assertThat(r.skipped()).isZero();
		List<BufferedImage> images = unzip(r.zip());
		assertThat(images).hasSize(3);

		BufferedImage img = images.get(0);
		assertThat(img.getHeight()).isEqualTo(1080);
		assertThat(img.getWidth()).isEqualTo(1440); // 4:3
		assertThat(isReddish(new Color(img.getRGB(20, 20)))).as("구석은 배경(빨강)").isTrue();
		assertThat(isBluish(new Color(img.getRGB(img.getWidth() / 2, img.getHeight() / 2)))).as("가운데는 위 그림(파랑)").isTrue();
	}

	@Test
	@DisplayName("가사가 글자로 든 화면은 세어서 알려 줌 (글자는 그리지 않으므로 올린 사람에게 경고) — 쪽 번호만 있는 건 빼고")
	void countsTextSlides() throws IOException {
		assertThat(PptImages.toZip(sampleHymnPpt(2)).textSlides()).isZero();
		try (HSLFSlideShow show = new HSLFSlideShow(new ByteArrayInputStream(sampleHymnPpt(3))); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
			var lyric = show.getSlides().get(0).createTextBox();
			lyric.setText("주 예수 사랑 기쁨 내 마음속에");
			lyric.setAnchor(new Rectangle2D.Double(50, 50, 400, 100));
			var page = show.getSlides().get(1).createTextBox();
			page.setText("2/8");
			page.setAnchor(new Rectangle2D.Double(10, 500, 60, 30));
			show.write(out);
			PptImages.Result r = PptImages.toZip(out.toByteArray());
			assertThat(r.count()).isEqualTo(3);
			assertThat(r.textSlides()).isEqualTo(1);
		}
	}

	@Test
	@DisplayName(".ppt 가 아니면 알아듣기 쉬운 오류")
	void rejectsNonPpt() {
		assertThatThrownBy(() -> PptImages.toZip("hello".getBytes())).isInstanceOf(ApiException.class).hasMessageContaining(".ppt");
		assertThatThrownBy(() -> PptImages.toZip(new byte[] { (byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, 0, 0, 0, 0, 1, 2, 3 }))
				.isInstanceOf(ApiException.class);
	}

	@Test
	@DisplayName("그림이 하나도 없는 PPT(글자만)는 안내 문구와 함께 거절")
	void textOnlyPpt() throws IOException {
		try (HSLFSlideShow show = new HSLFSlideShow(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
			show.createSlide();
			show.write(out);
			assertThatThrownBy(() -> PptImages.toZip(out.toByteArray())).isInstanceOf(ApiException.class).hasMessageContaining("그림");
		}
	}

	// ---------- 테스트용 .ppt 만들기 ----------

	/** 슬라이드 n장: 배경 = 빨간 그림, 위에 가운데만 파란 투명 PNG */
	static byte[] sampleHymnPpt(int slides) throws IOException {
		try (HSLFSlideShow show = new HSLFSlideShow(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
			show.setPageSize(new java.awt.Dimension(720, 540));
			HSLFPictureData bg = show.addPicture(png(64, 48, Color.RED, null), PictureType.PNG);
			HSLFPictureData fg = show.addPicture(png(200, 150, null, Color.BLUE), PictureType.PNG);
			for (int i = 0; i < slides; i++) {
				HSLFSlide s = show.createSlide();
				s.setFollowMasterBackground(false);
				HSLFFill fill = s.getBackground().getFill();
				fill.setFillType(FILL_PICTURE);
				fill.setPictureData(bg);
				HSLFPictureShape p = new HSLFPictureShape(fg);
				p.setAnchor(new Rectangle2D.Double(0, 0, 720, 540));
				s.addShape(p);
			}
			show.write(out);
			return out.toByteArray();
		}
	}

	/** 전체를 bg 색으로(없으면 투명), 가운데 1/3 을 center 색으로 */
	private static byte[] png(int w, int h, Color bg, Color center) throws IOException {
		BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		if (bg != null) {
			g.setColor(bg);
			g.fillRect(0, 0, w, h);
		}
		if (center != null) {
			g.setColor(center);
			g.fillRect(w / 3, h / 3, w / 3, h / 3);
		}
		g.dispose();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(img, "png", out);
		return out.toByteArray();
	}

	private static List<BufferedImage> unzip(byte[] zip) throws IOException {
		List<BufferedImage> list = new ArrayList<>();
		try (ZipInputStream z = new ZipInputStream(new ByteArrayInputStream(zip))) {
			for (ZipEntry e; (e = z.getNextEntry()) != null;) {
				assertThat(e.getName()).matches("\\d{3}\\.jpg");
				list.add(ImageIO.read(new ByteArrayInputStream(z.readAllBytes())));
			}
		}
		return list;
	}

	private static boolean isReddish(Color c) {
		return c.getRed() > 180 && c.getGreen() < 80 && c.getBlue() < 80;
	}

	private static boolean isBluish(Color c) {
		return c.getBlue() > 180 && c.getRed() < 80 && c.getGreen() < 80;
	}
}
