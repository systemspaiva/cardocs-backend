package com.cardocs.api.integrations.notification;

import com.cardocs.api.common.BadRequestException;
import com.cardocs.api.notifications.NotificationEvent;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "cardocs.providers", name = "notification", havingValue = "firebase")
public class FirebaseCloudMessagingProvider implements NotificationProvider {

    @Override
    public void notify(UUID userId, NotificationEvent event, Map<String, Object> payload) {
        throw new BadRequestException("Firebase Cloud Messaging está preparado como contrato futuro e desativado no MVP");
    }
}
