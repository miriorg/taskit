import { randomUUID } from "node:crypto";

import { migrateLegacyViewSort } from "@/lib/task-list-sort";
import { createTaskListResponse, TaskService } from "@/lib/services/task-service";
import { ViewRepository } from "@/lib/repositories/view-repository";
import { createViewInputSchema, updateViewInputSchema } from "@/lib/validators";
import type { CreateViewInput, TaskListResponse, UpdateViewInput, View, ViewListResponse } from "@/types";

export class ViewService {
  constructor(
    private readonly viewRepository: ViewRepository = new ViewRepository(),
    private readonly taskService: TaskService = new TaskService(),
  ) {}

  async list(): Promise<ViewListResponse> {
    const master = await this.viewRepository.getMaster();

    return {
      views: master?.views ?? [],
      revisions: master?.revision ? { view: master.revision } : {},
    };
  }

  async get(viewId: string): Promise<View | null> {
    const master = await this.viewRepository.getMaster();
    return master?.views.find((view) => view.id === viewId) ?? null;
  }

  async create(input: CreateViewInput, expectedRevision?: string): Promise<View> {
    const payload = createViewInputSchema.parse(input);
    const master = await this.viewRepository.getMaster();

    if (!master) {
      throw new Error("View master is not initialized");
    }

    const now = new Date().toISOString();
    const view: View = {
      id: randomUUID(),
      name: payload.name,
      filters: payload.filters,
      sort: migrateLegacyViewSort(payload.sort),
      display_options: payload.display_options,
      created_at: now,
      updated_at: now,
    };

    await this.viewRepository.save(
      {
        ...master,
        updated_at: now,
        views: [...master.views, view],
      },
      expectedRevision ?? master.revision,
    );

    return view;
  }

  async update(viewId: string, input: UpdateViewInput, expectedRevision?: string): Promise<View> {
    const payload = updateViewInputSchema.parse(input);
    const master = await this.viewRepository.getMaster();

    if (!master) {
      throw new Error("View master is not initialized");
    }

    const current = master.views.find((view) => view.id === viewId);

    if (!current) {
      throw new Error("View not found");
    }

    const updated: View = {
      ...current,
      ...payload,
      filters: payload.filters ?? current.filters,
      sort: payload.sort ? migrateLegacyViewSort(payload.sort) : current.sort,
      display_options: payload.display_options ?? current.display_options,
      updated_at: new Date().toISOString(),
    };

    await this.viewRepository.save(
      {
        ...master,
        updated_at: updated.updated_at,
        views: master.views.map((view) => (view.id === viewId ? updated : view)),
      },
      expectedRevision ?? master.revision,
    );

    return updated;
  }

  async delete(viewId: string, expectedRevision?: string): Promise<void> {
    const master = await this.viewRepository.getMaster();

    if (!master) {
      throw new Error("View master is not initialized");
    }

    if (!master.views.some((view) => view.id === viewId)) {
      throw new Error("View not found");
    }

    await this.viewRepository.save(
      {
        ...master,
        updated_at: new Date().toISOString(),
        views: master.views.filter((view) => view.id !== viewId),
      },
      expectedRevision ?? master.revision,
    );
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

      if (query) {
        if (!item.title.toLowerCase().includes(query)) {
          return false;
        }
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
