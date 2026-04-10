import { randomUUID } from "node:crypto";

import { requireAppUser } from "@/lib/auth/app-user";
import { DEFAULT_TASK_LIST_SORT } from "@/lib/task-list-sort";
import { PostgresProjectRepository } from "@/lib/repositories/postgres-project-repository";
import { PostgresTagRepository } from "@/lib/repositories/postgres-tag-repository";
import { PostgresTaskRepository, type TaskRecord } from "@/lib/repositories/postgres-task-repository";
import { createTaskInputSchema, updateTaskInputSchema } from "@/lib/validators";
import type {
  CreateTaskInput,
  Project,
  Tag,
  Task,
  TaskDeleteResponse,
  TaskListItemDto,
  TaskListResponse,
  TaskMutationResponse,
  UpdateTaskInput,
  User,
  ViewSort,
} from "@/types";

import { collectDescendantProjectIds } from "./project-service";
import { createTaskListResponse, type TaskListOptions, type TaskMutationOptions } from "./task-service";

type AppUserResolver = typeof requireAppUser;
type PostgresProjectRepositoryLike = Pick<PostgresProjectRepository, "listByOwner">;
type PostgresTagRepositoryLike = Pick<PostgresTagRepository, "listByOwner">;
type PostgresTaskRepositoryLike = Pick<
  PostgresTaskRepository,
  "listByOwner" | "listByProjectIds" | "findById" | "create" | "update" | "delete" | "deleteByProjectIds"
>;

function toTask(record: TaskRecord): Task {
  return {
    id: record.id,
    project_id: record.project_id,
    title: record.title,
    description: record.description,
    due_date: record.due_date,
    priority: record.priority,
    status: record.status,
    tag_ids: record.tag_ids,
    reminders: record.reminders,
    created_at: record.created_at,
    updated_at: record.updated_at,
    completed_at: record.completed_at,
  };
}

function taskRevisionByProject(records: TaskRecord[]): TaskListResponse["revisions"] {
  const maxVersionByProject = new Map<string, number>();

  for (const record of records) {
    const current = maxVersionByProject.get(record.project_id) ?? 0;
    maxVersionByProject.set(record.project_id, Math.max(current, record.version));
  }

  return Object.fromEntries(
    Array.from(maxVersionByProject.entries()).map(([projectId, version]) => [`task:${projectId}`, version.toString()]),
  );
}

function buildProjectPath(projectId: string, projectMap: Map<string, Project>): string {
  const names: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = projectId;

  while (currentId) {
    if (visited.has(currentId)) {
      break;
    }

    visited.add(currentId);
    const project = projectMap.get(currentId);

    if (!project) {
      names.unshift(currentId);
      break;
    }

    names.unshift(project.name);
    currentId = project.parent_id;
  }

  return names.join("/");
}

function toTaskListItem(task: Task, projectMap: Map<string, Project>, tagMap: Map<string, Pick<Tag, "id" | "name">>): TaskListItemDto {
  const project = projectMap.get(task.project_id);

  return {
    id: task.id,
    title: task.title,
    dueDate: task.due_date,
    priority: task.priority,
    createdAt: task.created_at,
    projectPath: buildProjectPath(task.project_id, projectMap),
    status: task.status,
    project: project ?? {
      id: task.project_id,
      name: task.project_id,
      color: "#808080",
    },
    tags: task.tag_ids.map((tagId) => tagMap.get(tagId)).filter((tag): tag is Pick<Tag, "id" | "name"> => Boolean(tag)),
  };
}

async function resolveOwner(appUserResolver: AppUserResolver): Promise<User> {
  return appUserResolver();
}

export class PostgresTaskService {
  constructor(
    private readonly appUserResolver: AppUserResolver = requireAppUser,
    private readonly taskRepository: PostgresTaskRepositoryLike = new PostgresTaskRepository(),
    private readonly projectRepository: PostgresProjectRepositoryLike = new PostgresProjectRepository(),
    private readonly tagRepository: PostgresTagRepositoryLike = new PostgresTagRepository(),
  ) {}

  private async resolveProjectIds(
    ownerUserId: string,
    options?: Pick<TaskListOptions, "projectId" | "projectIds" | "includeProjectDescendants">,
  ): Promise<string[]> {
    const projects = (await this.projectRepository.listByOwner(ownerUserId)).map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      color: project.color,
      parent_id: project.parent_id,
      system: project.system,
      created_at: project.created_at,
      updated_at: project.updated_at,
    }));

    if (options?.projectIds && options.projectIds.length > 0) {
      if (!options.includeProjectDescendants) {
        return options.projectIds;
      }

      return Array.from(new Set(options.projectIds.flatMap((projectId) => collectDescendantProjectIds(projects, projectId))));
    }

    if (options?.projectId) {
      if (options.includeProjectDescendants) {
        return collectDescendantProjectIds(projects, options.projectId);
      }

      return [options.projectId];
    }

    return projects.map((project) => project.id);
  }

  async list(projectId?: string): Promise<TaskListResponse>;
  async list(options?: TaskListOptions): Promise<TaskListResponse>;
  async list(projectIdOrOptions?: string | TaskListOptions): Promise<TaskListResponse> {
    const options = typeof projectIdOrOptions === "string" ? { projectId: projectIdOrOptions } : (projectIdOrOptions ?? {});
    const user = await resolveOwner(this.appUserResolver);
    const [projects, tags] = await Promise.all([
      this.projectRepository.listByOwner(user.id),
      this.tagRepository.listByOwner(user.id),
    ]);
    const projectIds = await this.resolveProjectIds(user.id, options);
    const taskRecords = projectIds.length > 0 ? await this.taskRepository.listByProjectIds(user.id, projectIds) : [];
    const projectMap = new Map(projects.map((project) => [project.id, {
      id: project.id,
      name: project.name,
      description: project.description,
      color: project.color,
      parent_id: project.parent_id,
      system: project.system,
      created_at: project.created_at,
      updated_at: project.updated_at,
    }]));
    const tagMap = new Map(tags.map((tag) => [tag.id, { id: tag.id, name: tag.name }]));
    const normalizedQuery = options.query?.trim().toLowerCase();
    const requiredTagIds = options.tagIds ?? [];
    const includeCompleted = options.includeCompleted ?? true;
    const tasks = taskRecords
      .map(toTask)
      .filter((task) => includeCompleted || task.status !== "done")
      .filter((task) => !normalizedQuery || task.title.toLowerCase().includes(normalizedQuery))
      .filter((task) => requiredTagIds.every((tagId) => task.tag_ids.includes(tagId)));

    const revisions = {
      ...taskRevisionByProject(taskRecords),
      ...(projects.length > 0 ? { project: Math.max(...projects.map((project) => project.version)).toString() } : {}),
      ...(tags.length > 0 ? { tag: Math.max(...tags.map((tag) => tag.version)).toString() } : {}),
    };

    return createTaskListResponse(
      tasks.map((task) => toTaskListItem(task, projectMap, tagMap)),
      revisions,
      DEFAULT_TASK_LIST_SORT as ViewSort,
    );
  }

  async get(taskId: string): Promise<Task | null> {
    const user = await resolveOwner(this.appUserResolver);
    const task = await this.taskRepository.findById(user.id, taskId);
    return task ? toTask(task) : null;
  }

  async create(input: CreateTaskInput, _options?: TaskMutationOptions): Promise<TaskMutationResponse> {
    const payload = createTaskInputSchema.parse(input);
    const user = await resolveOwner(this.appUserResolver);
    const [projects, tags] = await Promise.all([
      this.projectRepository.listByOwner(user.id),
      this.tagRepository.listByOwner(user.id),
    ]);
    const projectId = payload.project_id ?? projects.find((project) => project.system)?.id;

    if (!projectId || !projects.some((project) => project.id === projectId)) {
      throw new Error("Project not found");
    }

    const requestedTagIds = payload.tag_ids ?? [];
    const unknownTagIds = requestedTagIds.filter((tagId) => !tags.some((tag) => tag.id === tagId));

    if (unknownTagIds.length > 0) {
      throw new Error("Tag not found");
    }

    const now = new Date().toISOString();
    const task = await this.taskRepository.create({
      id: randomUUID(),
      owner_user_id: user.id,
      project_id: projectId,
      title: payload.title,
      description: payload.description ?? null,
      due_date: payload.due_date ?? null,
      priority: payload.priority ?? null,
      status: "todo",
      tag_ids: requestedTagIds,
      reminders: [],
      completed_at: null,
      created_at: now,
      updated_at: now,
    });

    return {
      task: toTask(task),
      revisions: {
        [`task:${task.project_id}`]: task.version.toString(),
      },
    };
  }

  async update(taskId: string, input: UpdateTaskInput, options?: TaskMutationOptions): Promise<TaskMutationResponse> {
    const payload = updateTaskInputSchema.parse(input);
    const user = await resolveOwner(this.appUserResolver);
    const [currentTask, projects, tags] = await Promise.all([
      this.taskRepository.findById(user.id, taskId),
      this.projectRepository.listByOwner(user.id),
      this.tagRepository.listByOwner(user.id),
    ]);

    if (!currentTask) {
      throw new Error("Task not found");
    }

    const destinationProjectId = payload.project_id ?? currentTask.project_id;

    if (!projects.some((project) => project.id === destinationProjectId)) {
      throw new Error("Project not found");
    }

    const requestedTagIds = payload.tag_ids ?? currentTask.tag_ids;
    const unknownTagIds = requestedTagIds.filter((tagId) => !tags.some((tag) => tag.id === tagId));

    if (unknownTagIds.length > 0) {
      throw new Error("Tag not found");
    }

    const completed_at = payload.status === "done"
      ? new Date().toISOString()
      : payload.status === "todo"
        ? null
        : undefined;

    const task = await this.taskRepository.update({
      id: taskId,
      owner_user_id: user.id,
      project_id: destinationProjectId,
      title: payload.title,
      description: payload.description,
      due_date: payload.due_date,
      priority: payload.priority,
      status: payload.status,
      tag_ids: requestedTagIds,
      completed_at,
      updated_at: new Date().toISOString(),
      expectedVersion: options?.expectedRevision ? Number(options.expectedRevision) : undefined,
    });

    return {
      task: toTask(task),
      previousProjectId: currentTask.project_id === task.project_id ? undefined : currentTask.project_id,
      revisions: {
        [`task:${task.project_id}`]: task.version.toString(),
      },
    };
  }

  async delete(taskId: string): Promise<TaskDeleteResponse> {
    const user = await resolveOwner(this.appUserResolver);
    const task = await this.taskRepository.delete(user.id, taskId);

    if (!task) {
      throw new Error("Task not found");
    }

    return {
      deletedTaskId: taskId,
      projectId: task.project_id,
      revisions: {},
    };
  }
}
