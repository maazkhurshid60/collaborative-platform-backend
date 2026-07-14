-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELED';

-- AlterTable
ALTER TABLE "ChatChannel" ADD COLUMN     "deletedByA" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedByB" BOOLEAN NOT NULL DEFAULT false;
