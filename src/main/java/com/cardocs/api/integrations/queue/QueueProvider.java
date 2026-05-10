package com.cardocs.api.integrations.queue;

public interface QueueProvider {
    void send(QueueName queueName, Object payload);
}
