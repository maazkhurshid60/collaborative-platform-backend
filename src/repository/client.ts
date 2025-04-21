
import prisma from "../db/db.config.js";


class OiBusinessCategories {
    async create(data: any) {
        return prisma.client.create({ data })
    }

    async delete(id: string) {
        return prisma.client.delete({ where: { id } })
    }

    async update(id: string, data: any) {
        return prisma.client.update({ where: { id }, data });
    }
    async findAll(skip = 0, take = 10) {
        return prisma.client.findMany({ skip, take })
    }
    async findAllWithoutPagination() {
        return prisma.client.findMany()
    }

    async count() {
        return prisma.client.count()
    }

    async findById(id: string) {
        return prisma.client.findFirst({ where: { id } })
    }

    async findByName(userId: string) {
        return prisma.client.findFirst({ where: { userId } })
    }


}

export const oiBusinessCategories = new OiBusinessCategories()
