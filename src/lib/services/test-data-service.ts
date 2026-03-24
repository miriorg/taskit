import { randomUUID } from "node:crypto";

import { ProjectRepository } from "@/lib/repositories/project-repository";
import { TagRepository } from "@/lib/repositories/tag-repository";
import { TaskRepository } from "@/lib/repositories/task-repository";
import { generateTestTasksInputSchema } from "@/lib/validators";
import type { GenerateTestTasksInput, Task } from "@/types";

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

export class TestDataService {
  constructor(
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly tagRepository: TagRepository = new TagRepository(),
    private readonly taskRepository: TaskRepository = new TaskRepository(),
  ) {}

  async generate(input: GenerateTestTasksInput): Promise<{ tasks: Task[]; projectId: string }> {
    const payload = generateTestTasksInputSchema.parse(input);
    const [projectMaster, tagMaster] = await Promise.all([
      this.projectRepository.getMaster(),
      this.tagRepository.getMaster(),
    ]);

    if (!projectMaster) {
      throw new Error("Project master is not initialized");
    }

    if (!projectMaster.projects.some((project) => project.id === payload.project_id)) {
      throw new Error("Project not found");
    }

    const knownTagIds = new Set((tagMaster?.tags ?? []).map((tag) => tag.id));

    if (payload.tag_ids.some((tagId) => !knownTagIds.has(tagId))) {
      throw new Error("Tag not found");
    }

    const taskFile = await this.taskRepository.getByProjectId(payload.project_id);
    const existingTitles = new Set(taskFile.tasks.map((task) => task.title));
    const now = new Date().toISOString();
    const randomTagPool = payload.tag_ids.length > 0 ? payload.tag_ids : (tagMaster?.tags ?? []).map((tag) => tag.id);
    const tasks = Array.from({ length: payload.count }, (_, index) =>
      buildTask(
        payload.project_id,
        buildUniqueTitle(existingTitles, index),
        payload.use_random_tags ? pickTagIds(randomTagPool) : payload.tag_ids,
        now,
      ),
    );

    await this.taskRepository.save(
      {
        ...taskFile,
        updated_at: now,
        tasks: [...taskFile.tasks, ...tasks],
      },
      taskFile.revision,
    );

    return {
      tasks,
      projectId: payload.project_id,
    };
  }
}
