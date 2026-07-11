-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('Minor', 'Moderate', 'Major');

-- CreateTable
CREATE TABLE "Drug" (
    "id" SERIAL NOT NULL,
    "rxcui" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "Drug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" SERIAL NOT NULL,
    "drugAName" TEXT NOT NULL,
    "drugBName" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "mechanism" TEXT,
    "description" TEXT,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Drug_name_key" ON "Drug"("name");

-- CreateIndex
CREATE INDEX "Interaction_drugAName_drugBName_idx" ON "Interaction"("drugAName", "drugBName");
