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
            apiVersion: "2024-06-20",
        });
        Object.assign(stripe, stripeInstance);
    } catch (err) {
        console.error("❌ Failed to initialize Stripe:", err);
    }
}

export const STRIPE_PRICES = {
    STANDARD: {
        MONTHLY: process.env.STRIPE_PRICE_STANDARD_MONTHLY,
        YEARLY: process.env.STRIPE_PRICE_STANDARD_YEARLY
    },

    // PRO: {
    //     MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
    // }
}


export const STRIPE_PLANS_IDS = {
    STANDARD: {
        MONTHLY: process.env.STRIPE_PLAN_ID_STANDARD_MONTHLY,
    },
    // PRO: {
    //     MONTHLY: process.env.STRIPE_PLAN_ID_PRO_MONTHLY,
    // }
}

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "mock_secret";
export const STRIPE_DOMAIN_ID = process.env.STRIPE_DOMAIN_ID;