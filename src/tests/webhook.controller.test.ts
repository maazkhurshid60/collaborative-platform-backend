// ─── Mocks (hoisted before imports by Jest) ──────────────────────────────────

jest.mock('../utils/stripe/stripe', () => ({
  STRIPE_WEBHOOK_SECRET: 'test-webhook-secret',
  stripe: {},
  STRIPE_PRICES: {
    STANDARD: { MONTHLY: 'price_standard_monthly', YEARLY: 'price_standard_yearly' },
  },
}));

jest.mock('../utils/logger', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../socket/socket', () => ({ io: { emit: jest.fn() } }));

jest.mock('../services/SubscriptionService', () => {
  // Define the shared mock fn INSIDE the factory (no hoisting issues)
  const handleWebhook = jest.fn();
  const SubscriptionService = jest.fn(() => ({ handleWebhook }));
  // Expose it as a static property so tests can access it after import
  Object.assign(SubscriptionService, { _handleWebhook: handleWebhook });
  return { SubscriptionService };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { stripeWebhookApi } from '../controller/subscription/webhook.controller';
import { SubscriptionService } from '../services/SubscriptionService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeReq = (overrides: Partial<Request> = {}): Request =>
  ({ headers: {}, body: Buffer.from('{}'), ...overrides } as Request);

const makeRes = (): Response => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

// Access the shared mock fn exposed by the factory
const mockHandleWebhook = (SubscriptionService as any)._handleWebhook as jest.Mock;

beforeEach(() => {
  mockHandleWebhook.mockReset();
});

// ─── stripeWebhookApi ─────────────────────────────────────────────────────────

describe('stripeWebhookApi', () => {
  it('returns 400 with message when stripe-signature header is missing', async () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();

    await stripeWebhookApi(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('No stripe signature found');
    expect(mockHandleWebhook).not.toHaveBeenCalled();
  });

  it('delegates to subscriptionService.handleWebhook with correct args', async () => {
    mockHandleWebhook.mockResolvedValue(undefined);
    const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

    const req = makeReq({
      headers: { 'stripe-signature': 'valid-stripe-sig' },
      body: rawBody,
    });
    const res = makeRes();

    await stripeWebhookApi(req, res);

    expect(mockHandleWebhook).toHaveBeenCalledWith(
      rawBody,
      'valid-stripe-sig',
      'test-webhook-secret'
    );
  });

  it('returns { received: true } on successful webhook handling', async () => {
    mockHandleWebhook.mockResolvedValue(undefined);

    const req = makeReq({
      headers: { 'stripe-signature': 'valid-stripe-sig' },
    });
    const res = makeRes();

    await stripeWebhookApi(req, res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 with error message when handleWebhook throws', async () => {
    mockHandleWebhook.mockRejectedValue(new Error('Invalid webhook signature'));

    const req = makeReq({
      headers: { 'stripe-signature': 'tampered-sig' },
    });
    const res = makeRes();

    await stripeWebhookApi(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Webhook Error: Invalid webhook signature');
  });

  it('uses rawBody over req.body when rawBody is present', async () => {
    mockHandleWebhook.mockResolvedValue(undefined);
    const rawBody = Buffer.from('raw-stripe-payload');

    const req = makeReq({
      headers: { 'stripe-signature': 'valid-sig' },
      body: Buffer.from('parsed-body'),
    } as any);
    (req as any).rawBody = rawBody;
    const res = makeRes();

    await stripeWebhookApi(req, res);

    expect(mockHandleWebhook).toHaveBeenCalledWith(rawBody, 'valid-sig', 'test-webhook-secret');
  });
});
