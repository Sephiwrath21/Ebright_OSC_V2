// Barrel for the Task Manager data layer — pages import everything from
// "@/task-manager/data", mirroring how the old osc-demo pages imported
// everything from "@/osc/flow-client".
export { FlowBridgeError, NoAccountError, SetupPendingError } from "./data/core";
export * from "./data/queries";
export * from "./data/ceo";
export * from "./data/tasks";
export * from "./data/manpower";
export * from "./data/kanban";
