import { Expo, ExpoPushMessage } from "expo-server-sdk";
import logger from "../utils/logger";

const expo = new Expo();

export interface PushNotificationPayload {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: "default" | null;
  badge?: number;
}

/**
 * Send Push Notifications using Expo Push API (works for both iOS and Android)
 */
export async function sendPushNotification(payload: PushNotificationPayload) {
  try {
    const tokens = Array.isArray(payload.to) ? payload.to : [payload.to];
    const validTokens = tokens.filter((token) => Expo.isExpoPushToken(token));

    if (validTokens.length === 0) {
      logger.warn("No valid Expo Push Tokens provided for push notification.");
      return;
    }

    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      sound: payload.sound || "default",
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      badge: payload.badge,
    }));

    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        logger.info("Push notification tickets received:", ticketChunk);
      } catch (error) {
        logger.error("Error dispatching push notification chunk:", error);
      }
    }
  } catch (error) {
    logger.error("Failed to send Expo Push Notification:", error);
  }
}
