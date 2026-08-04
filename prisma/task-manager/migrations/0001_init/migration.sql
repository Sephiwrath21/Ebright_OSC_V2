-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'HOD', 'MEMBER');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('MANUAL', 'FORM_SUBMIT', 'WORKFLOW_CHAIN');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('CHECKBOX', 'TEXT', 'YES_NO', 'NUMBER', 'DROPDOWN', 'DUE_DATE', 'FILE_UPLOAD', 'APPROVAL', 'SUB_ASSIGNEE_TASK', 'IMAGE_EMBED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BlockStatus" AS ENUM ('PENDING', 'ACTIVE', 'OVERDUE', 'ESCALATED', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ViewType" AS ENUM ('TABLE', 'BOARD', 'CALENDAR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "department" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "ownerId" TEXT NOT NULL,
    "department" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "department" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "edges" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowTrigger" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "type" "TriggerType" NOT NULL,
    "config" JSONB NOT NULL,

    CONSTRAINT "FlowTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assigneeRole" TEXT,
    "fixedAssigneeId" TEXT,
    "dueInHours" INTEGER,
    "reminderInterval" INTEGER NOT NULL DEFAULT 24,
    "strikeLimit" INTEGER NOT NULL DEFAULT 3,
    "escalateToUserId" TEXT,
    "outgoingEdges" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockItem" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "ItemType" NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "BlockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionNode" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "DecisionNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowRun" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "flowVersion" INTEGER NOT NULL,
    "templateSnapshot" JSONB NOT NULL,
    "name" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "triggerType" "TriggerType" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FlowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunBlock" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "status" "BlockStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "strikeCount" INTEGER NOT NULL DEFAULT 0,
    "reminderJobId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RunBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunItem" (
    "id" TEXT NOT NULL,
    "runBlockId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "ItemType" NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "value" JSONB,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,

    CONSTRAINT "RunItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "runBlockId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "runBlockId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowDoc" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "FlowDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "viewType" "ViewType" NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "sortBy" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Flow_workspaceId_idx" ON "Flow"("workspaceId");

-- CreateIndex
CREATE INDEX "FlowTrigger_flowId_idx" ON "FlowTrigger"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "Block_flowId_nodeId_key" ON "Block"("flowId", "nodeId");

-- CreateIndex
CREATE INDEX "BlockItem_blockId_order_idx" ON "BlockItem"("blockId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionNode_flowId_nodeId_key" ON "DecisionNode"("flowId", "nodeId");

-- CreateIndex
CREATE INDEX "FlowRun_flowId_status_idx" ON "FlowRun"("flowId", "status");

-- CreateIndex
CREATE INDEX "FlowRun_status_startedAt_idx" ON "FlowRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "RunBlock_assigneeId_status_idx" ON "RunBlock"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "RunBlock_status_dueAt_idx" ON "RunBlock"("status", "dueAt");

-- CreateIndex
CREATE INDEX "RunBlock_runId_idx" ON "RunBlock"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "RunBlock_runId_nodeId_key" ON "RunBlock"("runId", "nodeId");

-- CreateIndex
CREATE INDEX "RunItem_runBlockId_order_idx" ON "RunItem"("runBlockId", "order");

-- CreateIndex
CREATE INDEX "NotificationLog_runBlockId_idx" ON "NotificationLog"("runBlockId");

-- CreateIndex
CREATE INDEX "AuditLog_runId_createdAt_idx" ON "AuditLog"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_runBlockId_idx" ON "AuditLog"("runBlockId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowDoc_flowId_key" ON "FlowDoc"("flowId");

-- CreateIndex
CREATE INDEX "SavedView_userId_idx" ON "SavedView"("userId");

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowTrigger" ADD CONSTRAINT "FlowTrigger_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockItem" ADD CONSTRAINT "BlockItem_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionNode" ADD CONSTRAINT "DecisionNode_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunBlock" ADD CONSTRAINT "RunBlock_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FlowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunItem" ADD CONSTRAINT "RunItem_runBlockId_fkey" FOREIGN KEY ("runBlockId") REFERENCES "RunBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowDoc" ADD CONSTRAINT "FlowDoc_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

