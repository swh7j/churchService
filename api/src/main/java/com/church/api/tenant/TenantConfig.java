package com.church.api.tenant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
public class TenantConfig {

	private static final Logger log = LoggerFactory.getLogger(TenantConfig.class);

	/** 로그인 확인 필터(Spring Security, -100)보다 먼저 */
	@Bean
	public FilterRegistrationBean<ChurchFilter> churchFilter(ChurchRegistry registry) {
		FilterRegistrationBean<ChurchFilter> b = new FilterRegistrationBean<>(new ChurchFilter(registry));
		b.addUrlPatterns("/api/*");
		b.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
		return b;
	}

	/** 시작할 때 사용 중인 교회 DB를 미리 열어 테이블·새 컬럼을 준비 */
	@Bean
	public ApplicationRunner prepareChurches(ChurchRegistry registry, JdbcTemplate jdbc) {
		return args -> {
			for (ChurchRegistry.Church c : registry.all()) {
				if (!c.active()) continue;
				try {
					ChurchContext.run(c.code(), () -> jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class));
					log.info("교회 준비 완료: {} ({})", c.name(), c.code());
				} catch (Exception e) {
					log.error("교회 DB를 열지 못했습니다: {} - {}", c.code(), e.getMessage());
				}
			}
		};
	}
}
