import { stripe } from "../utils/stripe/stripe";
import Stripe from "stripe";

// export const stripePayment = (): Promise<Stripe.Response<Stripe.Refund>> => {
//     return stripe.refunds.create({
//         payment_intent: "pi_3T636y2eZvKYlo2C1096868b",
//         amount: 100,
//         reason: "requested_by_customer",
//         metadata: {
//             provider: "Stripe",
//             refundedAt: new Date().toISOString(),
//             refundedBy: "Admin",
//         },
//         currency: "usd",
//         reverse_transfer: true
//     })
// }

export class StripeService {
    async createCustomer(email: string, name: string, metadata: any) {
        return await stripe.customers.create({
            email,
            name,
            metadata
        });
    }


    async listCustomers(params: Stripe.CustomerListParams) {
        return await stripe.customers.list(params);
    }

    async deleteCustomer(customerId: string) {
        return await stripe.customers.del(customerId);
    }

    async createSubscription(params: Stripe.SubscriptionCreateParams) {
        return await stripe.subscriptions.create(params);
    }

    async createCheckoutSession(params: Stripe.Checkout.SessionCreateParams) {
        return await stripe.checkout.sessions.create(params);
    }

    async cancelSubscription(subscriptionId: string) {
        return await stripe.subscriptions.cancel(subscriptionId);
    }

    async retrieveSubscription(subscriptionId: string, expand?: string[]) {
        return await stripe.subscriptions.retrieve(subscriptionId, { expand });
    }

    async retrieveSubscriptionExpanded(subscriptionId: string) {
        return await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['default_payment_method']
        });
    }

    async retrieveInvoice(invoiceId: string) {
        return await stripe.invoices.retrieve(invoiceId, {
            expand: ['confirmation_secret', 'payment_intent'],

        });
    }

    async finalizeInvoice(invoiceId: string) {
        return await stripe.invoices.finalizeInvoice(invoiceId, {
            expand: ['payment_intent']
        });
    }

    async listInvoices(params: Stripe.InvoiceListParams) {
        return await stripe.invoices.list(params);
    }

    async listSubscriptions(params: Stripe.SubscriptionListParams) {
        return await stripe.subscriptions.list(params);
    }

    async retrieveCharge(chargeId: string) {
        return await stripe.charges.retrieve(chargeId);
    }

    async listCharges(params: Stripe.ChargeListParams) {
        return await stripe.charges.list(params);
    }

    async retrievePaymentIntent(paymentIntentId: string, expand?: string[]) {
        return await stripe.paymentIntents.retrieve(paymentIntentId, { expand });
    }

    constructWebhookEvent(payload: string | Buffer, sig: string, secret: string) {
        return stripe.webhooks.constructEvent(payload, sig, secret);
    }

    async listPaymentMethods(customer: string) {
        return await stripe.paymentMethods.list({
            customer,
            type: 'card',
        });
    }

    async updateCustomer(customerId: string, params: Stripe.CustomerUpdateParams) {
        return await stripe.customers.update(customerId, params);
    }

    async detachPaymentMethod(paymentMethodId: string) {
        return await stripe.paymentMethods.detach(paymentMethodId);
    }

    async retrievePaymentMethod(paymentMethodId: string) {
        return await stripe.paymentMethods.retrieve(paymentMethodId);
    }

    async getPaymentMethodDomain(domainId: string) {
        return await stripe.paymentMethodDomains.retrieve(domainId);
    }

    async retrieveSetupIntent(setupIntentId: string) {
        return await stripe.setupIntents.retrieve(setupIntentId);
    }
}
