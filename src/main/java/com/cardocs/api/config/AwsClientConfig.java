package com.cardocs.api.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.sqs.SqsClient;

@Configuration
@RequiredArgsConstructor
public class AwsClientConfig {

    private final AppProperties properties;

    @Bean
    S3Presigner s3Presigner() {
        return S3Presigner.builder()
            .region(Region.of(properties.getAws().getRegion()))
            .credentialsProvider(DefaultCredentialsProvider.create())
            .build();
    }

    @Bean
    SqsClient sqsClient() {
        return SqsClient.builder()
            .region(Region.of(properties.getAws().getRegion()))
            .credentialsProvider(DefaultCredentialsProvider.create())
            .build();
    }
}
