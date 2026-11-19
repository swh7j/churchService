package com.church.api.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * 빌드된 React 화면을 Spring이 같이 제공합니다. (java -jar 하나로 화면 + API)
 * 1순위: app.web-dir 폴더 (예: ../dist)
 * 2순위: jar 안에 들어 있는 화면 (npm run build 시 src/main/resources/static 에 들어감)
 * 둘 다 없으면 (개발 중, Vite 사용) 화면은 제공하지 않습니다.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

	private final String location;

	public WebConfig(@Value("${app.web-dir}") String webDir) {
		Path dir = Path.of(webDir).toAbsolutePath().normalize();
		if (Files.isRegularFile(dir.resolve("index.html"))) location = dir.toUri().toString();
		else if (new ClassPathResource("static/index.html").exists()) location = "classpath:/static/";
		else location = null;
	}

	@Override
	public void addViewControllers(ViewControllerRegistry registry) {
		if (location != null) registry.addViewController("/").setViewName("forward:/index.html");
	}

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		if (location == null) return;
		registry.addResourceHandler("/**")
				.addResourceLocations(location)
				.resourceChain(true)
				.addResolver(new PathResourceResolver() {
					@Override
					protected Resource getResource(String path, Resource loc) throws IOException {
						if (path.startsWith("api/")) return null; // 없는 API는 화면 대신 404
						Resource r = loc.createRelative(path);
						// 파일이 없으면 index.html (React 라우터가 처리하는 주소: /admin, /news 등)
						return r.exists() && r.isReadable() ? r : loc.createRelative("index.html");
					}
				});
	}
}
