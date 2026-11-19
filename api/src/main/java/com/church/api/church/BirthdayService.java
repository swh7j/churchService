package com.church.api.church;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.church.api.common.Api;
import com.ibm.icu.util.Calendar;
import com.ibm.icu.util.ChineseCalendar;
import com.ibm.icu.util.DangiCalendar;

/**
 * 교인 생일 계산.
 * 음력 생일은 한국 음력(DangiCalendar)으로 해마다 양력 날짜를 계산합니다.
 */
@Service
public class BirthdayService {

	private final JdbcTemplate jdbc;

	public BirthdayService(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** 음력 (lunarYear년 month월 day일, 윤달 아님) → 양력. 그 달에 해당 날짜가 없으면(30일 등) 하루씩 앞당김 */
	public static synchronized LocalDate lunarToSolar(int lunarYear, int month, int day) {
		DangiCalendar cal = new DangiCalendar();
		ZoneId zone = ZoneId.of(cal.getTimeZone().getID());
		// 양력 7월 1일은 항상 같은 해의 음력 해 안에 있으므로, 그날로 음력 연도(EXTENDED_YEAR)를 구함
		cal.setTime(Date.from(LocalDate.of(lunarYear, 7, 1).atStartOfDay(zone).toInstant()));
		int extendedYear = cal.get(Calendar.EXTENDED_YEAR);
		for (int d = day; d >= Math.min(day, 28); d--) {
			cal.clear();
			cal.set(Calendar.EXTENDED_YEAR, extendedYear);
			cal.set(Calendar.MONTH, month - 1);
			cal.set(ChineseCalendar.IS_LEAP_MONTH, 0);
			cal.set(Calendar.DAY_OF_MONTH, d);
			Date t = cal.getTime();
			if (cal.get(Calendar.MONTH) == month - 1 && cal.get(Calendar.DAY_OF_MONTH) == d && cal.get(ChineseCalendar.IS_LEAP_MONTH) == 0)
				return t.toInstant().atZone(zone).toLocalDate();
		}
		return null;
	}

	/** 생일(월·일, 음력 여부) 중 해당 양력 월에 해당하는 날짜들 */
	static List<LocalDate> datesIn(YearMonth ym, int month, int day, boolean lunar) {
		List<LocalDate> out = new ArrayList<>();
		if (lunar) {
			// 음력 12월 생일은 다음 해 1~2월이 될 수 있으므로 전년도 음력도 확인
			for (int ly : new int[] { ym.getYear() - 1, ym.getYear() }) {
				LocalDate s = lunarToSolar(ly, month, day);
				if (s != null && YearMonth.from(s).equals(ym)) out.add(s);
			}
		} else if (month == ym.getMonthValue()) {
			out.add(ym.atDay(Math.min(day, ym.lengthOfMonth()))); // 2월 29일 → 평년엔 28일
		}
		return out;
	}

	/**
	 * 해당 양력 월의 생일자 (재적·새가족만).
	 * publicOnly=true 이면 '성도 화면에 생일 공개'에 동의한 사람만, 이름·직분·날짜만 돌려줌.
	 */
	public List<Map<String, Object>> inMonth(YearMonth ym, boolean publicOnly) {
		String sql = """
				SELECT id, name, position, birth_month, birth_day, birth_lunar FROM members
				 WHERE birth_month BETWEEN 1 AND 12 AND birth_day BETWEEN 1 AND 31 AND status IN ('재적','새가족')"""
				+ (publicOnly ? " AND birthday_public = 1" : "");
		List<Map<String, Object>> out = new ArrayList<>();
		for (Map<String, Object> r : jdbc.queryForList(sql)) {
			int m = (int) Api.num(r.get("birth_month")), d = (int) Api.num(r.get("birth_day"));
			boolean lunar = Api.num(r.get("birth_lunar")) == 1;
			for (LocalDate s : datesIn(ym, m, d, lunar)) {
				out.add(publicOnly
						? Api.map("name", r.get("name"), "position", r.get("position"), "month", s.getMonthValue(), "day", s.getDayOfMonth())
						: Api.map("id", r.get("id"), "name", r.get("name"), "position", r.get("position"),
								"month", s.getMonthValue(), "day", s.getDayOfMonth(), "lunar", lunar, "birth_month", m, "birth_day", d));
			}
		}
		out.sort(Comparator.comparingInt((Map<String, Object> x) -> (int) x.get("day")).thenComparing(x -> (String) x.get("name")));
		return out;
	}
}
