// ─── Mocks ──────────────────────────────────────────────────────────────────
const mockPrismaProvider = {
  findUnique: jest.fn(),
};

const mockPrismaAppointment = {
  findFirst: jest.fn(),
  update: jest.fn(),
};

jest.mock("../db/db.config", () => ({
  __esModule: true,
  default: {
    provider: mockPrismaProvider,
    appointment: mockPrismaAppointment,
  },
}));

jest.mock("../socket/socket", () => ({
  io: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
}));

// ─── Imports ────────────────────────────────────────────────────────────────
import { StatusCodes } from "http-status-codes";
import { AppointmentService } from "../services/AppointmentService";
import { AppointmentStatus } from "../generated/prisma/enums";

const service = new AppointmentService();

const PROVIDER = { id: "provider-1", userId: "user-1" };

describe("AppointmentService.isAppointmentCompleted", () => {
  it("is true only when CONFIRMED and endTime is in the past", () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);

    expect(
      service.isAppointmentCompleted({ status: AppointmentStatus.CONFIRMED, endTime: past }),
    ).toBe(true);
    expect(
      service.isAppointmentCompleted({ status: AppointmentStatus.CONFIRMED, endTime: future }),
    ).toBe(false);
    expect(
      service.isAppointmentCompleted({ status: AppointmentStatus.PENDING, endTime: past }),
    ).toBe(false);
    expect(
      service.isAppointmentCompleted({ status: AppointmentStatus.CANCELLED, endTime: past }),
    ).toBe(false);
  });
});

describe("AppointmentService.addSessionNotes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaProvider.findUnique.mockResolvedValue(PROVIDER);
  });

  it("throws 404 when the appointment doesn't belong to this provider", async () => {
    mockPrismaAppointment.findFirst.mockResolvedValue(null);

    await expect(
      service.addSessionNotes("user-1", "appt-1", "Went well"),
    ).rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });

  it("throws 400 when the session isn't completed yet", async () => {
    mockPrismaAppointment.findFirst.mockResolvedValue({
      id: "appt-1",
      status: AppointmentStatus.CONFIRMED,
      endTime: new Date(Date.now() + 60_000),
    });

    await expect(
      service.addSessionNotes("user-1", "appt-1", "Went well"),
    ).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
    expect(mockPrismaAppointment.update).not.toHaveBeenCalled();
  });

  it("saves notes once the session is completed", async () => {
    mockPrismaAppointment.findFirst.mockResolvedValue({
      id: "appt-1",
      status: AppointmentStatus.CONFIRMED,
      endTime: new Date(Date.now() - 60_000),
    });
    mockPrismaAppointment.update.mockResolvedValue({
      id: "appt-1",
      sessionNotes: "Went well",
    });

    const result = await service.addSessionNotes("user-1", "appt-1", "Went well");

    expect(mockPrismaAppointment.update).toHaveBeenCalledWith({
      where: { id: "appt-1" },
      data: { sessionNotes: "Went well", notesAddedAt: expect.any(Date) },
    });
    expect(result.sessionNotes).toBe("Went well");
  });
});
