import { randomUUID } from "node:crypto";

import { ProjectRepository } from "@/lib/repositories/project-repository";
import { TaskRepository } from "@/lib/repositories/task-repository";
import { DEFAULT_TASK_LIST_SORT, sortTaskListItems } from "@/lib/task-list-sort";
import { TagRepository } from "@/lib/repositories/tag-repository";
import { collectDescendantProjectIds } from "@/lib/services/project-service";
import { DONE_PROJECT_ID, INBOX_PROJECT_ID } from "@/lib/utils/system-projects";
import { createTaskInputSchema, updateTaskInputSchema } from "@/lib/validators";
import type { CreateTaskInput, Project, Task, TaskListItemDto, TaskListResponse, UpdateTaskInput, ViewSort } from "@/types";

type TaskLocation = {
  task: Task;
  taskFileRevision?: string;
};

export type TaskListOptions = {
  projectId?: string;
  projectIds?: string[];
  includeProjectDescendants?: boolean;
  query?: string;
  tagIds?: string[];
  includeCompleted?: boolean;
};

export type TaskMutationOptions = {
  expectedRevision?: string;
};

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

function toTaskListItem(task: Task, projectMap: Map<string, Project>, tagMap: Map<string, { id: string; name: string }>): TaskListItemDto {
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
    tags: task.tag_ids.map((tagId) => tagMap.get(tagId)).filter((tag): tag is { id: string; name: string } => Boolean(tag)),
  };
}

export function createTaskListResponse(
  items: TaskListItemDto[],
  revisions: TaskListResponse["revisions"],
  sort: ViewSort = DEFAULT_TASK_LIST_SORT,
): TaskListResponse {
  const sortedItems = sortTaskListItems(items, sort);

  return {
    items: sortedItems,
    todoItems: sortedItems.filter((item) => item.status !== "done"),
    completedItems: sortedItems.filter((item) => item.status === "done"),
    revisions,
  };
}

export class TaskService {
  constructor(
    private readonly taskRepository: TaskRepository = new TaskRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly tagRepository: TagRepository = new TagRepository(),
  ) {}

  private async resolveProjectIds(options?: Pick<TaskListOptions, "projectId" | "projectIds" | "includeProjectDescendants">): Promise<string[]> {
    const projectMaster = await this.projectRepository.getMaster();

    if (options?.projectIds && options.projectIds.length > 0) {
      if (!options.includeProjectDescendants || !projectMaster) {
        return options.projectIds;
      }

      return Array.from(
        new Set(options.projectIds.flatMap((projectId) => collectDescendantProjectIds(projectMaster.projects, projectId))),
      );
    }

    if (options?.projectId) {
      if (options.includeProjectDescendants && projectMaster) {
        return collectDescendantProjectIds(projectMaster.projects, options.projectId);
      }

      return [options.projectId];
    }

    return projectMaster?.projects.map((project) => project.id) ?? [INBOX_PROJECT_ID, DONE_PROJECT_ID];
  }

  private async findTaskById(taskId: string): Promise<TaskLocation | null> {
    const projectIds = await this.resolveProjectIds();

    for (const projectId of projectIds) {
      const taskFile = await this.taskRepository.getByProjectId(projectId);
      const task = taskFile.tasks.find((candidate) => candidate.id === taskId);

      if (task) {
        return {
          task,
          taskFileRevision: taskFile.revision,
        };
      }
    }

    return null;
  }

  async list(projectId?: string): Promise<TaskListResponse>;
  async list(options?: TaskListOptions): Promise<TaskListResponse>;
  async list(projectIdOrOptions?: string | TaskListOptions): Promise<TaskListResponse> {
    const options = typeof projectIdOrOptions === "string"
      ? { projectId: projectIdOrOptions }
      : (projectIdOrOptions ?? {});
    const [projectMaster, tagMaster] = await Promise.all([
      this.projectRepository.getMaster(),
      this.tagRepository.getMaster(),
    ]);
    const projectIds = await this.resolveProjectIds(options);
    const taskFiles = await Promise.all(projectIds.map((id) => this.taskRepository.getByProjectId(id)));
    const projectMap = new Map((projectMaster?.projects ?? []).map((project) => [project.id, project]));
    const tagMap = new Map((tagMaster?.tags ?? []).map((tag) => [tag.id, tag]));
    const normalizedQuery = options.query?.trim().toLowerCase();
    const requiredTagIds = options.tagIds ?? [];
    const includeCompleted = options.includeCompleted ?? true;
    const items = taskFiles
      .flatMap((taskFile) => taskFile.tasks)
      .filter((task) => includeCompleted || task.status !== "done")
      .filter((task) => !normalizedQuery || task.title.toLowerCase().includes(normalizedQuery))
      .filter((task) => requiredTagIds.every((tagId) => task.tag_ids.includes(tagId)))
      .map((task) => toTaskListItem(task, projectMap, tagMap));
    const revisions = {
      ...(projectMaster?.revision ? { project: projectMaster.revision } : {}),
      ...(tagMaster?.revision ? { tag: tagMaster.revision } : {}),
      ...Object.fromEntries(taskFiles.flatMap((taskFile) => (taskFile.revision ? [[`task:${taskFile.project_id}`, taskFile.revision]] : []))),
    };

    return createTaskListResponse(items, revisions);
  }

  async get(taskId: string): Promise<Task | null> {
    const location = await this.findTaskById(taskId);
    return location?.task ?? null;
  }

  async create(input: CreateTaskInput, options?: TaskMutationOptions): Promise<Task> {
    const payload = createTaskInputSchema.parse(input);
    const [projectMaster, tagMaster] = await Promise.all([
      this.projectRepository.getMaster(),
      this.tagRepository.getMaster(),
    ]);

    if (!projectMaster) {
      throw new Error("Project master is not initialized");
    }

    const projectId = payload.project_id ?? INBOX_PROJECT_ID;

    if (!projectMaster.projects.some((project) => project.id === projectId)) {
      throw new Error("Project not found");
    }

    const unknownTagIds = (payload.tag_ids ?? []).filter((tagId) => !tagMaster?.tags.some((tag) => tag.id === tagId));

    if (unknownTagIds.length > 0) {
      throw new Error("Tag not found");
    }

    const taskFile = await this.taskRepository.getByProjectId(projectId);
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      project_id: projectId,
      title: payload.title,
      description: payload.description ?? null,
      due_date: payload.due_date ?? null,
      priority: payload.priority ?? null,
      status: "todo",
      tag_ids: payload.tag_ids ?? [],
      reminders: [],
      created_at: now,
      updated_at: now,
      completed_at: null,
    };

    await this.taskRepository.save(
      {
        ...taskFile,
        updated_at: now,
        tasks: [...taskFile.tasks, task],
      },
      options?.expectedRevision ?? taskFile.revision,
    );

    return task;
  }

  async update(taskId: string, input: UpdateTaskInput, options?: TaskMutationOptions): Promise<Task> {
    const payload = updateTaskInputSchema.parse(input);
    const location = await this.findTaskById(taskId);

    if (!location) {
      throw new Error("Task not found");
    }

    const [projectMaster, tagMaster] = await Promise.all([
      this.projectRepository.getMaster(),
      this.tagRepository.getMaster(),
    ]);

    if (!projectMaster) {
      throw new Error("Project master is not initialized");
    }

    const currentTask = location.task;
    const sourceTaskFile = await this.taskRepository.getByProjectId(currentTask.project_id);
    const destinationProjectId = payload.status === "done"
      ? DONE_PROJECT_ID
      : payload.status === "todo" && currentTask.project_id === DONE_PROJECT_ID && !payload.project_id
        ? INBOX_PROJECT_ID
        : payload.project_id ?? currentTask.project_id;

    if (!projectMaster.projects.some((project) => project.id === destinationProjectId)) {
      throw new Error("Project not found");
    }

    const requestedTagIds = payload.tag_ids ?? currentTask.tag_ids;

    if (payload.tag_ids) {
      const unknownTagIds = requestedTagIds.filter((tagId) => !tagMaster?.tags.some((tag) => tag.id === tagId));

      if (unknownTagIds.length > 0) {
        throw new Error("Tag not found");
      }
    }

    const now = new Date().toISOString();
    const updatedTask: Task = {
      ...currentTask,
      ...payload,
      project_id: destinationProjectId,
      tag_ids: requestedTagIds,
      description: payload.description ?? currentTask.description,
      due_date: payload.due_date ?? currentTask.due_date,
      priority: payload.priority ?? currentTask.priority,
      status: payload.status ?? currentTask.status,
      updated_at: now,
      completed_at: payload.status === "done" ? now : payload.status === "todo" ? null : currentTask.completed_at,
    };

    if (destinationProjectId === currentTask.project_id) {
      await this.taskRepository.save(
        {
          ...sourceTaskFile,
          updated_at: now,
          tasks: sourceTaskFile.tasks.map((task) => (task.id === taskId ? updatedTask : task)),
        },
        options?.expectedRevision ?? sourceTaskFile.revision,
      );

      return updatedTask;
    }

    const destinationTaskFile = await this.taskRepository.getByProjectId(destinationProjectId);
    await this.taskRepository.save(
      {
        ...sourceTaskFile,
        updated_at: now,
        tasks: sourceTaskFile.tasks.filter((task) => task.id !== taskId),
      },
      options?.expectedRevision ?? sourceTaskFile.revision,
    );
    await this.taskRepository.save(
      {
        ...destinationTaskFile,
        updated_at: now,
        tasks: [...destinationTaskFile.tasks, updatedTask],
      },
      destinationTaskFile.revision,
    );

    return updatedTask;
  }

  async delete(taskId: string, options?: TaskMutationOptions): Promise<void> {
    const location = await this.findTaskById(taskId);

    if (!location) {
      throw new Error("Task not found");
    }

    const taskFile = await this.taskRepository.getByProjectId(location.task.project_id);
    await this.taskRepository.save(
      {
        ...taskFile,
        updated_at: new Date().toISOString(),
        tasks: taskFile.tasks.filter((task) => task.id !== taskId),
      },
      options?.expectedRevision ?? taskFile.revision,
    );
  }
}
