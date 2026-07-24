-- CreateEnum
CREATE TYPE "Cadence" AS ENUM ('DAILY', 'MONTHLY');

-- AlterTable
ALTER TABLE "RunBlock" ADD COLUMN     "cadences" "Cadence"[] DEFAULT ARRAY[]::"Cadence"[];
