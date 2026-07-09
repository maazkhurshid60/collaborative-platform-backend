import axios, { AxiosError } from "axios";
import { kitConfig } from "../../config/kit.config";
import logger from "../../utils/logger";

export class KitV4ApiClient {
  /**
   * Directly creates or updates a subscriber using the v4 /subscribers endpoint.
   * This handles Kit's built-in deduplication (upsert by email_address).
   * 
   * @param email The subscriber's email address
   * @param fullName The subscriber's full name
   */
  public async upsertSubscriber(email: string, fullName: string): Promise<void> {
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

      logger.info(`Successfully synced ${email} to Kit via v4 API`);
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
          return;
        }

        // 401/403 means bad API key - critical, unrecoverable until fixed
        if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
          logger.error("Kit API v4 Authentication Failed. Check API Key.", {
            email,
          });
          return;
        }

        // Rate limits (429) or Server Errors (5xx) are recoverable. Throw so BullMQ retries.
        logger.warn(`Kit API v4 Recoverable Error (${axiosError.response?.status}). BullMQ will retry.`, {
          email,
          message: axiosError.message,
        });
        throw error;
      }
      
      // Unknown error
      logger.error("Unknown error in KitV4ApiClient", { error });
      throw error;
    }
  }
}

export const kitApiClient = new KitV4ApiClient();
