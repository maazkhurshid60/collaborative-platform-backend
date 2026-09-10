// ─── Mocks ──────────────────────────────────────────────────────────────────
const mockPrismaClient = {
  findUnique: jest.fn(),
};

const mockPrismaProvider = {
  findUnique: jest.fn(),
};

const mockPrismaAppointment = {
  findFirst: jest.fn(),
};

const mockPrismaReview = {
  findUnique: jest.fn(),
  create: jest.fn(),
  findMany: jest.fn(),
  aggregate: jest.fn(),
};

jest.mock("../db/db.config", () => ({
  __esModule: true,
  default: {
    client: mockPrismaClient,
    provider: mockPrismaProvider,
    appointment: mockPrismaAppointment,
    review: mockPrismaReview,
  },
}));

jest.mock("../socket/socket", () => ({
  io: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
}));

// ─── Imports ────────────────────────────────────────────────────────────────
import { StatusCodes } from "http-status-codes";
import { ReviewService } from "../services/ReviewService";
import { AppointmentStatus } from "../generated/prisma/enums";

const service = new ReviewService();

const CLIENT = { id: "client-1", userId: "user-client-1" };
const COMPLETED_APPOINTMENT = {
  id: "appt-1",
  providerId: "provider-1",
  clientId: "client-1",
  status: AppointmentStatus.CONFIRMED,
  endTime: new Date(Date.now() - 60_000),
};

describe("ReviewService.createReview", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaClient.findUnique.mockResolvedValue(CLIENT);
  });

  it("throws 400 for an out-of-range rating", async () => {
    await expect(
      service.createReview("user-client-1", { appointmentId: "appt-1", rating: 6 }),
    ).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it("throws 404 when the appointment doesn't belong to this client", async () => {
    mockPrismaAppointment.findFirst.mockResolvedValue(null);

    await expect(
      service.createReview("user-client-1", { appointmentId: "appt-1", rating: 5 }),
    ).rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });

  it("throws 400 when the session isn't completed yet", async () => {
    mockPrismaAppointment.findFirst.mockResolvedValue({
      ...COMPLETED_APPOINTMENT,
      endTime: new Date(Date.now() + 60_000),
    });

    await expect(
      service.createReview("user-client-1", { appointmentId: "appt-1", rating: 5 }),
    ).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it("throws 409 when the appointment already has a review", async () => {
    mockPrismaAppointment.findFirst.mockResolvedValue(COMPLETED_APPOINTMENT);
    mockPrismaReview.findUnique.mockResolvedValue({ id: "existing-review" });

    await expect(
      service.createReview("user-client-1", { appointmentId: "appt-1", rating: 5 }),
    ).rejects.toMatchObject({ statusCode: StatusCodes.CONFLICT });
    expect(mockPrismaReview.create).not.toHaveBeenCalled();
  });

  it("creates the review once the session is completed and unreviewed", async () => {
    mockPrismaAppointment.findFirst.mockResolvedValue(COMPLETED_APPOINTMENT);
    mockPrismaReview.findUnique.mockResolvedValue(null);
    mockPrismaReview.create.mockResolvedValue({
      id: "review-1",
      appointmentId: "appt-1",
      providerId: "provider-1",
      clientId: "client-1",
      rating: 5,
      comment: "Great session",
    });

    const result = await service.createReview("user-client-1", {
      appointmentId: "appt-1",
      rating: 5,
      comment: "Great session",
    });

    expect(mockPrismaReview.create).toHaveBeenCalledWith({
      data: {
        appointmentId: "appt-1",
        providerId: "provider-1",
        clientId: "client-1",
        rating: 5,
        comment: "Great session",
      },
    });
    expect(result.id).toBe("review-1");
  });
});

describe("ReviewService.getProviderReviews", () => {
  it("returns reviews with the aggregate average rating", async () => {
    mockPrismaReview.findMany.mockResolvedValue([{ id: "review-1", rating: 5 }]);
    mockPrismaReview.aggregate.mockResolvedValue({ _avg: { rating: 4.5 }, _count: 3 });

    const result = await service.getProviderReviews("provider-1", 1, 20);

    expect(result.averageRating).toBe(4.5);
    expect(result.totalReviews).toBe(3);
    expect(result.reviews).toHaveLength(1);
  });
});
