import { randomUUID } from "node:crypto";

import { ProjectRepository } from "@/lib/repositories/project-repository";
import { TaskRepository } from "@/lib/repositories/task-repository";
import { TagRepository } from "@/lib/repositories/tag-repository";
import { DONE_PROJECT_ID, INBOX_PROJECT_ID } from "@/lib/utils/system-projects";
import { createTaskInputSchema, updateTaskInputSchema } from "@/lib/validators";
import type { CreateTaskInput, Task, TaskListItemDto, TaskListResponse, UpdateTaskInput } from "@/types";

type TaskLocation = {
  task: Task;
  taskFileRevision?: string;
};

function toTaskListItem(task: Task, projectMap: Map<string, { id: string; name: string; color: string }>, tagMap: Map<string, { id: string; name: string }>): TaskListItemDto {
  return {
    id: task.id,
    title: task.title,
    dueDate: task.due_date,
    priority: task.priority,
    status: task.status,
    project: projectMap.get(task.project_id) ?? {
      id: task.project_id,
      name: task.project_id,
      color: "#808080",
    },
    tags: task.tag_ids.map((tagId) => tagMap.get(tagId)).filter((tag): tag is { id: string; name: string } => Boolean(tag)),
  };
}

export class TaskService {
  constructor(
    private readonly taskRepository: TaskRepository = new TaskRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly tagRepository: TagRepository = new TagRepository(),
  ) {}

  private async resolveProjectIds(projectId?: string): Promise<string[]> {
    if (projectId) {
      return [projectId];
    }

    const projectMaster = await this.projectRepository.getMaster();
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

  async list(projectId?: string): Promise<TaskListResponse> {
    const [projectMaster, tagMaster] = await Promise.all([
      this.projectRepository.getMaster(),
      this.tagRepository.getMaster(),
    ]);
    const projectIds = projectId ? [projectId] : (projectMaster?.projects.map((project) => project.id) ?? []);
    const taskFiles = await Promise.all(projectIds.map((id) => this.taskRepository.getByProjectId(id)));
    const projectMap = new Map((projectMaster?.projects ?? []).map((project) => [project.id, project]));
    const tagMap = new Map((tagMaster?.tags ?? []).map((tag) => [tag.id, tag]));
    const items = taskFiles
      .flatMap((taskFile) => taskFile.tasks)
      .sort((left, right) => {
        if (!left.due_date && !right.due_date) {
          return left.created_at.localeCompare(right.created_at);
        }

        if (!left.due_date) {
          return 1;
        }

        if (!right.due_date) {
          return -1;
        }

        return left.due_date.localeCompare(right.due_date);
      })
      .map((task) => toTaskListItem(task, projectMap, tagMap));
    const revisions = {
      ...(projectMaster?.revision ? { project: projectMaster.revision } : {}),
      ...(tagMaster?.revision ? { tag: tagMaster.revision } : {}),
      ...Object.fromEntries(taskFiles.flatMap((taskFile) => (taskFile.revision ? [[`task:${taskFile.project_id}`, taskFile.revision]] : []))),
    };

    return {
      items,
      revisions,
    };
  }

  async get(taskId: string): Promise<Task | null> {
    const location = await this.findTaskById(taskId);
    return location?.task ?? null;
  }

  async create(input: CreateTaskInput): Promise<Task> {
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
      taskFile.revision,
    );

    return task;
  }

  async update(taskId: string, input: UpdateTaskInput): Promise<Task> {
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
      : payload.project_id ?? currentTask.project_id;

    if (!projectMaster.projects.some((project) => project.id === destinationProjectId)) {
      throw new Error("Project not found");
    }

    const requestedTagIds = payload.tag_ids ?? currentTask.tag_ids;
    const unknownTagIds = requestedTagIds.filter((tagId) => !tagMaster?.tags.some((tag) => tag.id === tagId));

    if (unknownTagIds.length > 0) {
      throw new Error("Tag not found");
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
      completed_at: payload.status === "done" ? now : currentTask.completed_at,
    };

    if (destinationProjectId === currentTask.project_id) {
      await this.taskRepository.save(
        {
          ...sourceTaskFile,
          updated_at: now,
          tasks: sourceTaskFile.tasks.map((task) => (task.id === taskId ? updatedTask : task)),
        },
        sourceTaskFile.revision,
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
      sourceTaskFile.revision,
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

  async delete(taskId: string): Promise<void> {
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
      taskFile.revision,
    );
  }
}
