package com.church.api.common;

import java.util.Collection;
import java.util.Map;

/** 활동 기록에 남길 간단한 JSON 문자열 변환 (Map / List / 문자열 / 숫자) */
public final class Json {

	private Json() {
	}

	public static String of(Object o) {
		StringBuilder sb = new StringBuilder();
		write(sb, o);
		return sb.toString();
	}

	private static void write(StringBuilder sb, Object o) {
		if (o == null) {
			sb.append("null");
		} else if (o instanceof Number || o instanceof Boolean) {
			sb.append(o);
		} else if (o instanceof Map<?, ?> m) {
			sb.append('{');
			boolean first = true;
			for (Map.Entry<?, ?> e : m.entrySet()) {
				if (!first) sb.append(',');
				first = false;
				quote(sb, String.valueOf(e.getKey()));
				sb.append(':');
				write(sb, e.getValue());
			}
			sb.append('}');
		} else if (o instanceof Collection<?> c) {
			sb.append('[');
			boolean first = true;
			for (Object v : c) {
				if (!first) sb.append(',');
				first = false;
				write(sb, v);
			}
			sb.append(']');
		} else {
			quote(sb, String.valueOf(o));
		}
	}

	public static String quote(String s) {
		StringBuilder sb = new StringBuilder();
		quote(sb, s);
		return sb.toString();
	}

	private static void quote(StringBuilder sb, String s) {
		sb.append('"');
		for (char ch : s.toCharArray()) {
			switch (ch) {
				case '"' -> sb.append("\\\"");
				case '\\' -> sb.append("\\\\");
				case '\n' -> sb.append("\\n");
				case '\r' -> sb.append("\\r");
				case '\t' -> sb.append("\\t");
				default -> {
					if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch));
					else sb.append(ch);
				}
			}
		}
		sb.append('"');
	}
}
