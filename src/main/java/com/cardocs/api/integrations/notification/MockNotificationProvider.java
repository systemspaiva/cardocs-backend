package com.cardocs.api.integrations.notification;

import com.cardocs.api.notifications.NotificationEvent;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@ConditionalOnProperty(prefix = "cardocs.providers", name = "notification", havingValue = "mock", matchIfMissing = true)
public class MockNotificationProvider implements NotificationProvider {

    @Override
    public void notify(UUID userId, NotificationEvent event, Map<String, Object> payload) {
        log.info("Mock notification userId={} event={} payloadKeys={}", userId, event, payload.keySet());
    }
}
