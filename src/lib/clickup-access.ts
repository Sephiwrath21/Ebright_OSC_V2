import { HOD_POSITION } from "@/app/attendance/leave/approval-logic";

export type TaskScope = { kind: "own" } | { kind: "department"; departmentId: number };

export function resolveTaskScope(input: {
  role: string | null | undefined;
  position: string | null | undefined;
  departmentId: number | null;
}): TaskScope {
  const isDepartmentViewer = input.position === HOD_POSITION || input.role === "department";
  if (isDepartmentViewer && input.departmentId != null) {
    return { kind: "department", departmentId: input.departmentId };
  }
  return { kind: "own" };
}
