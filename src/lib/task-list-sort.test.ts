import { describe, expect, it } from "vitest";

import type { TaskListItemDto } from "@/types";

import { DEFAULT_TASK_LIST_SORT, migrateLegacyViewSort, sortTaskListItems, toggleTaskListSort } from "./task-list-sort";

function createItem(overrides: Partial<TaskListItemDto>): TaskListItemDto {
  return {
    id: overrides.id ?? "task-1",
    title: overrides.title ?? "Task",
    dueDate: overrides.dueDate ?? null,
    priority: overrides.priority ?? null,
    createdAt: overrides.createdAt ?? "2026-03-22T00:00:00.000Z",
    projectPath: overrides.projectPath ?? "Inbox",
    status: overrides.status ?? "todo",
    project: overrides.project ?? {
      id: "project-1",
      name: "Inbox",
      color: "#808080",
    },
    tags: overrides.tags ?? [],
  };
}

describe("migrateLegacyViewSort", () => {
  it("maps legacy priority sort to the new shape", () => {
    expect(migrateLegacyViewSort({ field: "priority", direction: "desc" })).toEqual({
      active_key: "priority",
      directions: {
        project: "asc",
        subject: "asc",
        due: "asc",
        priority: "desc",
      },
    });
  });
});

describe("toggleTaskListSort", () => {
  it("toggles the active sort direction", () => {
    expect(toggleTaskListSort(DEFAULT_TASK_LIST_SORT, "due")).toEqual({
      active_key: "due",
      directions: {
        project: "asc",
        subject: "asc",
        due: "desc",
        priority: "asc",
      },
    });
  });

  it("restores the last direction when activating an inactive key", () => {
    expect(toggleTaskListSort({
      active_key: "due",
      directions: {
        project: "desc",
        subject: "desc",
        due: "desc",
        priority: "desc",
      },
    }, "project")).toEqual({
      active_key: "project",
      directions: {
        project: "desc",
        subject: "desc",
        due: "desc",
        priority: "desc",
      },
    });
  });
});

describe("sortTaskListItems", () => {
  it("keeps tasks without due dates at the end for descending due sort", () => {
    const sorted = sortTaskListItems([
      createItem({ id: "task-null", title: "No due", dueDate: null }),
      createItem({ id: "task-late", title: "Later", dueDate: "2026-03-24T00:00:00.000Z" }),
      createItem({ id: "task-early", title: "Earlier", dueDate: "2026-03-23T00:00:00.000Z" }),
    ], {
      active_key: "due",
      directions: {
        project: "asc",
        subject: "asc",
        due: "desc",
        priority: "asc",
      },
    });

    expect(sorted.map((item) => item.id)).toEqual(["task-late", "task-early", "task-null"]);
  });

  it("sorts by project path and then by subject when project order is active", () => {
    const sorted = sortTaskListItems([
      createItem({ id: "task-b", title: "Bravo", projectPath: "Work/Alpha", project: { id: "p1", name: "Alpha", color: "#111111" } }),
      createItem({ id: "task-a", title: "Alpha", projectPath: "Home", project: { id: "p2", name: "Home", color: "#222222" } }),
      createItem({ id: "task-c", title: "Alpha", projectPath: "Work/Alpha", project: { id: "p1", name: "Alpha", color: "#111111" } }),
    ], {
      active_key: "project",
      directions: {
        project: "asc",
        subject: "asc",
        due: "asc",
        priority: "asc",
      },
    });

    expect(sorted.map((item) => item.id)).toEqual(["task-a", "task-c", "task-b"]);
  });

  it("keeps null priorities at the end for descending priority sort", () => {
    const sorted = sortTaskListItems([
      createItem({ id: "task-null", priority: null }),
      createItem({ id: "task-low", priority: 1 }),
      createItem({ id: "task-high", priority: 8 }),
    ], {
      active_key: "priority",
      directions: {
        project: "asc",
        subject: "asc",
        due: "asc",
        priority: "desc",
      },
    });

    expect(sorted.map((item) => item.id)).toEqual(["task-high", "task-low", "task-null"]);
  });
});
