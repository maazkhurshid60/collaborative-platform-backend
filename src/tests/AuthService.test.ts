// ─── Mocks (hoisted before imports by Jest) ──────────────────────────────────

const mockPrismaUser = {
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};
const mockPrismaClient = { create: jest.fn(), findUnique: jest.fn() };
const mockPrismaProvider = { create: jest.fn(), findUnique: jest.fn() };
const mockPrismaSuperAdmin = { create: jest.fn(), findUnique: jest.fn() };
const mockPrismaInvitation = { findFirst: jest.fn(), update: jest.fn() };
const mockPrismaGroupMembers = { create: jest.fn() };
const mockPrismaGroupChat = { update: jest.fn() };
const mockPrismaChatChannel = { upsert: jest.fn() };
const mockPrismaSubscription = { create: jest.fn() };
const mockPrismaTransaction = jest.fn();

jest.mock('../db/db.config', () => ({
  __esModule: true,
  default: {
    user: mockPrismaUser,
    client: mockPrismaClient,
    provider: mockPrismaProvider,
    superAdmin: mockPrismaSuperAdmin,
    invitation: mockPrismaInvitation,
    groupMembers: mockPrismaGroupMembers,
    groupChat: mockPrismaGroupChat,
    chatChannel: mockPrismaChatChannel,
    subscription: mockPrismaSubscription,
    $transaction: mockPrismaTransaction,
  },
}));

const mockStripeCustomersCreate = jest.fn();
const mockStripeSubscriptionsCreate = jest.fn();
const mockStripeSubscriptionsRetrieve = jest.fn();

jest.mock('../utils/stripe/stripe', () => ({
  stripe: {
    customers: { create: mockStripeCustomersCreate },
    subscriptions: {
      create: mockStripeSubscriptionsCreate,
      retrieve: mockStripeSubscriptionsRetrieve,
    },
  },
  STRIPE_PRICES: {
    STANDARD: {
      MONTHLY: 'price_standard_monthly',
      YEARLY: 'price_standard_yearly',
    },
  },
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import bcrypt from 'bcrypt';
import { AuthService } from '../services/AuthService';
import { ApiError } from '../utils/apiError';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseProviderData = {
  fullName: 'Jane Provider',
  email: 'jane@example.com',
  password: 'SecureP@ss123!',
  role: 'provider',
  state: 'CA',
};

const fakeUser = { id: 'user-1', email: 'jane@example.com', fullName: 'Jane Provider' };
const fakeProvider = { id: 'prov-1', userId: 'user-1', user: fakeUser, clientList: [] };

const mockStripeTrialSub = {
  id: 'sub_trial_123',
  trial_end: Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60,
  current_period_end: Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60,
};

// ─── AuthService.signup ───────────────────────────────────────────────────────

describe('AuthService.signup', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService();

    // Default: no duplicates found
    mockPrismaUser.findFirst.mockResolvedValue(null);

    // Default transaction returns a provider record with userId
    mockPrismaTransaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: { create: jest.fn().mockResolvedValue(fakeUser) },
        provider: { create: jest.fn().mockResolvedValue(fakeProvider) },
        client: { create: jest.fn() },
        superAdmin: { create: jest.fn() },
      };
      return fn(tx);
    });

    // getCompleteUserData resolves with fakeProvider
    mockPrismaProvider.findUnique.mockResolvedValue(fakeProvider);
    mockPrismaInvitation.findFirst.mockResolvedValue(null);
  });

  it('throws ApiError 409 when email is already registered', async () => {
    mockPrismaUser.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(service.signup(baseProviderData)).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(mockPrismaTransaction).not.toHaveBeenCalled();
  });

  it('throws ApiError 409 when licenseNo is already in use', async () => {
    mockPrismaUser.findFirst
      .mockResolvedValueOnce(null)            // email check passes
      .mockResolvedValueOnce({ id: 'other' }); // licenseNo check fails

    await expect(
      service.signup({ ...baseProviderData, licenseNo: 'LIC-001' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('hashes the password before creating the user', async () => {
    await service.signup(baseProviderData);

    expect(bcrypt.hash).toHaveBeenCalledWith(baseProviderData.password, 10);
  });

  it('creates Stripe customer and trial subscription when planType is FREE', async () => {
    mockStripeCustomersCreate.mockResolvedValue({ id: 'cus_123' });
    mockStripeSubscriptionsCreate.mockResolvedValue(mockStripeTrialSub);

    await service.signup({ ...baseProviderData, planType: 'FREE' });

    expect(mockStripeCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jane@example.com', name: 'Jane Provider' })
    );
    expect(mockStripeSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        trial_period_days: 14,
      })
    );
  });

  it('does NOT call Stripe when planType is not FREE', async () => {
    await service.signup(baseProviderData);

    expect(mockStripeCustomersCreate).not.toHaveBeenCalled();
    expect(mockStripeSubscriptionsCreate).not.toHaveBeenCalled();
  });

  it('throws ApiError 500 when Stripe trial creation fails', async () => {
    mockStripeCustomersCreate.mockRejectedValue(new Error('Stripe API unavailable'));

    await expect(
      service.signup({ ...baseProviderData, planType: 'FREE' })
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it('runs user and provider creation inside a transaction', async () => {
    await service.signup(baseProviderData);

    expect(mockPrismaTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns complete provider data after signup', async () => {
    const result = await service.signup(baseProviderData);

    expect(result).toEqual(fakeProvider);
    expect(mockPrismaProvider.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
  });

  it('converts gender string to enum correctly', async () => {
    let capturedTxUserCreate: jest.Mock | null = null;

    mockPrismaTransaction.mockImplementation(async (fn: any) => {
      const txUserCreate = jest.fn().mockResolvedValue(fakeUser);
      capturedTxUserCreate = txUserCreate;
      const tx = {
        user: { create: txUserCreate },
        provider: { create: jest.fn().mockResolvedValue(fakeProvider) },
        client: { create: jest.fn() },
        superAdmin: { create: jest.fn() },
      };
      return fn(tx);
    });

    await service.signup({ ...baseProviderData, gender: 'female' });

    expect(capturedTxUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gender: 'FEMALE' }) })
    );
  });
});

// ─── AuthService.login ────────────────────────────────────────────────────────

describe('AuthService.login', () => {
  let service: AuthService;

  const fakeDbUser = {
    id: 'user-1',
    email: 'jane@example.com',
    password: 'hashed-password',
    role: 'provider',
    provider: { id: 'prov-1' },
    client: null,
    superAdmin: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService();
    mockPrismaProvider.findUnique.mockResolvedValue(fakeProvider);
  });

  it('throws ApiError 400 when email is not found', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);

    await expect(service.login('nobody@example.com', 'pass')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('throws ApiError 400 when user has no password set', async () => {
    mockPrismaUser.findUnique.mockResolvedValue({ ...fakeDbUser, password: null });

    await expect(service.login('jane@example.com', 'pass')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('throws ApiError 401 when password is incorrect', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(fakeDbUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(service.login('jane@example.com', 'wrong-password')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('throws ApiError 404 when role record is missing', async () => {
    mockPrismaUser.findUnique.mockResolvedValue({
      ...fakeDbUser,
      provider: null, // no provider record despite role = 'provider'
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(service.login('jane@example.com', 'Password123!')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('returns complete user data on successful login', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(fakeDbUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.login('jane@example.com', 'Password123!');

    expect(bcrypt.compare).toHaveBeenCalledWith('Password123!', 'hashed-password');
    expect(result).toEqual(fakeProvider);
    expect(mockPrismaProvider.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
  });

  it('looks up client record for a client role user', async () => {
    const fakeClient = { id: 'client-1', userId: 'user-1', user: fakeUser, providerList: [] };
    mockPrismaUser.findUnique.mockResolvedValue({
      ...fakeDbUser,
      role: 'client',
      provider: null,
      client: { id: 'client-1' },
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mockPrismaClient.findUnique.mockResolvedValue(fakeClient);

    const result = await service.login('jane@example.com', 'Password123!');

    expect(mockPrismaClient.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
    expect(result).toEqual(fakeClient);
  });
});
