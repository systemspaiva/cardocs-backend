import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { PushDeliveryResult, PushNotificationPayload, PushNotificationSender } from "../application/pushNotifications.js";

const invalidTokenCodes = new Set([
  "messaging/invalid-argument",
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered"
]);

export class FirebaseCloudMessagingPushSender implements PushNotificationSender {
  async sendToTokens(tokens: string[], payload: PushNotificationPayload): Promise<PushDeliveryResult> {
    const invalidTokens: string[] = [];
    const uniqueTokens = [...new Set(tokens)].filter((token) => token.trim().length > 0);

    for (let index = 0; index < uniqueTokens.length; index += 500) {
      const chunk = uniqueTokens.slice(index, index + 500);
      if (chunk.length === 0) {
        continue;
      }

      const response = await getMessaging().sendEachForMulticast(toMulticastMessage(chunk, payload));
      response.responses.forEach((sendResponse, responseIndex) => {
        if (sendResponse.success) {
          return;
        }
        const code = sendResponse.error?.code;
        if (code && invalidTokenCodes.has(code)) {
          invalidTokens.push(chunk[responseIndex]);
        }
      });
    }

    return { invalidTokens };
  }
}

function toMulticastMessage(tokens: string[], payload: PushNotificationPayload): MulticastMessage {
  return {
    tokens,
    notification: {
      title: payload.title,
      body: payload.body
    },
    data: payload.data,
    apns: {
      headers: {
        "apns-priority": "10"
      },
      payload: {
        aps: {
          sound: "default"
        }
      }
    }
  };
}
