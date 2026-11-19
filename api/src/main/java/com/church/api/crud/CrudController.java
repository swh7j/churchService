package com.church.api.crud;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.church.api.audit.AuditService;
import com.church.api.auth.AuthUser;
import com.church.api.auth.Roles;
import com.church.api.common.ApiException;

/**
 * 테이블 공통 CRUD: GET/POST /api/{res}, GET/PUT/DELETE /api/{res}/{id}
 * 조회 조건: ?컬럼=값 (filters), ?from=&to= (날짜), ?q= (검색)
 * /api/ledger 처럼 이름이 정해진 주소는 다른 컨트롤러가 우선 처리합니다.
 */
@RestController
@RequestMapping("/api")
public class CrudController {

	private final JdbcTemplate jdbc;
	private final AuditService audit;

	public CrudController(JdbcTemplate jdbc, AuditService audit) {
		this.jdbc = jdbc;
		this.audit = audit;
	}

	private static Resource resource(String name) {
		Resource r = Resources.ALL.get(name);
		if (r == null) throw ApiException.notFound("없는 API입니다.");
		return r;
	}

	private static boolean canRead(AuthUser u, Resource r) {
		return Roles.has(u, r.area()) || r.alsoRead().stream().anyMatch(a -> Roles.has(u, a));
	}

	private static boolean canWrite(AuthUser u, Resource r) {
		return r.adminWrite() ? Roles.has(u, "admin") : Roles.has(u, r.area());
	}

	/** 요청 본문에서 허용된 컬럼만 골라냄. 빈 문자열 → null, true/false → 1/0 */
	private static Map<String, Object> picked(Resource r, Map<String, Object> body) {
		Map<String, Object> data = new LinkedHashMap<>();
		for (String c : r.cols()) {
			if (body == null || !body.containsKey(c)) continue;
			Object v = body.get(c);
			if (v instanceof String s && s.isEmpty()) v = null;
			if (v instanceof Boolean b) v = b ? 1 : 0;
			data.put(c, v);
		}
		if (data.isEmpty()) throw ApiException.bad("입력된 값이 없습니다.");
		return data;
	}

	private Map<String, Object> findOne(Resource r, long id) {
		List<Map<String, Object>> rows = jdbc.queryForList(r.baseSelect() + " WHERE " + r.col("id") + " = ?", id);
		return rows.isEmpty() ? null : rows.get(0);
	}

	@GetMapping("/{res}")
	public List<Map<String, Object>> list(@PathVariable String res, @RequestParam Map<String, String> q) {
		Resource r = resource(res);
		Roles.require(canRead(Roles.current(), r));
		List<String> where = new ArrayList<>();
		List<Object> params = new ArrayList<>();
		for (String f : r.filters()) {
			String v = q.get(f);
			if (v != null && !v.isEmpty()) {
				where.add(r.col(f) + " = ?");
				params.add(v);
			}
		}
		if (r.dateCol() != null && q.get("from") != null && !q.get("from").isEmpty()) {
			where.add(r.col(r.dateCol()) + " >= ?");
			params.add(q.get("from"));
		}
		if (r.dateCol() != null && q.get("to") != null && !q.get("to").isEmpty()) {
			where.add(r.col(r.dateCol()) + " <= ?");
			params.add(q.get("to"));
		}
		String keyword = q.get("q");
		if (!r.search().isEmpty() && keyword != null && !keyword.isEmpty()) {
			where.add("(" + String.join(" OR ", r.search().stream().map(s -> s + " LIKE ?").toList()) + ")");
			r.search().forEach(s -> params.add("%" + keyword + "%"));
		}
		String sql = r.baseSelect() + (where.isEmpty() ? "" : " WHERE " + String.join(" AND ", where)) + " ORDER BY " + r.order();
		return jdbc.queryForList(sql, params.toArray());
	}

	@GetMapping("/{res}/{id}")
	public Map<String, Object> get(@PathVariable String res, @PathVariable long id) {
		Resource r = resource(res);
		Roles.require(canRead(Roles.current(), r));
		Map<String, Object> row = findOne(r, id);
		if (row == null) throw ApiException.notFound("데이터를 찾을 수 없습니다.");
		return row;
	}

	@PostMapping("/{res}")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> create(@PathVariable String res, @RequestBody Map<String, Object> body) {
		Resource r = resource(res);
		Roles.require(canWrite(Roles.current(), r));
		Map<String, Object> data = picked(r, body);
		List<String> cols = new ArrayList<>(data.keySet());
		String sql = "INSERT INTO " + r.table() + " (" + String.join(",", cols) + ") VALUES (" + String.join(",", cols.stream().map(c -> "?").toList()) + ")";
		GeneratedKeyHolder keys = new GeneratedKeyHolder();
		jdbc.update(con -> {
			PreparedStatement ps = con.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
			int i = 1;
			for (Object v : data.values()) ps.setObject(i++, v);
			return ps;
		}, keys);
		long id = keys.getKey().longValue();
		audit.log("등록", r.table(), id, data);
		return findOne(r, id);
	}

	@PutMapping("/{res}/{id}")
	public Map<String, Object> update(@PathVariable String res, @PathVariable long id, @RequestBody Map<String, Object> body) {
		Resource r = resource(res);
		Roles.require(canWrite(Roles.current(), r));
		Map<String, Object> data = picked(r, body);
		String sets = String.join(", ", data.keySet().stream().map(c -> c + " = ?").toList());
		List<Object> params = new ArrayList<>(data.values());
		params.add(id);
		jdbc.update("UPDATE " + r.table() + " SET " + sets + " WHERE id = ?", params.toArray());
		audit.log("수정", r.table(), id, data);
		return findOne(r, id);
	}

	@DeleteMapping("/{res}/{id}")
	public Map<String, Object> delete(@PathVariable String res, @PathVariable long id) {
		Resource r = resource(res);
		Roles.require(canWrite(Roles.current(), r));
		List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM " + r.table() + " WHERE id = ?", id);
		jdbc.update("DELETE FROM " + r.table() + " WHERE id = ?", id);
		if (!before.isEmpty()) audit.log("삭제", r.table(), id, before.get(0)); // 삭제된 내용을 기록에 남김
		return Map.of("ok", true);
	}
}
