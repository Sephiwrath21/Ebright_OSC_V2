import { describe, it, expect } from "vitest";
import {
  mapTask,
  sortByDueDate,
  extractOwner,
  normalizeName,
  matchOwnerToRoster,
  aggregateByStatus,
  parseBranchSpace,
  scheduleSection,
  sectionSortKey,
  weekdayFromList,
  operationalDay,
  filterToCurrentCycle,
  currentWeekStart,
  type ClickUpTaskView,
  type RosterEntry,
} from "./clickup";

function task(partial: Partial<ClickUpTaskView> & { id: string }): ClickUpTaskView {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    status: partial.status ?? "",
    statusColor: partial.statusColor ?? "",
    dueDate: partial.dueDate ?? null,
    doneDate: partial.doneDate ?? null,
    priority: partial.priority ?? null,
    listName: partial.listName ?? "",
    folderName: partial.folderName ?? "",
    ownerName: partial.ownerName ?? null,
    url: partial.url ?? "",
  };
}

describe("extractOwner", () => {
  it("reads a trailing parenthetical owner", () => {
    expect(extractOwner("Database and HRMS (Rahman)")).toBe("Rahman");
    expect(extractOwner("RM 3 (Manjeet)")).toBe("Manjeet");
    expect(extractOwner("1.1 CEO Office ToDo List (Manjeet)")).toBe("Manjeet");
  });
  it("reads an 'Intern - Name' owner", () => {
    expect(extractOwner("3.6.9 Intern - Yee Qian")).toBe("Yee Qian");
    expect(extractOwner("Intern - Amir")).toBe("Amir");
  });
  it("returns null when no owner pattern is present", () => {
    expect(extractOwner("HR -HOD TO DO LIST")).toBeNull();
    expect(extractOwner("")).toBeNull();
    expect(extractOwner(null)).toBeNull();
  });
});

describe("normalizeName", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeName("  Yee   Qian ")).toBe("yee qian");
    expect(normalizeName(null)).toBe("");
  });
});

describe("matchOwnerToRoster", () => {
  const roster: RosterEntry[] = [
    { userId: 1, fullName: "Izzuddin Bin Nor Rahman", nickName: "Izzuddin", departmentId: 5 },
    { userId: 2, fullName: "Manjeet Kaur A/P Jasbinder Singh", nickName: "Manjeet", departmentId: 5 },
    { userId: 3, fullName: "Didisabarini Binti Mohd", nickName: "Didi", departmentId: 7 },
  ];

  it("matches on exact nick_name", () => {
    expect(matchOwnerToRoster("Manjeet", roster)).toBe(2);
    expect(matchOwnerToRoster("didi", roster)).toBe(3);
  });
  it("matches a whole word inside full_name when no nick matches", () => {
    expect(matchOwnerToRoster("Rahman", roster)).toBe(1);
  });
  it("returns null for unknown or too-short owners", () => {
    expect(matchOwnerToRoster("Amir", roster)).toBeNull();
    expect(matchOwnerToRoster("a", roster)).toBeNull();
    expect(matchOwnerToRoster(null, roster)).toBeNull();
  });
});

describe("mapTask", () => {
  it("maps a raw task and extracts the owner from the folder name", () => {
    expect(
      mapTask({
        id: "t1",
        name: "Do the thing",
        status: { status: "in progress", color: "#abc" },
        due_date: "1700000000000",
        date_done: "1700000500000",
        priority: { priority: "high" },
        list: { name: "Friday" },
        folder: { name: "Database and HRMS (Rahman)" },
        url: "https://app.clickup.com/t/t1",
      }),
    ).toEqual<ClickUpTaskView>({
      id: "t1",
      name: "Do the thing",
      status: "in progress",
      statusColor: "#abc",
      dueDate: 1700000000000,
      doneDate: 1700000500000,
      priority: "high",
      listName: "Friday",
      folderName: "Database and HRMS (Rahman)",
      ownerName: "Rahman",
      url: "https://app.clickup.com/t/t1",
    });
  });

  it("handles null due_date, null priority, missing list/folder", () => {
    const view = mapTask({
      id: "t2",
      name: "No due date",
      status: { status: "to do", color: "#000" },
      due_date: null,
      priority: null,
      list: null,
      folder: null,
      url: "https://app.clickup.com/t/t2",
    });
    expect(view.dueDate).toBeNull();
    expect(view.priority).toBeNull();
    expect(view.listName).toBe("");
    expect(view.folderName).toBe("");
    expect(view.ownerName).toBeNull();
  });
});

describe("aggregateByStatus", () => {
  it("counts tasks per status, keeps the status color, sorts by count desc", () => {
    const result = aggregateByStatus([
      task({ id: "a", status: "in progress", statusColor: "#abc" }),
      task({ id: "b", status: "to do", statusColor: "#000" }),
      task({ id: "c", status: "in progress", statusColor: "#abc" }),
      task({ id: "d", status: "in progress", statusColor: "#abc" }),
    ]);
    expect(result).toEqual([
      { status: "in progress", color: "#abc", count: 3 },
      { status: "to do", color: "#000", count: 1 },
    ]);
  });

  it("falls back to 'no status' and a default color for blank statuses", () => {
    const result = aggregateByStatus([task({ id: "a", status: "", statusColor: "" })]);
    expect(result).toEqual([{ status: "no status", color: "#94a3b8", count: 1 }]);
  });

  it("forces completed statuses to light green, ignoring ClickUp's color", () => {
    const result = aggregateByStatus([
      task({ id: "a", status: "complete", statusColor: "#0b6b2f" }),
      task({ id: "b", status: "Done", statusColor: "#114411" }),
    ]);
    expect(result.every((s) => s.color === "#86efac")).toBe(true);
  });
});

describe("parseBranchSpace", () => {
  it("parses code + name from a branch space, dropping the manager suffix", () => {
    expect(parseBranchSpace("1", "B20 | Kajang TTDI Grove (Huda)")).toEqual({
      id: "1",
      code: "B20",
      name: "Kajang TTDI Grove",
    });
    expect(parseBranchSpace("2", "B02 | Online (Ummu)")).toEqual({ id: "2", code: "B02", name: "Online" });
    expect(parseBranchSpace("3", "B21 | Tropicana Sungai Buloh")).toEqual({
      id: "3",
      code: "B21",
      name: "Tropicana Sungai Buloh",
    });
  });

  it("returns null for non-branch spaces and B00 templates", () => {
    expect(parseBranchSpace("4", "HQ | 3.0 Optimisation (Iqbal)")).toBeNull();
    expect(parseBranchSpace("5", "B00 | Branch Template (2026)")).toBeNull();
    expect(parseBranchSpace("6", "Ebright Carnival 2024 (Athirah)")).toBeNull();
  });
});

describe("scheduleSection", () => {
  it("aggregates day folders into a weekday, regardless of role suffix", () => {
    expect(scheduleSection("Wed | Executive")).toBe("Wednesday");
    expect(scheduleSection("Wed | Manager")).toBe("Wednesday");
    expect(scheduleSection("Thur | Coach")).toBe("Thursday");
    expect(scheduleSection("Sun | Executive")).toBe("Sunday");
  });
  it("turns a numbered period folder into its label and never mistakes Monthly for Monday", () => {
    expect(scheduleSection("01 | Weekly & Daily")).toBe("Weekly & Daily");
    expect(scheduleSection("03 | Monthly")).toBe("Monthly");
    expect(scheduleSection("Monthly")).toBe("Monthly"); // not "Monday"
  });
  it("falls back to the folder name", () => {
    expect(scheduleSection("Ad-hoc")).toBe("Ad-hoc");
  });
});

describe("sectionSortKey", () => {
  it("orders weekdays before periods, in schedule order", () => {
    const labels = ["Monthly", "Sunday", "Wednesday", "Weekly & Daily", "Yearly"];
    const sorted = [...labels].sort((a, b) => {
      const ra = sectionSortKey(a);
      const rb = sectionSortKey(b);
      for (let i = 0; i < 3; i++) {
        if (ra[i] < rb[i]) return -1;
        if (ra[i] > rb[i]) return 1;
      }
      return 0;
    });
    expect(sorted).toEqual(["Wednesday", "Sunday", "Weekly & Daily", "Monthly", "Yearly"]);
  });
});

describe("weekdayFromList", () => {
  it("returns the canonical weekday for a day list, null otherwise", () => {
    expect(weekdayFromList("Thursday")).toBe("Thursday");
    expect(weekdayFromList("  wednesday ")).toBe("Wednesday");
    expect(weekdayFromList("Closing")).toBeNull();
    expect(weekdayFromList("9:15 AM Class")).toBeNull();
    expect(weekdayFromList(null)).toBeNull();
  });
});

describe("operationalDay", () => {
  it("returns the weekday only when the day list is in the Weekly & Daily folder", () => {
    expect(operationalDay("01 | Weekly & Daily", "Thursday")).toBe("Thursday");
    expect(operationalDay("01 | Weekly & Daily", "Wednesday")).toBe("Wednesday");
  });
  it("ignores weekday lists in other folders (e.g. coach folders)", () => {
    expect(operationalDay("[NEW] FT Coach (Wed - Sun) - Lee Ann", "Thursday")).toBeNull();
    expect(operationalDay("Thur | Executive", "Closing")).toBeNull();
    expect(operationalDay("01 | Weekly & Daily", "9:15 AM Class")).toBeNull();
  });
});

describe("filterToCurrentCycle", () => {
  const weekStart = new Date("2026-06-22T00:00:00").getTime(); // Monday
  const thisWeek = new Date("2026-06-24T09:00:00").getTime();
  const lastWeek = new Date("2026-06-19T09:00:00").getTime(); // KD case
  const longAgo = new Date("2026-04-18T09:00:00").getTime(); // Klang case

  it("keeps pending/na, this-week completes, and long-stale completes; drops only last-week completes", () => {
    const out = filterToCurrentCycle(
      [
        task({ id: "p", status: "pending" }),
        task({ id: "n", status: "n/a" }),
        task({ id: "thisWk", status: "complete", doneDate: thisWeek }),
        task({ id: "lastWk", status: "complete", doneDate: lastWeek }),
        task({ id: "april", status: "complete", doneDate: longAgo }),
      ],
      weekStart,
    );
    expect(out.map((t) => t.id)).toEqual(["p", "n", "thisWk", "april"]); // lastWk dropped
  });
});

describe("currentWeekStart", () => {
  it("returns Monday 00:00 of the week containing the date", () => {
    const wed = new Date("2026-06-24T15:30:00");
    const start = new Date(currentWeekStart(wed));
    expect(start.getDay()).toBe(1); // Monday
    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(22);
  });
});

describe("sortByDueDate", () => {
  it("sorts ascending by dueDate, nulls last", () => {
    const sorted = sortByDueDate([
      task({ id: "a", dueDate: null }),
      task({ id: "b", dueDate: 200 }),
      task({ id: "c", dueDate: 100 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["c", "b", "a"]);
  });
});
