package com.cardocs.api.integrations.queue;

import com.cardocs.api.config.AppProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "cardocs.providers", name = "queue", havingValue = "sqs", matchIfMissing = true)
public class SqsQueueProvider implements QueueProvider {

    private final AppProperties properties;
    private final SqsClient sqsClient;
    private final ObjectMapper objectMapper;

    @Override
    public void send(QueueName queueName, Object payload) {
        String queueUrl = queueUrl(queueName);
        if (queueUrl == null || queueUrl.isBlank()) {
            log.info("SQS queue URL not configured for {}; message not sent in this environment", queueName);
            return;
        }
        try {
            sqsClient.sendMessage(SendMessageRequest.builder()
                .queueUrl(queueUrl)
                .messageBody(objectMapper.writeValueAsString(payload))
                .build());
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("Payload de fila inválido", ex);
        }
    }

    private String queueUrl(QueueName queueName) {
        return switch (queueName) {
            case OCR_PROCESSING -> properties.getAws().getSqsOcrQueueUrl();
            case PDF_EXPORT -> properties.getAws().getSqsPdfExportQueueUrl();
            case DATA_EXPORT -> properties.getAws().getSqsDataExportQueueUrl();
        };
    }
}
