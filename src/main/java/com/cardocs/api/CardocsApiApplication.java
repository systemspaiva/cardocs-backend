package com.cardocs.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class CardocsApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(CardocsApiApplication.class, args);
    }
}
