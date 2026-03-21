import { ProjectRepository } from "@/lib/repositories/project-repository";
import { TagRepository } from "@/lib/repositories/tag-repository";
import { TaskRepository, createEmptyTaskFile } from "@/lib/repositories/task-repository";
import { ViewRepository } from "@/lib/repositories/view-repository";
import { DONE_PROJECT_ID, INBOX_PROJECT_ID } from "@/lib/utils/system-projects";
import type { ProjectMasterFile, TagMasterFile, ViewMasterFile } from "@/types";

const SCHEMA_VERSION = 1;

function nowIsoString(): string {
  return new Date().toISOString();
}

export function createInitialProjectMasterFile(now = nowIsoString()): ProjectMasterFile {
  return {
    schema_version: SCHEMA_VERSION,
    updated_at: now,
    projects: [
      {
        id: INBOX_PROJECT_ID,
        name: "インボックス",
        color: "#808080",
        parent_id: null,
        system: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: DONE_PROJECT_ID,
        name: "完了",
        color: "#4caf50",
        parent_id: null,
        system: true,
        created_at: now,
        updated_at: now,
      },
    ],
  };
}

export function createInitialTagMasterFile(now = nowIsoString()): TagMasterFile {
  return {
    schema_version: SCHEMA_VERSION,
    updated_at: now,
    tags: [],
  };
}

export function createInitialViewMasterFile(now = nowIsoString()): ViewMasterFile {
  return {
    schema_version: SCHEMA_VERSION,
    updated_at: now,
    views: [],
  };
}

type ProjectRepositoryLike = Pick<ProjectRepository, "getMaster" | "save">;
type TagRepositoryLike = Pick<TagRepository, "getMaster" | "save">;
type ViewRepositoryLike = Pick<ViewRepository, "getMaster" | "save">;
type TaskRepositoryLike = Pick<TaskRepository, "getByProjectId" | "save">;

export class BootstrapService {
  constructor(
    private readonly projectRepository: ProjectRepositoryLike = new ProjectRepository(),
    private readonly tagRepository: TagRepositoryLike = new TagRepository(),
    private readonly viewRepository: ViewRepositoryLike = new ViewRepository(),
    private readonly taskRepository: TaskRepositoryLike = new TaskRepository(),
  ) {}

  async execute() {
    const [projectMaster, tagMaster, viewMaster, inboxTaskFile, doneTaskFile] = await Promise.all([
      this.projectRepository.getMaster(),
      this.tagRepository.getMaster(),
      this.viewRepository.getMaster(),
      this.taskRepository.getByProjectId(INBOX_PROJECT_ID),
      this.taskRepository.getByProjectId(DONE_PROJECT_ID),
    ]);

    const created: string[] = [];

    if (!projectMaster) {
      await this.projectRepository.save(createInitialProjectMasterFile());
      created.push("project.json");
    }

    if (!tagMaster) {
      await this.tagRepository.save(createInitialTagMasterFile());
      created.push("tag.json");
    }

    if (!viewMaster) {
      await this.viewRepository.save(createInitialViewMasterFile());
      created.push("view.json");
    }

    if (inboxTaskFile.tasks.length === 0 && !inboxTaskFile.revision) {
      await this.taskRepository.save(createEmptyTaskFile(INBOX_PROJECT_ID));
      created.push(`task-${INBOX_PROJECT_ID}.json`);
    }

    if (doneTaskFile.tasks.length === 0 && !doneTaskFile.revision) {
      await this.taskRepository.save(createEmptyTaskFile(DONE_PROJECT_ID));
      created.push(`task-${DONE_PROJECT_ID}.json`);
    }

    return {
      success: true,
      created,
    };
  }
}
