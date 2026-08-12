import { describe, expect, it } from "vitest";
import { groupTasksByPerson, groupTasksByCategory } from "./entity-card-grouping";
import type { FlowDrillTask, FlowMemberRollup } from "./types";

function task(overrides: Partial<FlowDrillTask> = {}): FlowDrillTask {
  return {
    runBlockId: "rb1",
    runId: "r1",
    blockTitle: "Task",
    runName: "Task",
    flowName: "Flow",
    assigneeId: "u1",
    assigneeName: "User One",
    dueAt: null,
    status: "PENDING",
    cadence: "DAILY",
    fromSchedule: false,
    guideline: null,
    proofIds: [],
    parentId: null,
    subtaskOrder: null,
    quickCompletable: false,
    categoryId: null,
    categoryName: null,
    ...overrides,
  };
}

function member(overrides: Partial<FlowMemberRollup> = {}): FlowMemberRollup {
  return {
    userId: "u1",
    name: "User One",
    employmentType: null,
    department: null,
    branch: null,
    done: 0,
    notDone: 0,
    ...overrides,
  };
}

describe("groupTasksByPerson", () => {
  it("gives every roster member a card, even with zero tasks", () => {
    const members = [member({ userId: "u1" }), member({ userId: "u2", name: "User Two" })];
    const tasks = [task({ assigneeId: "u1" })];
    const result = groupTasksByPerson(members, tasks);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.userId === "u1")?.tasks).toHaveLength(1);
    expect(result.find((r) => r.userId === "u2")?.tasks).toHaveLength(0);
  });

  it("scopes to one person when onlyMe is given", () => {
    const members = [member({ userId: "u1" }), member({ userId: "u2", name: "User Two" })];
    const tasks = [task({ assigneeId: "u1" }), task({ assigneeId: "u2" })];
    const result = groupTasksByPerson(members, tasks, "u1");
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("u1");
  });
});

describe("groupTasksByCategory", () => {
  it("gives every active category a card, even with zero tasks, plus an Uncategorized catch-all", () => {
    const categories = [{ id: "c1", name: "Flowghan" }, { id: "c2", name: "CNS" }];
    const tasks = [task({ categoryId: "c1", categoryName: "Flowghan" }), task({ categoryId: null })];
    const result = groupTasksByCategory(categories, tasks);
    expect(result).toHaveLength(3);
    expect(result.find((r) => r.id === "c1")?.tasks).toHaveLength(1);
    expect(result.find((r) => r.id === "c2")?.tasks).toHaveLength(0);
    expect(result.find((r) => r.id === "uncategorized")?.tasks).toHaveLength(1);
  });

  it("always includes the Uncategorized card last, even with nothing uncategorized", () => {
    const categories = [{ id: "c1", name: "Flowghan" }];
    const tasks = [task({ categoryId: "c1", categoryName: "Flowghan" })];
    const result = groupTasksByCategory(categories, tasks);
    expect(result.at(-1)?.id).toBe("uncategorized");
    expect(result.at(-1)?.tasks).toHaveLength(0);
  });

  it("scopes to one person's tasks within each category card when onlyMe is given", () => {
    const categories = [{ id: "c1", name: "Flowghan" }];
    const tasks = [
      task({ categoryId: "c1", categoryName: "Flowghan", assigneeId: "u1" }),
      task({ categoryId: "c1", categoryName: "Flowghan", assigneeId: "u2" }),
    ];
    const result = groupTasksByCategory(categories, tasks, "u1");
    expect(result.find((r) => r.id === "c1")?.tasks).toHaveLength(1);
  });

  it("routes a task with an unknown/archived categoryId into Uncategorized instead of dropping it", () => {
    const categories = [{ id: "c1", name: "Flowghan" }];
    const tasks = [
      task({ categoryId: "c1", categoryName: "Flowghan" }),
      task({ categoryId: "archived-c2", categoryName: "CNS" }),
    ];
    const result = groupTasksByCategory(categories, tasks);
    expect(result.find((r) => r.id === "c1")?.tasks).toHaveLength(1);
    expect(result.find((r) => r.id === "uncategorized")?.tasks).toHaveLength(1);
    expect(result.find((r) => r.id === "uncategorized")?.tasks[0].categoryId).toBe("archived-c2");
  });
});
