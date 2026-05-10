package com.cardocs.api.integrations.notification;

import com.cardocs.api.common.BadRequestException;
import com.cardocs.api.notifications.NotificationEvent;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "cardocs.providers", name = "notification", havingValue = "email")
public class EmailNotificationProvider implements NotificationProvider {

    @Override
    public void notify(UUID userId, NotificationEvent event, Map<String, Object> payload) {
        throw new BadRequestException("Notificação por e-mail está preparada como contrato futuro e desativada no MVP");
    }
}
