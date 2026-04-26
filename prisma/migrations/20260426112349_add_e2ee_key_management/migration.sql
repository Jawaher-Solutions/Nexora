-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preKeysCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "signedPreKeyCreatedAt" TIMESTAMP(3),
ADD COLUMN     "signedPreKeyId" INTEGER,
ADD COLUMN     "signedPreKeyPublic" TEXT,
ADD COLUMN     "signedPreKeySignature" TEXT;

-- CreateTable
CREATE TABLE "PreKey" (
    "id" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreKey_pkey" PRIMARY KEY ("id","userId")
);

-- CreateTable
CREATE TABLE "SignedPreKeyHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyId" INTEGER NOT NULL,
    "publicKey" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SignedPreKeyHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeySession" (
    "id" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "usedPreKeyId" INTEGER,
    "usedSignedPreKeyId" INTEGER,
    "establishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreKey_userId_idx" ON "PreKey"("userId");

-- CreateIndex
CREATE INDEX "SignedPreKeyHistory_userId_idx" ON "SignedPreKeyHistory"("userId");

-- CreateIndex
CREATE INDEX "KeySession_initiatorId_recipientId_idx" ON "KeySession"("initiatorId", "recipientId");

-- AddForeignKey
ALTER TABLE "PreKey" ADD CONSTRAINT "PreKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedPreKeyHistory" ADD CONSTRAINT "SignedPreKeyHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeySession" ADD CONSTRAINT "KeySession_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeySession" ADD CONSTRAINT "KeySession_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
