package com.church.api.church;

import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.common.Api;
import com.church.api.common.ApiException;

/**
 * 성도 화면용 공개 API (로그인 없이 접근 가능, SecurityConfig 에서 허용)
 * - '성도 화면에 공개'(is_public=1) 로 체크된 교회 소식·주보·행사만
 * - 필요한 컬럼만 명시적으로 조회 (주보 내부 메모 등은 내보내지 않음)
 * - 교인·헌금·장부 등 다른 데이터는 이 컨트롤러에서 절대 조회하지 않음
 */
@RestController
@RequestMapping("/api/public")
public class PublicController {

	private static final String NEWS_COLS = "id, title, category, content, pinned, date";
	private static final String BULLETIN_LIST_COLS = "id, date, title, preacher, sermon_title, scripture";
	private static final String BULLETIN_COLS = BULLETIN_LIST_COLS + ", worship_order, announcements, prayer_requests";
	private static final String EVENT_COLS = "id, title, start_date, end_date, location, description";
	// 다음 주일 주보를 주중에 미리 올려도 보이도록, 오늘부터 6일 뒤까지의 주보 공개
	private static final String BULLETIN_VISIBLE = "is_public = 1 AND date <= date('now','localtime','+6 days')";

	private final JdbcTemplate jdbc;
	private final BirthdayService birthdays;

	public PublicController(JdbcTemplate jdbc, BirthdayService birthdays) {
		this.jdbc = jdbc;
		this.birthdays = birthdays;
	}

	@GetMapping("/info")
	public Map<String, Object> info() {
		List<String> v = jdbc.queryForList("SELECT value FROM settings WHERE key = 'church_name'", String.class);
		return Api.map("churchName", v.isEmpty() || v.get(0) == null || v.get(0).isBlank() ? "우리교회" : v.get(0));
	}

	/** 첫 화면: 이번 주 주보 + 최근 소식 + 다가오는 행사 */
	@GetMapping("/home")
	public Map<String, Object> home() {
		List<Map<String, Object>> bulletin = jdbc.queryForList(
				"SELECT " + BULLETIN_LIST_COLS + " FROM bulletins WHERE " + BULLETIN_VISIBLE + " ORDER BY date DESC, id DESC LIMIT 1");
		return Api.map(
				"bulletin", bulletin.isEmpty() ? null : bulletin.get(0),
				"news", jdbc.queryForList("SELECT " + NEWS_COLS + " FROM news WHERE is_public = 1 ORDER BY pinned DESC, date DESC, id DESC LIMIT 5"),
				"events", jdbc.queryForList("SELECT " + EVENT_COLS + " FROM events WHERE is_public = 1 AND COALESCE(end_date, start_date) >= ? ORDER BY start_date LIMIT 5", Api.today()),
				// 생일 공개에 동의한 교인만, 이름·직분·이번 달 날짜(월·일)만
				"birthdays", birthdays.inMonth(YearMonth.now(), true));
	}

	@GetMapping("/news")
	public List<Map<String, Object>> news(@RequestParam(required = false) String category) {
		if (category == null || category.isEmpty())
			return jdbc.queryForList("SELECT " + NEWS_COLS + " FROM news WHERE is_public = 1 ORDER BY pinned DESC, date DESC, id DESC LIMIT 100");
		return jdbc.queryForList("SELECT " + NEWS_COLS + " FROM news WHERE is_public = 1 AND category = ? ORDER BY pinned DESC, date DESC, id DESC LIMIT 100", category);
	}

	@GetMapping("/bulletins")
	public List<Map<String, Object>> bulletins() {
		return jdbc.queryForList("SELECT " + BULLETIN_LIST_COLS + " FROM bulletins WHERE " + BULLETIN_VISIBLE + " ORDER BY date DESC, id DESC LIMIT 104");
	}

	@GetMapping("/bulletins/{id}")
	public Map<String, Object> bulletin(@PathVariable long id) {
		List<Map<String, Object>> r = jdbc.queryForList("SELECT " + BULLETIN_COLS + " FROM bulletins WHERE id = ? AND " + BULLETIN_VISIBLE, id);
		if (r.isEmpty()) throw ApiException.notFound("주보를 찾을 수 없습니다.");
		return r.get(0);
	}

	@GetMapping("/events")
	public Map<String, Object> events() {
		String t = Api.today();
		return Api.map(
				"upcoming", jdbc.queryForList("SELECT " + EVENT_COLS + " FROM events WHERE is_public = 1 AND COALESCE(end_date, start_date) >= ? ORDER BY start_date", t),
				"past", jdbc.queryForList("SELECT " + EVENT_COLS + " FROM events WHERE is_public = 1 AND COALESCE(end_date, start_date) < ? ORDER BY start_date DESC LIMIT 20", t));
	}
}
