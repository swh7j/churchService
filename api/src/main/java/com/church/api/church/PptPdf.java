package com.church.api.church;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.font.FontRenderContext;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFGroupShape;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextParagraph;
import org.apache.poi.xslf.usermodel.XSLFTextRun;
import org.apache.poi.xslf.usermodel.XSLFTextShape;

import com.church.api.common.ApiException;

/**
 * .pptx → 화면마다 그림(JPEG)으로 그린 PDF.
 * 아이폰 기본 미리보기는 복잡한 PPT 를 겹치거나 빠뜨리게 보여 주므로, 휴대폰에서 확인할 때는 PDF 로 봅니다.
 * 서버 메모리가 작아서 한 번에 하나씩만 만듭니다 (30화면 기준 힙 100MB 안쪽).
 */
public final class PptPdf {

	/** 그림 가로 크기(px). 휴대폰으로 보기에 충분하고 PDF 가 너무 커지지 않는 정도 */
	static final int WIDTH = 1280;
	private static final Semaphore ONE = new Semaphore(1);

	private PptPdf() {
	}

	public static byte[] render(byte[] pptx) {
		try {
			if (!ONE.tryAcquire(90, TimeUnit.SECONDS)) throw ApiException.bad("다른 PDF 를 만드는 중입니다. 잠시 뒤 다시 눌러 주세요.");
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw ApiException.bad("PDF 를 만들지 못했습니다.");
		}
		try (XMLSlideShow ss = new XMLSlideShow(new ByteArrayInputStream(pptx))) {
			Dimension d = ss.getPageSize();
			int w = WIDTH;
			int h = (int) Math.round(w * d.getHeight() / d.getWidth());
			double k = w / d.getWidth();
			List<byte[]> pages = new ArrayList<>();
			for (XSLFSlide s : ss.getSlides()) {
				wrapAtSpaces(s.getShapes());
				pages.add(jpeg(draw(s, w, h, k)));
			}
			if (pages.isEmpty()) throw ApiException.bad("화면이 없는 PPT 입니다.");
			return pdf(pages, w, h);
		} catch (ApiException e) {
			throw e;
		} catch (Exception | OutOfMemoryError e) {
			throw ApiException.bad("PDF 를 만들지 못했습니다. PPT 파일을 확인해 주세요.");
		} finally {
			ONE.release();
		}
	}

	/** 줄 폭을 이만큼만 채움 (글자 폭을 어림하므로 POI 가 다시 줄을 나누지 않게 여유를 둠) */
	private static final double FILL = 0.95;
	private static final FontRenderContext FRC = new FontRenderContext(null, true, true);

	/**
	 * 한글 글을 띄어쓰기에서 미리 줄바꿈.
	 * POI 는 한글을 글자마다 줄을 나눌 수 있다고 봐서 "존재합/니다" 처럼 단어 중간에서 끊음
	 * (파워포인트는 단어 단위). 그래서 그리기 전에 줄을 넘는 곳 앞의 빈칸을 줄바꿈으로 바꿔 둠.
	 * 빈칸 없는 아주 긴 단어는 그대로 둠 (POI 가 알아서 자름)
	 */
	static void wrapAtSpaces(List<? extends XSLFShape> shapes) {
		for (XSLFShape sh : shapes) {
			if (sh instanceof XSLFGroupShape gr) wrapAtSpaces(gr.getShapes());
			if (!(sh instanceof XSLFTextShape ts) || !ts.getWordWrap() || ts.getAnchor() == null) continue;
			double box = ts.getAnchor().getWidth() - ts.getLeftInset() - ts.getRightInset();
			for (XSLFTextParagraph p : ts.getTextParagraphs()) {
				if (!HANGUL.matcher(p.getText()).find()) continue;
				double indent = Math.max(0, nz(p.getIndent()));
				wrapParagraph(p, (box - nz(p.getLeftMargin()) - nz(p.getRightMargin()) - indent) * FILL);
			}
		}
	}

	private static final java.util.regex.Pattern HANGUL = java.util.regex.Pattern.compile("[\\uac00-\\ud7af]");

	private static void wrapParagraph(XSLFTextParagraph p, double avail) {
		if (avail <= 0) return;
		double lineW = 0;
		XSLFTextRun spaceRun = null; // 이번 줄의 마지막 빈칸 자리
		int spaceIdx = -1;
		double afterSpace = 0; // 그 빈칸 뒤 글자 폭
		for (XSLFTextRun r : p.getTextRuns()) {
			String t = r.getRawText();
			if (t == null) continue;
			if ("\n".equals(t)) { // 줄 나눔(a:br)
				lineW = 0;
				spaceRun = null;
				continue;
			}
			Font f = new Font(r.getFontFamily() == null ? Font.DIALOG : r.getFontFamily(), r.isBold() ? Font.BOLD : Font.PLAIN, 1)
					.deriveFont((float) (r.getFontSize() == null ? 18 : r.getFontSize()));
			for (int i = 0; i < t.length(); i++) {
				char c = t.charAt(i);
				if (c == '\n') {
					lineW = 0;
					spaceRun = null;
					continue;
				}
				double cw = f.getStringBounds(String.valueOf(c), FRC).getWidth();
				if (c == ' ') {
					spaceRun = r;
					spaceIdx = i;
					afterSpace = 0;
					lineW += cw;
					continue;
				}
				lineW += cw;
				afterSpace += cw;
				if (lineW > avail && spaceRun != null) {
					String s = spaceRun.getRawText();
					spaceRun.setText(s.substring(0, spaceIdx) + "\n" + s.substring(spaceIdx + 1));
					if (spaceRun == r) t = r.getRawText();
					lineW = afterSpace;
					spaceRun = null;
				}
			}
		}
	}

	private static double nz(Double d) {
		return d == null ? 0 : d;
	}

	private static BufferedImage draw(XSLFSlide s, int w, int h, double k) {
		BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = img.createGraphics();
		try {
			g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
			g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
			g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
			g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
			g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
			g.setPaint(Color.WHITE);
			g.fillRect(0, 0, w, h);
			g.scale(k, k);
			s.draw(g);
		} finally {
			g.dispose();
		}
		return img;
	}

	private static byte[] jpeg(BufferedImage img) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageWriter w = ImageIO.getImageWritersByFormatName("jpeg").next();
		ImageWriteParam p = w.getDefaultWriteParam();
		p.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
		p.setCompressionQuality(0.8f);
		try (ImageOutputStream io = ImageIO.createImageOutputStream(out)) {
			w.setOutput(io);
			w.write(null, new IIOImage(img, null, null), p);
		} finally {
			w.dispose();
		}
		return out.toByteArray();
	}

	/** JPEG 들을 한 장씩 담은 PDF. 그림만 넣으므로 PDF 규격 중 꼭 필요한 부분만 직접 씀 */
	static byte[] pdf(List<byte[]> jpegs, int w, int h) throws IOException {
		ByteArrayOutputStream o = new ByteArrayOutputStream();
		List<Integer> xref = new ArrayList<>();
		int n = jpegs.size();
		int pw = 720;
		int ph = Math.round(720f * h / w);
		write(o, "%PDF-1.4\n");
		StringBuilder kids = new StringBuilder();
		for (int i = 0; i < n; i++) kids.append(3 + i * 3).append(" 0 R ");
		obj(o, xref, "<< /Type /Catalog /Pages 2 0 R >>");
		obj(o, xref, "<< /Type /Pages /Count " + n + " /Kids [" + kids + "] >>");
		for (int i = 0; i < n; i++) {
			int page = 3 + i * 3;
			obj(o, xref, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pw + " " + ph + "] /Resources << /XObject << /Im0 " + (page + 2)
					+ " 0 R >> >> /Contents " + (page + 1) + " 0 R >>");
			String c = "q " + pw + " 0 0 " + ph + " 0 0 cm /Im0 Do Q";
			obj(o, xref, "<< /Length " + c.length() + " >>\nstream\n" + c + "\nendstream");
			byte[] img = jpegs.get(i);
			xref.add(o.size());
			write(o, xref.size() + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + w + " /Height " + h
					+ " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + img.length + " >>\nstream\n");
			o.write(img);
			write(o, "\nendstream\nendobj\n");
		}
		int start = o.size();
		StringBuilder x = new StringBuilder("xref\n0 " + (xref.size() + 1) + "\n0000000000 65535 f \n");
		for (int off : xref) x.append(String.format("%010d 00000 n \n", off));
		x.append("trailer\n<< /Size ").append(xref.size() + 1).append(" /Root 1 0 R >>\nstartxref\n").append(start).append("\n%%EOF\n");
		write(o, x.toString());
		return o.toByteArray();
	}

	private static void obj(ByteArrayOutputStream o, List<Integer> xref, String body) throws IOException {
		xref.add(o.size());
		write(o, xref.size() + " 0 obj\n" + body + "\nendobj\n");
	}

	private static void write(ByteArrayOutputStream o, String s) throws IOException {
		o.write(s.getBytes(StandardCharsets.ISO_8859_1));
	}
}
