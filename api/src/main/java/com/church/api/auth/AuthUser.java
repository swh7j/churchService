package com.church.api.auth;

import java.util.Map;

import com.church.api.common.Api;

/** 로그인한 사용자 (SecurityContext 의 principal) */
public record AuthUser(long id, String username, String name, String role) {

	public Map<String, Object> toPublic() {
		return Api.map("id", id, "username", username, "name", name, "role", role, "roleLabel", Roles.label(role));
	}
}
