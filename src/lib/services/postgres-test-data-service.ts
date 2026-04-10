import { randomUUID } from "node:crypto";

import { requireAppUser } from "@/lib/auth/app-user";
import { PostgresProjectRepository } from "@/lib/repositories/postgres-project-repository";
import { PostgresTagRepository } from "@/lib/repositories/postgres-tag-repository";
import { PostgresTaskRepository } from "@/lib/repositories/postgres-task-repository";
import { generateTestTasksInputSchema } from "@/lib/validators";
import type { GenerateTestTasksInput, Task, User } from "@/types";

const TITLE_PREFIXES = [
  "Review",
  "Draft",
  "Prepare",
  "Check",
  "Organize",
  "Update",
  "Refine",
  "Plan",
  "Coordinate",
  "Summarize",
];

const TITLE_SUBJECTS = [
  "weekly roadmap",
  "release checklist",
  "design note",
  "customer follow-up",
  "team sync memo",
  "migration step",
  "QA scenario",
  "support queue",
  "feature brief",
  "meeting outline",
];

const DESCRIPTION_TEMPLATES = [
  "Capture the latest status, note blockers, and leave the next concrete action.",
  "Collect the necessary context first, then update the related materials.",
  "Prepare a short summary with open questions and the expected follow-up.",
  "Review current progress, identify risks, and document the outcome.",
  "整理した内容を残し、次に着手する項目を明確にする。",
  "関係者がすぐ判断できるように、前提と確認事項をまとめる。",
];

type AppUserResolver = typeof requireAppUser;
type PostgresProjectRepositoryLike = Pick<PostgresProjectRepository, "listByOwner">;
type PostgresTagRepositoryLike = Pick<PostgresTagRepository, "listByOwner">;
type PostgresTaskRepositoryLike = Pick<PostgresTaskRepository, "listByProjectIds" | "create">;

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function buildUniqueTitle(existingTitles: Set<string>, sequence: number): string {
  let title = "";
  let attempt = 0;

  while (!title || existingTitles.has(title)) {
    const prefix = randomItem(TITLE_PREFIXES);
    const subject = randomItem(TITLE_SUBJECTS);
    title = `${prefix} ${subject} ${String(sequence + attempt + 1).padStart(2, "0")}`;
    attempt += 1;
  }

  existingTitles.add(title);
  return title;
}

function pickTagIds(tagIds: string[]): string[] {
  if (tagIds.length === 0) {
    return [];
  }

  const shuffled = [...tagIds].sort(() => Math.random() - 0.5);
  const count = Math.max(1, Math.min(shuffled.length, Math.ceil(Math.random() * Math.min(3, shuffled.length))));
  return shuffled.slice(0, count);
}

function buildTask(projectId: string, title: string, tagIds: string[], createdAt: string): Task {
  const dueOffsetDays = Math.floor(Math.random() * 21);
  const dueOffsetHours = Math.floor(Math.random() * 10);
  const dueDate = new Date(Date.now() + ((dueOffsetDays * 24 + dueOffsetHours) * 60 * 60 * 1000));
  const priorityPool = [null, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  return {
    id: randomUUID(),
    project_id: projectId,
    title,
    description: randomItem(DESCRIPTION_TEMPLATES),
    due_date: dueDate.toISOString(),
    priority: randomItem(priorityPool),
    status: "todo",
    tag_ids: tagIds,
    reminders: [],
    created_at: createdAt,
    updated_at: createdAt,
    completed_at: null,
  };
}

async function resolveOwner(appUserResolver: AppUserResolver): Promise<User> {
  return appUserResolver();
}

export class PostgresTestDataService {
  constructor(
    private readonly appUserResolver: AppUserResolver = requireAppUser,
    private readonly projectRepository: PostgresProjectRepositoryLike = new PostgresProjectRepository(),
    private readonly tagRepository: PostgresTagRepositoryLike = new PostgresTagRepository(),
    private readonly taskRepository: PostgresTaskRepositoryLike = new PostgresTaskRepository(),
  ) {}

  async generate(input: GenerateTestTasksInput): Promise<{ tasks: Task[]; projectId: string }> {
    const payload = generateTestTasksInputSchema.parse(input);
    const user = await resolveOwner(this.appUserResolver);
    const [projects, tags, existingTasks] = await Promise.all([
      this.projectRepository.listByOwner(user.id),
      this.tagRepository.listByOwner(user.id),
      this.taskRepository.listByProjectIds(user.id, [payload.project_id]),
    ]);

    if (!projects.some((project) => project.id === payload.project_id)) {
      throw new Error("Project not found");
    }

    const knownTagIds = new Set(tags.map((tag) => tag.id));

    if (payload.tag_ids.some((tagId) => !knownTagIds.has(tagId))) {
      throw new Error("Tag not found");
    }

    const existingTitles = new Set(existingTasks.map((task) => task.title));
    const now = new Date().toISOString();
    const randomTagPool = payload.tag_ids.length > 0 ? payload.tag_ids : tags.map((tag) => tag.id);
    const tasks = Array.from({ length: payload.count }, (_, index) =>
      buildTask(
        payload.project_id,
        buildUniqueTitle(existingTitles, index),
        payload.use_random_tags ? pickTagIds(randomTagPool) : payload.tag_ids,
        now,
      ),
    );

    for (const task of tasks) {
      await this.taskRepository.create({
        id: task.id,
        owner_user_id: user.id,
        project_id: task.project_id,
        title: task.title,
        description: task.description,
        due_date: task.due_date,
        priority: task.priority,
        status: task.status,
        tag_ids: task.tag_ids,
        reminders: task.reminders,
        completed_at: task.completed_at,
        created_at: task.created_at,
        updated_at: task.updated_at,
      });
    }

    return {
      tasks,
      projectId: payload.project_id,
    };
  }
}
