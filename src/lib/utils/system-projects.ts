import type { Project } from "@/types";

export const INBOX_PROJECT_ID = "proj_inbox";
export const DONE_PROJECT_ID = "proj_done";
export const INBOX_PROJECT_NAME = "インボックス";
export const DONE_PROJECT_NAME = "完了";

export const SYSTEM_PROJECT_IDS = [INBOX_PROJECT_ID, DONE_PROJECT_ID] as const;

export function findInboxProjectId(projects: Pick<Project, "id" | "name" | "system">[]): string | null {
  return projects.find((project) => project.system && project.name === INBOX_PROJECT_NAME)?.id ?? null;
}

export function findDoneProjectId(projects: Pick<Project, "id" | "name" | "system">[]): string | null {
  return projects.find((project) => project.system && project.name === DONE_PROJECT_NAME)?.id ?? null;
}
