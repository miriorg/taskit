import type { Project, Revision, Tag, Task, View } from "./domain";

export type StorageEnvelope<T> = {
  schema_version: number;
  updated_at: string;
  revision?: Revision;
} & T;

export type ProjectMasterFile = StorageEnvelope<{
  projects: Project[];
}>;

export type TagMasterFile = StorageEnvelope<{
  tags: Tag[];
}>;

export type ViewMasterFile = StorageEnvelope<{
  views: View[];
}>;

export type TaskFile = StorageEnvelope<{
  project_id: string;
  tasks: Task[];
}>;

export type FileName =
  | "project.json"
  | "tag.json"
  | "view.json"
  | `task-${string}.json`;
