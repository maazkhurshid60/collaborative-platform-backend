/*
  Warnings:

  - You are about to drop the column `cnic` on the `Provider` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Provider_cnic_key";

-- AlterTable
ALTER TABLE "Provider" DROP COLUMN "cnic";
