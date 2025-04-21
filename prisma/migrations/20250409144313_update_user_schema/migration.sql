/*
  Warnings:

  - You are about to drop the column `chatMessageId` on the `GroupChat` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[documentId,clientId]` on the table `DocumentShareWith` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "GroupChat" DROP CONSTRAINT "GroupChat_chatMessageId_fkey";

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "groupId" TEXT,
ALTER COLUMN "mediaUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DocumentShareWith" ALTER COLUMN "eSignature" DROP NOT NULL,
ALTER COLUMN "isAgree" SET DEFAULT false;

-- AlterTable
ALTER TABLE "GroupChat" DROP COLUMN "chatMessageId";

-- CreateTable
CREATE TABLE "GroupReadReceipt" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupReadReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadReceipt" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupReadReceipt_messageId_providerId_key" ON "GroupReadReceipt"("messageId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadReceipt_messageId_providerId_key" ON "ReadReceipt"("messageId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentShareWith_documentId_clientId_key" ON "DocumentShareWith"("documentId", "clientId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GroupChat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupReadReceipt" ADD CONSTRAINT "GroupReadReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadReceipt" ADD CONSTRAINT "ReadReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
