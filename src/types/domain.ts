export type EntityId = string;
export type IsoDateString = string;
export type Revision = string;

export type TaskStatus = "todo" | "done";
export type SortDirection = "asc" | "desc";
export type TaskListSortKey = "project" | "subject" | "due" | "priority";

export type Reminder = {
  id: EntityId;
  remind_at: IsoDateString;
};

export type Task = {
  id: EntityId;
  project_id: EntityId;
  title: string;
  description: string | null;
  due_date: IsoDateString | null;
  priority: number | null;
  status: TaskStatus;
  tag_ids: EntityId[];
  reminders: Reminder[];
  created_at: IsoDateString;
  updated_at: IsoDateString;
  completed_at: IsoDateString | null;
};

export type Project = {
  id: EntityId;
  name: string;
  color: string;
  parent_id: EntityId | null;
  system: boolean;
  created_at: IsoDateString;
  updated_at: IsoDateString;
};

export type Tag = {
  id: EntityId;
  name: string;
  created_at: IsoDateString;
  updated_at: IsoDateString;
};

export type ViewDueFilter = "today" | "overdue" | "any" | "none";
export type LegacyViewSortField = "due_date" | "created_at" | "updated_at" | "priority" | "title";

export type ViewFilters = {
  due?: ViewDueFilter;
  project_ids: EntityId[];
  tag_ids: EntityId[];
  include_project_descendants?: boolean;
  query?: string;
};

export type ViewSort = {
  active_key: TaskListSortKey;
  directions: Record<TaskListSortKey, SortDirection>;
};

export type LegacyViewSort = {
  field: LegacyViewSortField;
  direction: SortDirection;
};

export type ViewDisplayOptions = {
  show_completed: boolean;
};

export type View = {
  id: EntityId;
  name: string;
  filters: ViewFilters;
  sort: ViewSort;
  display_options: ViewDisplayOptions;
  created_at: IsoDateString;
  updated_at: IsoDateString;
};
