-- AlterTable
ALTER TABLE "Interaction" ADD COLUMN     "rxcuiA" TEXT,
ADD COLUMN     "rxcuiB" TEXT;

-- CreateIndex
CREATE INDEX "Interaction_rxcuiA_rxcuiB_idx" ON "Interaction"("rxcuiA", "rxcuiB");
