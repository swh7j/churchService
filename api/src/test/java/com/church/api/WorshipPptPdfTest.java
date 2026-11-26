package com.church.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.geom.Rectangle2D;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.regex.Pattern;

import org.apache.poi.sl.usermodel.ShapeType;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFAutoShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextBox;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 예배 PPT → 휴대폰 확인용 PDF (화면마다 그림 한 장) */
class WorshipPptPdfTest extends IntegrationTest {

	private static final String OCTET = "application/octet-stream";

	/** 화면 n 장짜리 .pptx (화면마다 색 상자와 한글 글자) */
	private static byte[] pptx(int n) throws IOException {
		try (XMLSlideShow ss = new XMLSlideShow(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
			for (int i = 1; i <= n; i++) {
				XSLFSlide s = ss.createSlide();
				XSLFAutoShape box = s.createAutoShape();
				box.setShapeType(ShapeType.RECT);
				box.setAnchor(new Rectangle2D.Double(0, 0, 720, 540));
				box.setFillColor(Color.ORANGE);
				XSLFTextBox t = s.createTextBox();
				t.setAnchor(new Rectangle2D.Double(50, 50, 600, 100));
				t.setText("찬송가 " + i + "장");
			}
			ss.write(out);
			return out.toByteArray();
		}
	}

	@Test
	@DisplayName("화면 수만큼 쪽이 있는 PDF 를 돌려줌")
	void makesPdf() throws IOException {
		Res r = admin().postRaw("/api/worship-ppt/pdf", OCTET, pptx(3)).ok();
		assertThat(r.header("Content-Type")).startsWith("application/pdf");
		assertThat(r.body()).startsWith("%PDF-");
		assertThat(r.body()).contains("/Count 3");
		assertThat(Pattern.compile("/Type /Page ").matcher(r.body()).results().count()).isEqualTo(3);
		assertThat(r.body()).contains("/Filter /DCTDecode").endsWith("%%EOF\n");
	}

	@Test
	@DisplayName(".pptx 가 아니면 거절, 로그인 안 하면 401")
	void rejects() throws IOException {
		Client a = admin();
		assertThat(a.postRaw("/api/worship-ppt/pdf", OCTET, "hello".getBytes()).status()).isEqualTo(400);
		assertThat(a.postRaw("/api/worship-ppt/pdf", OCTET, new byte[] { 'P', 'K', 3, 4, 0, 0 }).status()).isEqualTo(400);
		assertThat(client().postRaw("/api/worship-ppt/pdf", OCTET, pptx(1)).status()).isEqualTo(401);
	}
}
