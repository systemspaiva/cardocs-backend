package com.cardocs.api.integrations.queue;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@ConditionalOnProperty(prefix = "cardocs.providers", name = "queue", havingValue = "mock", matchIfMissing = true)
public class MockQueueProvider implements QueueProvider {

    @Override
    public void send(QueueName queueName, Object payload) {
        log.info("Mock queue message queued queueName={} payloadType={}", queueName, payload.getClass().getSimpleName());
    }
}
