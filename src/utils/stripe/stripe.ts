import Stripe from "stripe"
const apiKey = process.env.STRIPE_SECRET_KEY;
export const stripe: any =
{
    customers: {
        create: async () => ({ id: "mock_customer_id" }),
    }, subscriptions: {
        create: async () => ({ id: "mock_subscription_id" }),
    },
};



if (!apiKey) {
    console.warn("⚠️ STRIPE_SECRET_KEY is missing from .env. Stripe integration will be mocked.");
} else {
    try {

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

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
export const STRIPE_DOMAIN_ID = process.env.STRIPE_DOMAIN_ID;


// import Stripe from "stripe";

// // ─────────────────────────────────────────────
// // 1. ENV VALIDATION — Fail hard on startup
// //    Never let the app run without these keys
// // ─────────────────────────────────────────────
// const requiredEnvVars = [
//     "STRIPE_SECRET_KEY",
//     "STRIPE_WEBHOOK_SECRET",
//     "STRIPE_PRICE_STANDARD_MONTHLY",
//     "STRIPE_PRICE_STANDARD_YEARLY",
// ] as const;

// for (const key of requiredEnvVars) {
//     if (!process.env[key]) {
//         throw new Error(
//             `❌ Missing required environment variable: ${key}. App cannot start.`
//         );
//     }
// }

// // ─────────────────────────────────────────────
// // 2. STRIPE INSTANCE
// //    - typescript: true  → proper type inference
// //    - maxNetworkRetries → auto retry on network blips
// //    - telemetry: false  → don't send usage data to Stripe
// // ─────────────────────────────────────────────
// export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
//     apiVersion: "2025-12-15.clover",
//     typescript: true,
//     maxNetworkRetries: 2,
//     telemetry: false,
// });

// // ─────────────────────────────────────────────
// // 3. PRICE IDs
// //    - "as const" gives you literal types instead of string
// //    - Non-null assertion (!) is safe here because we validated above
// // ─────────────────────────────────────────────
// export const STRIPE_PRICES = {
//     STANDARD: {
//         MONTHLY: process.env.STRIPE_PRICE_STANDARD_MONTHLY!,
//         YEARLY: process.env.STRIPE_PRICE_STANDARD_YEARLY!,
//     },
//     // PRO: {
//     //     MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY!,
//     //     YEARLY: process.env.STRIPE_PRICE_PRO_YEARLY!,
//     // },
// } as const;

// // ─────────────────────────────────────────────
// // 4. TYPE HELPERS
// //    Derive valid plan/period types directly
// //    from STRIPE_PRICES so they never go out of sync
// // ─────────────────────────────────────────────
// export type PlanType = keyof typeof STRIPE_PRICES;
// export type BillingPeriod = keyof (typeof STRIPE_PRICES)[PlanType];

// // Helper to safely look up a price ID
// // Returns undefined if plan/period combo doesn't exist
// export const getPriceId = (
//     planType: string,
//     period: string
// ): string | undefined => {
//     const normalizedPlan = planType.toUpperCase() as PlanType;
//     const normalizedPeriod = period.toUpperCase() as BillingPeriod;
//     return (STRIPE_PRICES as any)[normalizedPlan]?.[normalizedPeriod];
// };

// // ─────────────────────────────────────────────
// // 5. WEBHOOK SECRET
// //    No fallback — if it's missing the app already
// //    threw above. This is just a clean export.
// // ─────────────────────────────────────────────
// export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

// // ─────────────────────────────────────────────
// // 6. OPTIONAL CONFIG
// // ─────────────────────────────────────────────
// export const STRIPE_DOMAIN_ID = process.env.STRIPE_DOMAIN_ID;

// // ─────────────────────────────────────────────
// // 7. PLAN METADATA
// //    Central place to define plan limits/features
// //    Useful for feature gating across your app
// // ─────────────────────────────────────────────
// export const PLAN_CONFIG = {
//     STANDARD: {
//         trialDays: 14,
//         displayName: "Standard Plan",
//     },
//     // PRO: {
//     //     trialDays: 0,
//     //     displayName: "Pro Plan",
//     // },
// } as const;