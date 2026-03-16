import { stripe, STRIPE_PRICES } from "../utils/stripe/stripe";
import Stripe from "stripe";

export class StripeService {
    async createCustomer(email: string, name: string, metadata: any) {
        return await stripe.customers.create({
            email,
            name,
            metadata
        });
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

    async retrieveSubscription(subscriptionId: string) {
        return await stripe.subscriptions.retrieve(subscriptionId);
    }

    async retrieveSubscriptionExpanded(subscriptionId: string) {
        return await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['default_payment_method']
        });
    }

    async retrieveInvoice(invoiceId: string) {
        return await stripe.invoices.retrieve(invoiceId, {
            expand: ['confirmation_secret', 'payment_intent']
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
