import { randomUUID } from "node:crypto";

import { ProjectRepository } from "@/lib/repositories/project-repository";
import { TagRepository } from "@/lib/repositories/tag-repository";
import { TaskRepository } from "@/lib/repositories/task-repository";
import { createTagInputSchema, updateTagInputSchema } from "@/lib/validators";
import type { CreateTagInput, Tag, TagListResponse, UpdateTagInput } from "@/types";

export class TagService {
  constructor(
    private readonly tagRepository: TagRepository = new TagRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly taskRepository: TaskRepository = new TaskRepository(),
  ) {}

  async list(): Promise<TagListResponse> {
    const master = await this.tagRepository.getMaster();

    return {
      tags: master?.tags ?? [],
      revisions: master?.revision ? { tag: master.revision } : {},
    };
  }

  async get(tagId: string): Promise<Tag | null> {
    const master = await this.tagRepository.getMaster();
    return master?.tags.find((tag) => tag.id === tagId) ?? null;
  }

  async create(input: CreateTagInput, expectedRevision?: string): Promise<Tag> {
    const payload = createTagInputSchema.parse(input);
    const master = await this.tagRepository.getMaster();

    if (!master) {
      throw new Error("Tag master is not initialized");
    }

    if (master.tags.some((tag) => tag.name === payload.name)) {
      throw new Error("Tag name already exists");
    }

    const now = new Date().toISOString();
    const tag: Tag = {
      id: randomUUID(),
      name: payload.name,
      created_at: now,
      updated_at: now,
    };

    await this.tagRepository.save(
      {
        ...master,
        updated_at: now,
        tags: [...master.tags, tag],
      },
      expectedRevision ?? master.revision,
    );

    return tag;
  }

  async update(tagId: string, input: UpdateTagInput, expectedRevision?: string): Promise<Tag> {
    const payload = updateTagInputSchema.parse(input);
    const master = await this.tagRepository.getMaster();

    if (!master) {
      throw new Error("Tag master is not initialized");
    }

    const current = master.tags.find((tag) => tag.id === tagId);

    if (!current) {
      throw new Error("Tag not found");
    }

    if (payload.name && master.tags.some((tag) => tag.id !== tagId && tag.name === payload.name)) {
      throw new Error("Tag name already exists");
    }

    const updated: Tag = {
      ...current,
      ...payload,
      updated_at: new Date().toISOString(),
    };

    await this.tagRepository.save(
      {
        ...master,
        updated_at: updated.updated_at,
        tags: master.tags.map((tag) => (tag.id === tagId ? updated : tag)),
      },
      expectedRevision ?? master.revision,
    );

    return updated;
  }

  async delete(tagId: string, expectedRevision?: string): Promise<void> {
    const [master, projectMaster] = await Promise.all([
      this.tagRepository.getMaster(),
      this.projectRepository.getMaster(),
    ]);

    if (!master) {
      throw new Error("Tag master is not initialized");
    }

    if (!master.tags.some((tag) => tag.id === tagId)) {
      throw new Error("Tag not found");
    }

    await this.tagRepository.save(
      {
        ...master,
        updated_at: new Date().toISOString(),
        tags: master.tags.filter((tag) => tag.id !== tagId),
      },
      expectedRevision ?? master.revision,
    );

    const projectIds = projectMaster?.projects.map((project) => project.id) ?? [];

    for (const projectId of projectIds) {
      const taskFile = await this.taskRepository.getByProjectId(projectId);
      const hasReference = taskFile.tasks.some((task) => task.tag_ids.includes(tagId));

      if (!hasReference) {
        continue;
      }

      await this.taskRepository.save(
        {
          ...taskFile,
          updated_at: new Date().toISOString(),
          tasks: taskFile.tasks.map((task) => ({
            ...task,
            tag_ids: task.tag_ids.filter((candidateTagId) => candidateTagId !== tagId),
          })),
        },
        taskFile.revision,
      );
    }
  }
}
