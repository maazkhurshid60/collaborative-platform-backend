// ─── Mocks ──────────────────────────────────────────────────────────────────
const mockPrismaFormTemplate = {
  create: jest.fn(),
  findUnique: jest.fn(),
};

const mockPrismaFormShare = {
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};

const mockPrismaFormSubmission = {
  create: jest.fn(),
};

const mockPrismaFormAuditTrail = {
  create: jest.fn(),
};

const mockPrismaNotification = {
  create: jest.fn(),
};

const mockPrismaTransaction = jest.fn();

jest.mock("../db/db.config", () => ({
  __esModule: true,
  default: {
    formTemplate: mockPrismaFormTemplate,
    formShare: mockPrismaFormShare,
    formSubmission: mockPrismaFormSubmission,
    formAuditTrail: mockPrismaFormAuditTrail,
    notification: mockPrismaNotification,
    $transaction: mockPrismaTransaction,
  },
}));

jest.mock("../services/AuditLogService", () => ({
  AuditLogService: {
    createLog: jest.fn().mockResolvedValue({ id: "mock-log-id" }),
  },
}));

jest.mock("../socket/socket", () => ({
  io: {
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  },
}));

// ─── Imports ────────────────────────────────────────────────────────────────
import { Request, Response } from "express";
import {
  addFormTemplateApi,
  shareFormApi,
  getFormTemplateByTokenApi,
  submitFormApi,
} from "../controller/form/form.controller";

// ─── Helpers ────────────────────────────────────────────────────────────────
const makeReq = (overrides: Partial<Request> = {}): Request =>
  ({ body: {}, params: {}, headers: {}, query: {}, socket: { remoteAddress: "127.0.0.1" }, ...overrides } as Request);

const makeRes = (): Response => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// ─── Tests ──────────────────────────────────────────────────────────────────
describe("Form Controller Test Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("addFormTemplateApi", () => {
    it("should fail and return 400 if required fields are missing", async () => {
      const req = makeReq({ body: { title: "" } });
      const res = makeRes();

      await addFormTemplateApi(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should succeed and create form template", async () => {
      mockPrismaFormTemplate.create.mockResolvedValue({
        id: "template-1",
        title: "Intake Form",
        schema: { fields: [] },
      });

      const req = makeReq({ body: { title: "Intake Form", schema: { fields: [] } } });
      const res = makeRes();

      await addFormTemplateApi(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockPrismaFormTemplate.create).toHaveBeenCalled();
    });
  });

  describe("shareFormApi", () => {
    it("should fail and return 400 if templateId is missing", async () => {
      const req = makeReq({ body: { providerId: "provider-1" } });
      const res = makeRes();

      await shareFormApi(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should succeed and generate secure token inside transaction", async () => {
      const fakeShare = {
        id: "share-123",
        templateId: "template-1",
        providerId: "provider-1",
        token: "random-secure-token",
        expiresAt: new Date(),
        template: { title: "Client Consent" },
        client: null,
        provider: null,
      };

      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({ formShare: mockPrismaFormShare });
      });
      mockPrismaFormShare.create.mockResolvedValue(fakeShare);

      const req = makeReq({
        body: { templateId: "template-1", providerId: "provider-1" },
      });
      const res = makeRes();

      await shareFormApi(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            secureLink: expect.stringContaining("/public/forms/"),
          }),
        })
      );
    });
  });

  describe("getFormTemplateByTokenApi", () => {
    it("should return 404 if token link is not found", async () => {
      mockPrismaFormShare.findUnique.mockResolvedValue(null);

      const req = makeReq({ params: { token: "bad-token" } });
      const res = makeRes();

      await getFormTemplateByTokenApi(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 410 if form token link is expired", async () => {
      mockPrismaFormShare.findUnique.mockResolvedValue({
        id: "share-1",
        expiresAt: new Date(Date.now() - 10000), // expired in past
        status: "PENDING",
      });

      const req = makeReq({ params: { token: "expired-token" } });
      const res = makeRes();

      await getFormTemplateByTokenApi(req, res);

      expect(res.status).toHaveBeenCalledWith(410);
    });

    it("should return 423 if form has already been submitted and locked", async () => {
      mockPrismaFormShare.findUnique.mockResolvedValue({
        id: "share-1",
        expiresAt: new Date(Date.now() + 100000),
        status: "SUBMITTED",
      });

      const req = makeReq({ params: { token: "submitted-token" } });
      const res = makeRes();

      await getFormTemplateByTokenApi(req, res);

      expect(res.status).toHaveBeenCalledWith(423);
    });
  });

  describe("submitFormApi", () => {
    it("should deny access (403) if designated client recipient does not match submitting client", async () => {
      const fakeShare = {
        id: "share-1",
        clientId: "client-target-1",
        expiresAt: new Date(Date.now() + 100000),
        status: "PENDING",
        submission: null,
      };

      const mockTx = {
        formShare: {
          findUnique: jest.fn().mockResolvedValue(fakeShare),
          update: jest.fn().mockResolvedValue({}),
        },
        formSubmission: {
          create: jest.fn().mockResolvedValue({}),
        },
        formAuditTrail: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const req = makeReq({
        params: { token: "token-123" },
        body: {
          submittedBy: "client-attacker-2", // Does not match designated recipient
          data: { agree: true },
          signature: "signature-base64",
        },
      });
      const res = makeRes();

      await submitFormApi(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should lock instantly and prevent modification if form is already submitted", async () => {
      const fakeShare = {
        id: "share-1",
        clientId: "client-1",
        expiresAt: new Date(Date.now() + 100000),
        status: "SUBMITTED", // Already locked!
        submission: { id: "sub-1" },
      };

      const mockTx = {
        formShare: {
          findUnique: jest.fn().mockResolvedValue(fakeShare),
          update: jest.fn().mockResolvedValue({}),
        },
        formSubmission: {
          create: jest.fn().mockResolvedValue({}),
        },
        formAuditTrail: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const req = makeReq({
        params: { token: "token-123" },
        body: {
          submittedBy: "client-1",
          data: { agree: true },
          signature: "signature-base64",
        },
      });
      const res = makeRes();

      await submitFormApi(req, res);

      expect(res.status).toHaveBeenCalledWith(423);
    });

    it("should complete atomic submission and write to AuditTrail and lock successfully", async () => {
      const fakeShare = {
        id: "share-1",
        templateId: "template-1",
        clientId: "client-1",
        expiresAt: new Date(Date.now() + 100000),
        status: "PENDING",
        submission: null,
        client: null,
        provider: null,
        template: { title: "Consent Form" },
      };

      const fakeSubmission = {
        id: "sub-999",
        shareId: "share-1",
        isLocked: true,
      };

      const mockTx = {
        formShare: {
          findUnique: jest.fn().mockResolvedValue(fakeShare),
          update: jest.fn().mockResolvedValue({}),
        },
        formSubmission: {
          create: jest.fn().mockResolvedValue(fakeSubmission),
        },
        formAuditTrail: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const req = makeReq({
        params: { token: "token-123" },
        body: {
          submittedBy: "client-1",
          data: { agree: true },
          signature: "signature-base64",
        },
      });
      const res = makeRes();

      await submitFormApi(req, res);

      expect(mockTx.formSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isLocked: true,
            submittedBy: "client-1",
          }),
        })
      );
      expect(mockTx.formShare.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "share-1" },
          data: { status: "SUBMITTED" },
        })
      );
      expect(mockTx.formAuditTrail.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "SUBMITTED_AND_LOCKED",
          }),
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
