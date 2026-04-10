import { randomUUID } from "node:crypto";

import { requireAppUser } from "@/lib/auth/app-user";
import { PostgresTaskService } from "@/lib/services/postgres-task-service";
import { PostgresViewRepository, type ViewRecord } from "@/lib/repositories/postgres-view-repository";
import { createTaskListResponse } from "@/lib/services/task-service";
import { createViewInputSchema, updateViewInputSchema } from "@/lib/validators";
import type { CreateViewInput, TaskListResponse, UpdateViewInput, User, View, ViewDeleteResponse, ViewListResponse, ViewMutationResponse } from "@/types";

type AppUserResolver = typeof requireAppUser;
type PostgresViewRepositoryLike = Pick<PostgresViewRepository, "listByOwner" | "findById" | "create" | "update" | "delete">;
type PostgresTaskServiceLike = Pick<PostgresTaskService, "list">;

function toView(record: ViewRecord): View {
  return {
    id: record.id,
    name: record.name,
    filters: record.filters,
    sort: record.sort,
    display_options: record.display_options,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function viewRevision(records: ViewRecord[]): string | undefined {
  if (records.length === 0) {
    return undefined;
  }

  return records.reduce((currentMax, record) => Math.max(currentMax, record.version), 0).toString();
}

function viewRevisionFromRecord(record: ViewRecord): string {
  return record.version.toString();
}

async function resolveOwner(appUserResolver: AppUserResolver): Promise<User> {
  return appUserResolver();
}

export class PostgresViewService {
  constructor(
    private readonly appUserResolver: AppUserResolver = requireAppUser,
    private readonly viewRepository: PostgresViewRepositoryLike = new PostgresViewRepository(),
    private readonly taskService: PostgresTaskServiceLike = new PostgresTaskService(),
  ) {}

  async list(): Promise<ViewListResponse> {
    const user = await resolveOwner(this.appUserResolver);
    const views = await this.viewRepository.listByOwner(user.id);
    const revision = viewRevision(views);

    return {
      views: views.map(toView),
      revisions: revision ? { view: revision } : {},
    };
  }

  async get(viewId: string): Promise<View | null> {
    const user = await resolveOwner(this.appUserResolver);
    const view = await this.viewRepository.findById(user.id, viewId);
    return view ? toView(view) : null;
  }

  async create(input: CreateViewInput): Promise<ViewMutationResponse> {
    const payload = createViewInputSchema.parse(input);
    const user = await resolveOwner(this.appUserResolver);
    const now = new Date().toISOString();
    const view = await this.viewRepository.create({
      id: randomUUID(),
      owner_user_id: user.id,
      name: payload.name,
      filters: payload.filters,
      sort: payload.sort,
      display_options: payload.display_options,
      created_at: now,
      updated_at: now,
    });

    return {
      view: toView(view),
      revisions: {
        view: viewRevisionFromRecord(view),
      },
    };
  }

  async update(viewId: string, input: UpdateViewInput, expectedRevision?: string): Promise<ViewMutationResponse> {
    const payload = updateViewInputSchema.parse(input);
    const user = await resolveOwner(this.appUserResolver);
    const view = await this.viewRepository.update({
      id: viewId,
      owner_user_id: user.id,
      name: payload.name,
      filters: payload.filters,
      sort: payload.sort,
      display_options: payload.display_options,
      updated_at: new Date().toISOString(),
      expectedVersion: expectedRevision ? Number(expectedRevision) : undefined,
    });

    return {
      view: toView(view),
      revisions: {
        view: viewRevisionFromRecord(view),
      },
    };
  }

  async delete(viewId: string): Promise<ViewDeleteResponse> {
    const user = await resolveOwner(this.appUserResolver);
    const deleted = await this.viewRepository.delete(user.id, viewId);

    if (!deleted) {
      throw new Error("View not found");
    }

    return {
      deletedViewId: viewId,
      revisions: {},
    };
  }

  async query(viewId: string, options?: { query?: string }): Promise<TaskListResponse> {
    const view = await this.get(viewId);

    if (!view) {
      throw new Error("View not found");
    }

    const listResponse = await this.taskService.list({
      projectIds: view.filters.project_ids,
      includeProjectDescendants: view.filters.include_project_descendants,
      includeCompleted: view.display_options.show_completed,
      tagIds: view.filters.tag_ids,
      query: options?.query,
    });
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const filtered = listResponse.items.filter((item) => {
      const query = view.filters.query?.trim().toLowerCase();

      if (query && !item.title.toLowerCase().includes(query)) {
        return false;
      }

      if (view.filters.due === "today") {
        if (!item.dueDate || item.dueDate.slice(0, 10) !== startOfToday.slice(0, 10)) {
          return false;
        }
      }

      if (view.filters.due === "overdue") {
        if (!item.dueDate || item.dueDate >= startOfToday) {
          return false;
        }
      }

      if (view.filters.due === "none" && item.dueDate) {
        return false;
      }

      return view.display_options.show_completed || item.status !== "done";
    });

    return createTaskListResponse(filtered, listResponse.revisions, view.sort);
  }
}
