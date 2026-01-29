export const stripe: any = {
    customers: {
        create: async () => ({ id: "mock_customer_id" }),
    },
    subscriptions: {
        create: async () => ({ id: "mock_subscription_id" }),
    },
};

const apiKey = process.env.STRIPE_SECRET_KEY;

if (!apiKey) {
    console.warn("⚠️ STRIPE_SECRET_KEY is missing from .env. Stripe integration will be mocked.");
} else {
    try {
        const Stripe = require("stripe");
        const stripeInstance = new Stripe(apiKey, {
            apiVersion: "2025-12-15.clover",
        });
        Object.assign(stripe, stripeInstance);
    } catch (err) {
        console.error("❌ Failed to initialize Stripe:", err);
    }
}

export const STRIPE_PRICES = {
    STANDARD: {
        MONTHLY: process.env.STRIPE_PRICE_STANDARD_MONTHLY || "mock_price",
        YEARLY: process.env.STRIPE_PRICE_STANDARD_YEARLY || "mock_price"
    },
    PRO: {
        MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY || "mock_price",
        YEARLY: process.env.STRIPE_PRICE_PRO_YEARLY || "mock_price",
    }
}

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "mock_secret";