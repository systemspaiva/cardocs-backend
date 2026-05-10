# Notifications Integration

Notification delivery is abstracted by `NotificationProvider`.

## Current Provider

`MockNotificationProvider` logs notification intent without sending push, email, or SMS.

## Supported Events

- Reminder due soon
- Reminder overdue
- Document expiring
- OCR finished
- Share link created
- Data export finished

## Future Providers

Future implementations can include:

- `EmailNotificationProvider`
- `FirebaseCloudMessagingProvider`
- `PushNotificationProvider`

Each provider must keep sensitive data out of logs and respect user consent.
