package com.cardocs.api.config;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "cardocs")
public class AppProperties {

    private App app = new App();
    private Jwt jwt = new Jwt();
    private Aws aws = new Aws();
    private Providers providers = new Providers();
    private Features features = new Features();
    private Storage storage = new Storage();

    @Getter
    @Setter
    public static class App {
        private String baseUrl;
        private String corsAllowedOrigins;
    }

    @Getter
    @Setter
    public static class Jwt {
        private String secret;
        private Duration accessTokenExpiration = Duration.ofMinutes(15);
        private Duration refreshTokenExpiration = Duration.ofDays(30);
    }

    @Getter
    @Setter
    public static class Aws {
        private String region;
        private String s3Bucket;
        private String sqsOcrQueueUrl;
        private String sqsPdfExportQueueUrl;
        private String sqsDataExportQueueUrl;
    }

    @Getter
    @Setter
    public static class Providers {
        private String ocr = "mock";
        private String vehicleRegistry = "mock";
        private String storage = "s3";
        private String notification = "mock";
        private String queue = "sqs";
    }

    @Getter
    @Setter
    public static class Features {
        private boolean vehicleRegistryIntegration;
        private boolean ocrIntegration = true;
        private boolean notifications;
        private boolean publicShareLink = true;
    }

    @Getter
    @Setter
    public static class Storage {
        private long maxDocumentSizeBytes = 10 * 1024 * 1024;
        private List<String> allowedContentTypes = new ArrayList<>();
    }
}
