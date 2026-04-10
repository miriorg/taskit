import { randomUUID } from "node:crypto";

import { requireAppUser } from "@/lib/auth/app-user";
import { PostgresProjectRepository, type ProjectRecord } from "@/lib/repositories/postgres-project-repository";
import { SYSTEM_PROJECT_IDS } from "@/lib/utils/system-projects";
import { createProjectInputSchema, updateProjectInputSchema } from "@/lib/validators";
import type { CreateProjectInput, Project, ProjectDeleteResponse, ProjectListResponse, ProjectMutationResponse, UpdateProjectInput, User } from "@/types";

import { collectDescendantProjectIds } from "./project-service";

type AppUserResolver = typeof requireAppUser;
type PostgresProjectRepositoryLike = Pick<
  PostgresProjectRepository,
  "listByOwner" | "findById" | "create" | "update" | "deleteMany"
>;

function toProject(record: ProjectRecord): Project {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    color: record.color,
    parent_id: record.parent_id,
    system: record.system,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function projectRevisionFromRecords(records: ProjectRecord[]): string | undefined {
  if (records.length === 0) {
    return undefined;
  }

  return records.reduce((currentMax, record) => Math.max(currentMax, record.version), 0).toString();
}

function projectRevisionFromRecord(record: ProjectRecord): string {
  return record.version.toString();
}

async function resolveOwner(
  appUserResolver: AppUserResolver,
): Promise<User> {
  return appUserResolver();
}

export class PostgresProjectService {
  constructor(
    private readonly appUserResolver: AppUserResolver = requireAppUser,
    private readonly projectRepository: PostgresProjectRepositoryLike = new PostgresProjectRepository(),
  ) {}

  async list(): Promise<ProjectListResponse> {
    const user = await resolveOwner(this.appUserResolver);
    const projects = await this.projectRepository.listByOwner(user.id);
    const revision = projectRevisionFromRecords(projects);

    return {
      projects: projects.map(toProject),
      revisions: revision ? { project: revision } : {},
    };
  }

  async get(projectId: string): Promise<Project | null> {
    const user = await resolveOwner(this.appUserResolver);
    const project = await this.projectRepository.findById(user.id, projectId);

    return project ? toProject(project) : null;
  }

  async create(input: CreateProjectInput): Promise<ProjectMutationResponse> {
    const payload = createProjectInputSchema.parse(input);
    const user = await resolveOwner(this.appUserResolver);
    const existingProjects = await this.projectRepository.listByOwner(user.id);

    if (payload.parent_id) {
      const parentProject = existingProjects.find((project) => project.id === payload.parent_id);

      if (!parentProject) {
        throw new Error("Parent project not found");
      }

      if (parentProject.system) {
        throw new Error("System project cannot be a parent");
      }
    }

    const now = new Date().toISOString();
    const project = await this.projectRepository.create({
      id: randomUUID(),
      owner_user_id: user.id,
      name: payload.name,
      description: payload.description?.trim() ?? "",
      color: payload.color,
      parent_id: payload.parent_id ?? null,
      system: false,
      created_at: now,
      updated_at: now,
    });

    return {
      project: toProject(project),
      revisions: {
        project: projectRevisionFromRecord(project),
      },
    };
  }

  async update(projectId: string, input: UpdateProjectInput, expectedRevision?: string): Promise<ProjectMutationResponse> {
    const payload = updateProjectInputSchema.parse(input);
    const user = await resolveOwner(this.appUserResolver);
    const existingProjects = await this.projectRepository.listByOwner(user.id);
    const currentProject = existingProjects.find((project) => project.id === projectId);

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
      const parentProject = existingProjects.find((project) => project.id === payload.parent_id);

      if (!parentProject) {
        throw new Error("Parent project not found");
      }

      if (parentProject.system) {
        throw new Error("System project cannot be a parent");
      }

      if (payload.parent_id === projectId) {
        throw new Error("Project cannot be its own parent");
      }

      if (isDescendantProject(existingProjects.map(toProject), payload.parent_id, projectId)) {
        throw new Error("Project cannot move under its descendant");
      }
    }

    const project = await this.projectRepository.update({
      id: projectId,
      owner_user_id: user.id,
      name: payload.name?.trim(),
      description: payload.description?.trim(),
      color: payload.color,
      parent_id: payload.parent_id,
      updated_at: new Date().toISOString(),
      expectedVersion: expectedRevision ? Number(expectedRevision) : undefined,
    });

    return {
      project: toProject(project),
      revisions: {
        project: projectRevisionFromRecord(project),
      },
    };
  }

  async delete(projectId: string): Promise<ProjectDeleteResponse> {
    if (SYSTEM_PROJECT_IDS.includes(projectId as (typeof SYSTEM_PROJECT_IDS)[number])) {
      throw new Error("System project cannot be deleted");
    }

    const user = await resolveOwner(this.appUserResolver);
    const existingProjects = await this.projectRepository.listByOwner(user.id);

    if (!existingProjects.some((project) => project.id === projectId)) {
      throw new Error("Project not found");
    }

    const deletedProjectIds = collectDescendantProjectIds(existingProjects.map(toProject), projectId);
    await this.projectRepository.deleteMany(user.id, deletedProjectIds);

    return {
      deletedProjectIds,
      revisions: {},
    };
  }
}

function isDescendantProject(projects: Project[], candidateParentId: string, projectId: string): boolean {
  return collectDescendantProjectIds(projects, projectId).includes(candidateParentId);
}
