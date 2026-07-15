import { Request, Response } from "express";
import { z } from "zod";
import prisma from "../../db/db.config";
import { asyncHandler } from "../../utils/asyncHandler";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string()
    .min(1, "Phone number is required")
    .regex(/^[0-9\s\+\-\(\)]+$/, "Invalid phone number format"),
  message: z.string().min(10, "Message must be at least 10 characters long"),
});

export const submitContactQuery = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = contactSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: parsed.error.flatten().fieldErrors 
      });
    }

    const { name, email, phone, message } = parsed.data;

    const contactQuery = await prisma.contactQuery.create({
      data: {
        name,
        email,
        phone,
        message,
      },
    });

    return res.status(201).json({
      success: true,
      data: contactQuery,
      message: "Contact query submitted successfully",
    });
  },
);

export const getContactQueries = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = "1", limit = "10", search = "" } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const where = search
      ? {
          email: {
            contains: search as string,
            mode: "insensitive" as const,
          },
        }
      : {};

    const [queries, total] = await Promise.all([
      prisma.contactQuery.findMany({
        where,
        skip,
        take: limitNumber,
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.contactQuery.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      data: queries,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  },
);
