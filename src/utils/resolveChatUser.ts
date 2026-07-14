import prisma from "../db/db.config";

export const resolveChatUser = async (id: string) => {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ id: id }, { provider: { id: id } }, { client: { id: id } }],
      role: { not: "superAdmin" }
    },
    select: { id: true },
  });

  return user;
};
