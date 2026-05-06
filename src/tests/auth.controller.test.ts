// ─── Mocks (hoisted before imports by Jest) ──────────────────────────────────

const mockPrismaUser = {
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};

jest.mock('../db/db.config', () => ({
  __esModule: true,
  default: { user: mockPrismaUser },
}));

const mockAuthServiceInstance = {
  signup: jest.fn(),
  login: jest.fn(),
};
jest.mock('../services/AuthService', () => ({
  AuthService: jest.fn(() => mockAuthServiceInstance),
}));

jest.mock('../services/UserService', () => ({
  UserService: jest.fn(() => ({
    updateMe: jest.fn(),
    deleteMe: jest.fn(),
    getMe: jest.fn(),
    deleteUser: jest.fn(),
  })),
}));

jest.mock('../services/SubscriptionService', () => ({
  SubscriptionService: jest.fn(() => ({ startTrial: jest.fn() })),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
}));

jest.mock('../utils/nodeMailer/VerifyEmailLink', () => ({
  sendVerifyEmailLink: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/nodeMailer/ResetPassword', () => ({
  sendResetPasswordEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/generateResetPasswordToken', () => ({
  generateResetToken: jest.fn().mockReturnValue({
    token: 'plain-reset-token',
    hashedToken: 'hashed-reset-token',
  }),
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-new-password'),
  compare: jest.fn(),
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({ toString: () => 'mock-verify-token' }),
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('hashed-reset-token'),
  }),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import {
  signupApi,
  logInApi,
  forgotPasswordApi,
  resetPasswordApi,
} from '../controller/auth/auth.controller';
import { sendResetPasswordEmail } from '../utils/nodeMailer/ResetPassword';
import { sendVerifyEmailLink } from '../utils/nodeMailer/VerifyEmailLink';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeReq = (overrides: Partial<Request> = {}): Request =>
  ({ body: {}, params: {}, headers: {}, ...overrides } as Request);

const makeRes = (): Response => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const next: NextFunction = jest.fn();

// asyncHandler returns a sync fn whose body runs as an unawaited Promise.
// setImmediate fires after all microtasks are drained, ensuring the handler
// fully completes (across all its internal awaits) before assertions run.
const flushPromises = (): Promise<void> =>
  new Promise(resolve => setImmediate(resolve));

// ─── signupApi ────────────────────────────────────────────────────────────────

describe('signupApi', () => {
  const validBody = {
    fullName: 'Jane Provider',
    email: 'jane@example.com',
    role: 'provider',
    state: 'CA',
    gender: "male"
  };

  const fakeUser = {
    id: 'user-1',
    email: 'jane@example.com',
    fullName: 'Jane Provider',
    role: 'provider',
    isEmailVerified: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaUser.update.mockResolvedValue({});
  });

  it('returns 400 when required fields are missing', async () => {
    const req = makeReq({ body: { email: 'bad-email' } });
    const res = makeRes();

    signupApi(req, res, next);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, success: false })
    );
    expect(mockAuthServiceInstance.signup).not.toHaveBeenCalled();
  });

  it('returns 400 when email format is invalid', async () => {
    const req = makeReq({ body: { ...validBody, email: 'not-an-email' } });
    const res = makeRes();

    signupApi(req, res, next);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when role is invalid', async () => {
    const req = makeReq({ body: { ...validBody, role: 'hacker' } });
    const res = makeRes();

    signupApi(req, res, next);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 201 with token and user on successful signup', async () => {
    mockAuthServiceInstance.signup.mockResolvedValue({ user: fakeUser });

    const req = makeReq({ body: validBody });
    const res = makeRes();

    signupApi(req, res, next);
    await flushPromises();

    expect(mockAuthServiceInstance.signup).toHaveBeenCalledWith(validBody);
    expect(mockPrismaUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ verifyEmailToken: 'mock-verify-token' }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 201,
        data: expect.objectContaining({ token: 'mock-jwt-token' }),
      })
    );
  });

  it('returns 201 even when verification email fails to send', async () => {
    mockAuthServiceInstance.signup.mockResolvedValue({ user: fakeUser });
    (sendVerifyEmailLink as jest.Mock).mockRejectedValue(new Error('SMTP error'));

    const req = makeReq({ body: validBody });
    const res = makeRes();

    signupApi(req, res, next);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('marks user as isEmailVerified: false in response', async () => {
    mockAuthServiceInstance.signup.mockResolvedValue({
      user: { ...fakeUser, isEmailVerified: true },
    });

    const req = makeReq({ body: validBody });
    const res = makeRes();

    signupApi(req, res, next);
    await flushPromises();

    const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonCall.data.user.user.isEmailVerified).toBe(false);
  });

  it('forwards errors to next when authService.signup throws', async () => {
    mockAuthServiceInstance.signup.mockRejectedValue(new Error('DB failure'));

    const req = makeReq({ body: validBody });
    const res = makeRes();

    signupApi(req, res, next);
    await flushPromises();

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─── logInApi ─────────────────────────────────────────────────────────────────

describe('logInApi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when email is missing', async () => {
    const req = makeReq({ body: { password: 'somepassword' } });
    const res = makeRes();

    logInApi(req, res, next);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockAuthServiceInstance.login).not.toHaveBeenCalled();
  });

  it('returns 400 when email format is invalid', async () => {
    const req = makeReq({ body: { email: 'not-an-email', password: 'somepassword' } });
    const res = makeRes();

    logInApi(req, res, next);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when password is missing', async () => {
    const req = makeReq({ body: { email: 'jane@example.com' } });
    const res = makeRes();

    logInApi(req, res, next);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with token on successful login', async () => {
    const fakeLoginResult = {
      user: { id: 'user-1', email: 'jane@example.com', role: 'provider' },
    };
    mockAuthServiceInstance.login.mockResolvedValue(fakeLoginResult);

    const req = makeReq({ body: { email: 'jane@example.com', password: 'Password123!' } });
    const res = makeRes();

    logInApi(req, res, next);
    await flushPromises();

    expect(mockAuthServiceInstance.login).toHaveBeenCalledWith('jane@example.com', 'Password123!');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 200,
        data: expect.objectContaining({ token: 'mock-jwt-token' }),
      })
    );
  });

  it('forwards errors to next when authService.login throws', async () => {
    mockAuthServiceInstance.login.mockRejectedValue(new Error('Invalid credentials'));

    const req = makeReq({ body: { email: 'jane@example.com', password: 'wrongpass' } });
    const res = makeRes();

    logInApi(req, res, next);
    await flushPromises();

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ─── forgotPasswordApi ────────────────────────────────────────────────────────

describe('forgotPasswordApi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 409 when email is not registered', async () => {
    mockPrismaUser.findFirst.mockResolvedValue(null);

    const req = makeReq({ body: { email: 'unknown@example.com' } });
    const res = makeRes();

    forgotPasswordApi(req, res, next);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, success: false })
    );
    expect(sendResetPasswordEmail).not.toHaveBeenCalled();
  });

  it('stores hashed token and expiry in DB when user exists', async () => {
    mockPrismaUser.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      fullName: 'Jane',
    });
    mockPrismaUser.update.mockResolvedValue({});

    const req = makeReq({ body: { email: 'jane@example.com' } });
    const res = makeRes();

    forgotPasswordApi(req, res, next);
    await flushPromises();

    expect(mockPrismaUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          resetPasswordToken: 'hashed-reset-token',
          resetPasswordExpires: expect.any(Date),
        }),
      })
    );
  });

  it('sends reset email with plain token', async () => {
    mockPrismaUser.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      fullName: 'Jane',
    });
    mockPrismaUser.update.mockResolvedValue({});

    const req = makeReq({ body: { email: 'jane@example.com' } });
    const res = makeRes();

    forgotPasswordApi(req, res, next);
    await flushPromises();

    expect(sendResetPasswordEmail).toHaveBeenCalledWith(
      'jane@example.com',
      'Jane',
      'plain-reset-token'
    );
  });

  it('returns 200 when reset link is sent successfully', async () => {
    mockPrismaUser.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      fullName: 'Jane',
    });
    mockPrismaUser.update.mockResolvedValue({});

    const req = makeReq({ body: { email: 'jane@example.com' } });
    const res = makeRes();

    forgotPasswordApi(req, res, next);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: true }) })
    );
  });

  it('still returns 200 when email delivery fails', async () => {
    mockPrismaUser.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      fullName: 'Jane',
    });
    mockPrismaUser.update.mockResolvedValue({});
    (sendResetPasswordEmail as jest.Mock).mockRejectedValue(new Error('SMTP down'));

    const req = makeReq({ body: { email: 'jane@example.com' } });
    const res = makeRes();

    forgotPasswordApi(req, res, next);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─── resetPasswordApi ─────────────────────────────────────────────────────────

describe('resetPasswordApi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when token does not match any user', async () => {
    mockPrismaUser.findFirst.mockResolvedValue(null);

    const req = makeReq({ params: { token: 'bad-token' }, body: { newPassword: 'NewPass123!' } });
    const res = makeRes();

    resetPasswordApi(req, res, next);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, success: false })
    );
  });

  it('queries DB with sha256 hash of the token', async () => {
    mockPrismaUser.findFirst.mockResolvedValue({ id: 'user-1' });
    mockPrismaUser.update.mockResolvedValue({});

    const req = makeReq({ params: { token: 'valid-token' }, body: { newPassword: 'NewPass123!' } });
    const res = makeRes();

    resetPasswordApi(req, res, next);
    await flushPromises();

    expect(mockPrismaUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          resetPasswordToken: 'hashed-reset-token',
          resetPasswordExpires: expect.objectContaining({ gt: expect.any(Date) }),
        }),
      })
    );
  });

  it('updates password and clears token on valid reset', async () => {
    mockPrismaUser.findFirst.mockResolvedValue({ id: 'user-1' });
    mockPrismaUser.update.mockResolvedValue({});

    const req = makeReq({ params: { token: 'valid-token' }, body: { newPassword: 'NewPass123!' } });
    const res = makeRes();

    resetPasswordApi(req, res, next);
    await flushPromises();

    expect(mockPrismaUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        password: 'hashed-new-password',
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });
  });

  it('returns 200 on successful password reset', async () => {
    mockPrismaUser.findFirst.mockResolvedValue({ id: 'user-1' });
    mockPrismaUser.update.mockResolvedValue({});

    const req = makeReq({ params: { token: 'valid-token' }, body: { newPassword: 'NewPass123!' } });
    const res = makeRes();

    resetPasswordApi(req, res, next);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 200, success: true })
    );
  });
});
