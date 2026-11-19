package com.church.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling // 자동 백업
public class ChurchApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(ChurchApiApplication.class, args);
	}
}
