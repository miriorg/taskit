import { randomUUID } from "node:crypto";

import { ProjectRepository } from "@/lib/repositories/project-repository";
import { TaskRepository } from "@/lib/repositories/task-repository";
import { SYSTEM_PROJECT_IDS } from "@/lib/utils/system-projects";
import { createProjectInputSchema, updateProjectInputSchema } from "@/lib/validators";
import type { CreateProjectInput, Project, ProjectListResponse, UpdateProjectInput } from "@/types";

export function collectDescendantProjectIds(projects: Project[], rootProjectId: string): string[] {
  const childrenByParent = new Map<string, string[]>();

  projects.forEach((project) => {
    if (!project.parent_id) {
      return;
    }

    const siblings = childrenByParent.get(project.parent_id) ?? [];
    siblings.push(project.id);
    childrenByParent.set(project.parent_id, siblings);
  });

  const visited = new Set<string>();
  const stack = [rootProjectId];

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    const children = childrenByParent.get(current) ?? [];
    children.forEach((childId) => stack.push(childId));
  }

  return Array.from(visited);
}

function isDescendantProject(projects: Project[], candidateParentId: string, projectId: string): boolean {
  return collectDescendantProjectIds(projects, projectId).includes(candidateParentId);
}

export class ProjectService {
  constructor(
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly taskRepository: TaskRepository = new TaskRepository(),
  ) {}

  async list(): Promise<ProjectListResponse> {
    const master = await this.projectRepository.getMaster();

    return {
      projects: master?.projects ?? [],
      revisions: master?.revision ? { project: master.revision } : {},
    };
  }

  async get(projectId: string): Promise<Project | null> {
    const master = await this.projectRepository.getMaster();
    return master?.projects.find((project) => project.id === projectId) ?? null;
  }

  async create(input: CreateProjectInput, expectedRevision?: string): Promise<Project> {
    const payload = createProjectInputSchema.parse(input);
    const master = await this.projectRepository.getMaster();

    if (!master) {
      throw new Error("Project master is not initialized");
    }

    if (payload.parent_id) {
      const parentProject = master.projects.find((project) => project.id === payload.parent_id);

      if (!parentProject) {
        throw new Error("Parent project not found");
      }

      if (parentProject.system) {
        throw new Error("System project cannot be a parent");
      }
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name: payload.name,
      color: payload.color,
      parent_id: payload.parent_id ?? null,
      system: false,
      created_at: now,
      updated_at: now,
    };

    const updatedMaster = {
      ...master,
      updated_at: now,
      projects: [...master.projects, project],
    };

    await this.projectRepository.save(updatedMaster, expectedRevision ?? master.revision);
    return project;
  }

  async update(projectId: string, input: UpdateProjectInput, expectedRevision?: string): Promise<Project> {
    const payload = updateProjectInputSchema.parse(input);
    const master = await this.projectRepository.getMaster();

    if (!master) {
      throw new Error("Project master is not initialized");
    }

    const currentProject = master.projects.find((project) => project.id === projectId);

    if (!currentProject) {
      throw new Error("Project not found");
    }

    if (currentProject.system) {
      if (payload.name) {
        throw new Error("System project cannot be renamed");
      }

      if (payload.parent_id !== undefined) {
        throw new Error("System project parent cannot be changed");
      }
    }

    if (payload.parent_id) {
      const parentProject = master.projects.find((project) => project.id === payload.parent_id);

      if (!parentProject) {
        throw new Error("Parent project not found");
      }

      if (parentProject.system) {
        throw new Error("System project cannot be a parent");
      }

      if (payload.parent_id === projectId) {
        throw new Error("Project cannot be its own parent");
      }

      if (isDescendantProject(master.projects, payload.parent_id, projectId)) {
        throw new Error("Project cannot move under its descendant");
      }
    }

    const now = new Date().toISOString();
    const updatedProject: Project = {
      ...currentProject,
      ...payload,
      parent_id: payload.parent_id ?? currentProject.parent_id,
      updated_at: now,
    };
    const updatedMaster = {
      ...master,
      updated_at: now,
      projects: master.projects.map((project) => (project.id === projectId ? updatedProject : project)),
    };

    await this.projectRepository.save(updatedMaster, expectedRevision ?? master.revision);
    return updatedProject;
  }

  async delete(projectId: string, expectedRevision?: string): Promise<{ deletedProjectIds: string[] }> {
    if (SYSTEM_PROJECT_IDS.includes(projectId as (typeof SYSTEM_PROJECT_IDS)[number])) {
      throw new Error("System project cannot be deleted");
    }

    const master = await this.projectRepository.getMaster();

    if (!master) {
      throw new Error("Project master is not initialized");
    }

    if (!master.projects.some((project) => project.id === projectId)) {
      throw new Error("Project not found");
    }

    const deletedProjectIds = collectDescendantProjectIds(master.projects, projectId);
    const updatedMaster = {
      ...master,
      updated_at: new Date().toISOString(),
      projects: master.projects.filter((project) => !deletedProjectIds.includes(project.id)),
    };

    await this.projectRepository.save(updatedMaster, expectedRevision ?? master.revision);
    await Promise.all(deletedProjectIds.map((id) => this.taskRepository.deleteByProjectId(id)));

    return {
      deletedProjectIds,
    };
  }
}
