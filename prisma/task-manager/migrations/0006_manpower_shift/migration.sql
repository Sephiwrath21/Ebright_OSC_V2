-- Manpower Schedule prototype: a branch manager's planned time-slotted
-- shift for one coach, linked to the ad hoc FlowRun it creates.
CREATE TABLE "ManpowerShift" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "taskTitle" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManpowerShift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManpowerShift_branch_date_idx" ON "ManpowerShift"("branch", "date");
