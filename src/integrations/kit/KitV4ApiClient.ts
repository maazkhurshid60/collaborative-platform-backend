import axios, { AxiosError } from "axios";
import { kitConfig } from "../../config/kit.config";
import logger from "../../utils/logger";

export class KitV4ApiClient {
  public async upsertSubscriber(
    email: string,
    fullName: string,
  ): Promise<number | null> {
    if (!kitConfig.apiKey) {
      throw new Error("Kit V4 API Key is missing. Cannot sync subscriber.");
    }

    try {
      const url = `${kitConfig.baseUrl}/subscribers`;

      const payload = {
        email_address: email,
        first_name: fullName,
      };

      const response = await axios.post(url, payload, {
        headers: {
          "X-Kit-Api-Key": kitConfig.apiKey,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      });

      const subscriberId = response.data?.subscriber?.id || null;
      logger.info(
        `Successfully synced ${email} to Kit via v4 API (ID: ${subscriberId})`,
      );
      return subscriberId;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        // 400 errors usually mean invalid email format - unrecoverable
        if (axiosError.response?.status === 400) {
          logger.error("Kit API v4 Bad Request: Invalid payload", {
            email,
            data: axiosError.response.data,
          });
          // We don't throw the error so BullMQ doesn't retry a permanently invalid request
          return null;
        }

        // 401/403 means bad API key - critical, unrecoverable until fixed
        if (
          axiosError.response?.status === 401 ||
          axiosError.response?.status === 403
        ) {
          logger.error("Kit API v4 Authentication Failed. Check API Key.", {
            email,
          });
          return null;
        }

        // Rate limits (429) or Server Errors (5xx) are recoverable. Throw so BullMQ retries.
        logger.warn(
          `Kit API v4 Recoverable Error (${axiosError.response?.status}). BullMQ will retry.`,
          {
            email,
            message: axiosError.message,
          },
        );
        throw error;
      }

      // Unknown error
      logger.error("Unknown error in KitV4ApiClient.upsertSubscriber", {
        error,
      });
      throw error;
    }
  }

  /**
   * Assigns a tag to a subscriber by their email address.
   */
  public async assignTagByEmail(email: string, tagId: string): Promise<void> {
    if (!kitConfig.apiKey) {
      throw new Error("Kit V4 API Key is missing. Cannot assign tag.");
    }

    try {
      const url = `${kitConfig.baseUrl}/tags/${tagId}/subscribers`;
      const payload = {
        email_address: email,
      };

      await axios.post(url, payload, {
        headers: {
          "X-Kit-Api-Key": kitConfig.apiKey,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      logger.info(`Successfully assigned tag ${tagId} to email ${email}`);
    } catch (error: any) {
      const errResponse = error.response?.data;
      logger.error(
        `Failed to assign tag ${tagId} to email ${email}:`,
        errResponse || error.message,
      );
      throw error;
    }
  }

  /**
   * Removes a tag from a subscriber by their internal subscriber ID.
   */
  public async removeTag(subscriberId: number, tagId: string): Promise<void> {
    if (!kitConfig.apiKey) {
      throw new Error("Kit V4 API Key is missing. Cannot remove tag.");
    }

    try {
      const url = `${kitConfig.baseUrl}/tags/${tagId}/subscribers/${subscriberId}`;

      await axios.delete(url, {
        headers: {
          "X-Kit-Api-Key": kitConfig.apiKey,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      logger.info(
        `Successfully removed tag ${tagId} from subscriber ${subscriberId}`,
      );
    } catch (error: any) {
      const errResponse = error.response?.data;
      logger.error(
        `Failed to remove tag ${tagId} from subscriber ${subscriberId}:`,
        errResponse || error.message,
      );
      throw error;
    }
  }
}

export const kitApiClient = new KitV4ApiClient();
