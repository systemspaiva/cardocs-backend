package com.cardocs.api.integrations.notification;

import com.cardocs.api.notifications.NotificationEvent;
import java.util.Map;
import java.util.UUID;

public interface NotificationProvider {
    void notify(UUID userId, NotificationEvent event, Map<String, Object> payload);
}
