import type { Project, Revision, Tag, Task, View } from "./domain";

export type ApiErrorCode =
  | "unauthorized"
  | "validation_error"
  | "not_found"
  | "conflict"
  | "forbidden"
  | "drive_error"
  | "corrupted_data";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type ApiErrorResponse = {
  error: ApiError;
};

export type FileRevisionMap = Partial<Record<"project" | "tag" | "view" | `task:${string}`, Revision>>;

export type TaskListItemDto = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: number | null;
  createdAt: string;
  projectPath: string;
  status: Task["status"];
  project: Pick<Project, "id" | "name" | "color">;
  tags: Array<Pick<Tag, "id" | "name">>;
};

export type TaskListResponse = {
  items: TaskListItemDto[];
  todoItems: TaskListItemDto[];
  completedItems: TaskListItemDto[];
  revisions: FileRevisionMap;
};

export type ProjectListResponse = {
  projects: Project[];
  revisions: FileRevisionMap;
};

export type TagListResponse = {
  tags: Tag[];
  revisions: FileRevisionMap;
};

export type ViewListResponse = {
  views: View[];
  revisions: FileRevisionMap;
};

export type TaskMutationResponse = {
  task: Task;
  revisions: FileRevisionMap;
  previousProjectId?: string;
};

export type TaskDeleteResponse = {
  deletedTaskId: string;
  projectId: string;
  revisions: FileRevisionMap;
};

export type ProjectMutationResponse = {
  project: Project;
  revisions: FileRevisionMap;
};

export type ProjectDeleteResponse = {
  deletedProjectIds: string[];
  revisions: FileRevisionMap;
};

export type TagMutationResponse = {
  tag: Tag;
  revisions: FileRevisionMap;
};

export type TagDeleteResponse = {
  deletedTagId: string;
  revisions: FileRevisionMap;
};

export type ViewMutationResponse = {
  view: View;
  revisions: FileRevisionMap;
};

export type ViewDeleteResponse = {
  deletedViewId: string;
  revisions: FileRevisionMap;
};
