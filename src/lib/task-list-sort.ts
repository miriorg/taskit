import type { LegacyViewSort, SortDirection, TaskListItemDto, TaskListSortKey, ViewSort } from "@/types";

export const DEFAULT_TASK_LIST_SORT: ViewSort = {
  active_key: "due",
  directions: {
    project: "asc",
    subject: "asc",
    due: "asc",
    priority: "asc",
  },
};

function compareValues(left: string | number, right: string | number): number {
  if (left === right) {
    return 0;
  }

  return left > right ? 1 : -1;
}

function compareNullableString(left: string | null, right: string | null, direction: SortDirection): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  const comparison = compareValues(left, right);
  return direction === "asc" ? comparison : comparison * -1;
}

function compareNullableNumber(left: number | null, right: number | null, direction: SortDirection): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  const comparison = compareValues(left, right);
  return direction === "asc" ? comparison : comparison * -1;
}

function compareStrings(left: string, right: string, direction: SortDirection): number {
  const comparison = left.localeCompare(right, undefined, { sensitivity: "base" });
  return direction === "asc" ? comparison : comparison * -1;
}

function compareByCreatedAt(left: TaskListItemDto, right: TaskListItemDto): number {
  return compareStrings(left.createdAt, right.createdAt, "asc");
}

function compareProject(left: TaskListItemDto, right: TaskListItemDto, direction: SortDirection): number {
  return compareStrings(left.projectPath, right.projectPath, direction);
}

function compareSubject(left: TaskListItemDto, right: TaskListItemDto, direction: SortDirection): number {
  return compareStrings(left.title, right.title, direction);
}

function compareDue(left: TaskListItemDto, right: TaskListItemDto, direction: SortDirection): number {
  return compareNullableString(left.dueDate, right.dueDate, direction);
}

function comparePriority(left: TaskListItemDto, right: TaskListItemDto, direction: SortDirection): number {
  return compareNullableNumber(left.priority, right.priority, direction);
}

function getComparisonChain(activeKey: TaskListSortKey): Array<(left: TaskListItemDto, right: TaskListItemDto, direction: SortDirection) => number> {
  switch (activeKey) {
    case "project":
      return [compareProject, compareSubject, compareDue, comparePriority];
    case "subject":
      return [compareSubject, compareDue, comparePriority, compareProject];
    case "priority":
      return [comparePriority, compareDue, compareSubject, compareProject];
    case "due":
    default:
      return [compareDue, comparePriority, compareSubject, compareProject];
  }
}

export function isTaskListSort(sort: ViewSort | LegacyViewSort): sort is ViewSort {
  return "active_key" in sort && "directions" in sort;
}

export function migrateLegacyViewSort(sort: ViewSort | LegacyViewSort | undefined | null): ViewSort {
  if (!sort) {
    return DEFAULT_TASK_LIST_SORT;
  }

  if (isTaskListSort(sort)) {
    return {
      active_key: sort.active_key,
      directions: {
        ...DEFAULT_TASK_LIST_SORT.directions,
        ...sort.directions,
      },
    };
  }

  const mappedKey: TaskListSortKey = sort.field === "title"
    ? "subject"
    : sort.field === "priority"
      ? "priority"
      : "due";

  return {
    active_key: mappedKey,
    directions: {
      ...DEFAULT_TASK_LIST_SORT.directions,
      [mappedKey]: sort.direction,
    },
  };
}

export function toggleTaskListSort(current: ViewSort, key: TaskListSortKey): ViewSort {
  if (current.active_key === key) {
    return {
      ...current,
      directions: {
        ...current.directions,
        [key]: current.directions[key] === "asc" ? "desc" : "asc",
      },
    };
  }

  return {
    ...current,
    active_key: key,
    directions: {
      ...current.directions,
      [key]: "asc",
    },
  };
}

export function sortTaskListItems(items: TaskListItemDto[], sort: ViewSort): TaskListItemDto[] {
  const normalizedSort = migrateLegacyViewSort(sort);
  const direction = normalizedSort.directions[normalizedSort.active_key];
  const comparisonChain = getComparisonChain(normalizedSort.active_key);

  return [...items].sort((left, right) => {
    for (const compare of comparisonChain) {
      const result = compare(left, right, direction);

      if (result !== 0) {
        return result;
      }
    }

    return compareByCreatedAt(left, right);
  });
}
