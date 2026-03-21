import { randomUUID } from "node:crypto";

import { TagRepository } from "@/lib/repositories/tag-repository";
import { createTagInputSchema, updateTagInputSchema } from "@/lib/validators";
import type { CreateTagInput, Tag, TagListResponse, UpdateTagInput } from "@/types";

export class TagService {
  constructor(private readonly tagRepository: TagRepository = new TagRepository()) {}

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

  async create(input: CreateTagInput): Promise<Tag> {
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
      master.revision,
    );

    return tag;
  }

  async update(tagId: string, input: UpdateTagInput): Promise<Tag> {
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
      master.revision,
    );

    return updated;
  }

  async delete(tagId: string): Promise<void> {
    const master = await this.tagRepository.getMaster();

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
      master.revision,
    );
  }
}
