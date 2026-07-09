import dotenv from "dotenv";

dotenv.config();

export const kitConfig = {
  // Kit API v4 keys start with 'kit_'
  // You must generate a new v4 key in your Kit dashboard.
  apiKey: process.env.KIT_V4_API_KEY || "",
  
  // Base URL for the v4 API
  baseUrl: "https://api.kit.com/v4",
};
