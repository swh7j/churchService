package com.church.api.church;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.geom.Rectangle2D;
import java.util.Arrays;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextBox;
import org.apache.poi.xslf.usermodel.XSLFTextParagraph;
import org.apache.poi.xslf.usermodel.XSLFTextRun;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 휴대폰 확인용 PDF: 한글이 단어 중간에서 끊기지 않게 띄어쓰기에서 미리 줄바꿈 */
class PptPdfWrapTest {

	private static final String MISSION = "이웃을 섬기며 복음을 전하는 교회가 되기 위해 존재합니다";

	private static String wrapped(String text, double width) throws Exception {
		try (XMLSlideShow ss = new XMLSlideShow()) {
			XSLFSlide s = ss.createSlide();
			XSLFTextBox t = s.createTextBox();
			t.setAnchor(new Rectangle2D.Double(0, 0, width, 300));
			t.setWordWrap(true);
			XSLFTextRun r = t.getTextParagraphs().get(0).addNewTextRun();
			r.setText(text);
			r.setFontSize(24.0);
			PptPdf.wrapAtSpaces(s.getShapes());
			StringBuilder out = new StringBuilder();
			for (XSLFTextParagraph p : t.getTextParagraphs())
				for (XSLFTextRun x : p.getTextRuns()) out.append(x.getRawText());
			return out.toString();
		}
	}

	@Test
	@DisplayName("줄을 넘는 글은 띄어쓰기를 줄바꿈으로 바꾸고, 단어는 그대로")
	void wrapsAtSpaces() throws Exception {
		String out = wrapped(MISSION, 400);
		assertThat(out).contains("\n");
		assertThat(out.replace('\n', ' ')).isEqualTo(MISSION);
		// 줄마다 단어 그대로 (원래 단어 목록과 같음)
		assertThat(Arrays.stream(out.split("[\n ]")).toList()).containsExactly(MISSION.split(" "));
	}

	@Test
	@DisplayName("한 줄에 들어가는 글이나 한글이 없는 글은 그대로")
	void keepsShortText() throws Exception {
		assertThat(wrapped("찬송가 3장", 400)).isEqualTo("찬송가 3장");
		String en = "Amazing grace how sweet the sound that saved a wretch like me";
		assertThat(wrapped(en, 200)).isEqualTo(en);
	}
}
