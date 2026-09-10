import prisma from "../db/db.config";
import { ApiError } from "../utils/apiError";
import { StatusCodes } from "http-status-codes";
import { AppointmentService } from "./AppointmentService";

const appointmentService = new AppointmentService();

export class ReviewService {
  async createReview(
    loginUserId: string,
    data: { appointmentId: string; rating: number; comment?: string },
  ) {
    const client = await prisma.client.findUnique({
      where: { userId: loginUserId },
    });
    if (!client) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Client not found");
    }

    if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Rating must be an integer between 1 and 5.");
    }

    const appointment = await prisma.appointment.findFirst({
      where: { id: data.appointmentId, clientId: client.id },
    });
    if (!appointment) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Appointment not found");
    }

    if (!appointmentService.isAppointmentCompleted(appointment)) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "You can only review a session after it's completed.",
      );
    }

    const existingReview = await prisma.review.findUnique({
      where: { appointmentId: data.appointmentId },
    });
    if (existingReview) {
      throw new ApiError(StatusCodes.CONFLICT, "You have already reviewed this session.");
    }

    return prisma.review.create({
      data: {
        appointmentId: appointment.id,
        providerId: appointment.providerId,
        clientId: client.id,
        rating: data.rating,
        comment: data.comment?.trim() || null,
      },
    });
  }

  async getProviderReviews(providerId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [reviews, aggregate] = await Promise.all([
      prisma.review.findMany({
        where: { providerId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.review.aggregate({
        where: { providerId },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    return {
      reviews,
      averageRating: aggregate._avg.rating ?? 0,
      totalReviews: aggregate._count,
      page,
      limit,
    };
  }

  async getMyReviews(loginUserId: string) {
    const provider = await prisma.provider.findUnique({
      where: { userId: loginUserId },
    });
    if (!provider) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
    }

    return prisma.review.findMany({
      where: { providerId: provider.id },
      orderBy: { createdAt: "desc" },
    });
  }
}
