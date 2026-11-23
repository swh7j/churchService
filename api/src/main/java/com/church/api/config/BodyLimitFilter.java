package com.church.api.config;

import java.io.IOException;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 요청 크기 제한: 아주 큰 데이터를 보내 작은 서버의 메모리를 바닥내는 공격을 막음.
 *  - 로그인 없이 쓰는 기능(성도 화면·로그인·기도제목·전체 관리자 로그인): 64KB
 *  - 그 밖 (로그인한 관리자의 업로드: 예배 PPT 서식 최대 40MB 등): 50MB
 * (웹서버 Caddy 에서도 50MB 로 한 번 더 막음)
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class BodyLimitFilter extends OncePerRequestFilter {

	static final long SMALL = 64 * 1024;
	static final long LARGE = 50L * 1024 * 1024;

	static long limitFor(String uri) {
		if (uri.startsWith("/api/public/") || uri.startsWith("/api/auth/") || uri.equals("/api/platform/login") || uri.equals("/api/platform/setup")) return SMALL;
		return LARGE;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
		long limit = limitFor(req.getRequestURI());
		long len = req.getContentLengthLong();
		if (len > limit) {
			res.setStatus(413);
			res.setContentType("application/json;charset=UTF-8");
			res.getWriter().write("{\"error\":\"보내는 데이터가 너무 큽니다.\"}");
			return;
		}
		// 길이를 미리 알리지 않는 요청(chunked)은 읽는 동안 세어서 넘으면 끊음
		chain.doFilter(len < 0 ? new Limited(req, limit) : req, res);
	}

	private static final class Limited extends HttpServletRequestWrapper {
		private final long limit;
		private ServletInputStream in;

		Limited(HttpServletRequest req, long limit) {
			super(req);
			this.limit = limit;
		}

		@Override
		public ServletInputStream getInputStream() throws IOException {
			if (in != null) return in;
			ServletInputStream src = super.getInputStream();
			in = new ServletInputStream() {
				private long read;

				private void count(long n) throws IOException {
					if (n > 0 && (read += n) > limit) throw new IOException("요청이 너무 큽니다.");
				}

				@Override
				public int read() throws IOException {
					int b = src.read();
					if (b >= 0) count(1);
					return b;
				}

				@Override
				public int read(byte[] b, int off, int len) throws IOException {
					int n = src.read(b, off, len);
					count(n);
					return n;
				}

				@Override
				public boolean isFinished() {
					return src.isFinished();
				}

				@Override
				public boolean isReady() {
					return src.isReady();
				}

				@Override
				public void setReadListener(ReadListener l) {
					src.setReadListener(l);
				}
			};
			return in;
		}
	}
}
