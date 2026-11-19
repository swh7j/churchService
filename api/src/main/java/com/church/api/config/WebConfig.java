package com.church.api.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * 빌드된 React 화면(dist 폴더)이 있으면 Spring이 같이 제공합니다.
 * 배포할 때 서버 하나(java -jar)로 화면과 API를 모두 서비스할 수 있습니다.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

	private final Path webDir;

	public WebConfig(@Value("${app.web-dir}") String webDir) {
		this.webDir = Path.of(webDir).toAbsolutePath().normalize();
	}

	@Override
	public void addViewControllers(ViewControllerRegistry registry) {
		if (Files.isRegularFile(webDir.resolve("index.html"))) registry.addViewController("/").setViewName("forward:/index.html");
	}

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		if (!Files.isRegularFile(webDir.resolve("index.html"))) return;
		registry.addResourceHandler("/**")
				.addResourceLocations(webDir.toUri().toString())
				.resourceChain(true)
				.addResolver(new PathResourceResolver() {
					@Override
					protected Resource getResource(String path, Resource location) throws IOException {
						if (path.startsWith("api/")) return null; // 없는 API는 화면 대신 404
						Resource r = location.createRelative(path);
						// 파일이 없으면 index.html (React 라우터가 처리하는 주소)
						return r.exists() && r.isReadable() ? r : location.createRelative("index.html");
					}
				});
	}
}
