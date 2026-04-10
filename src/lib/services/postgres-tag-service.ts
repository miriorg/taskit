import { randomUUID } from "node:crypto";

import { requireAppUser } from "@/lib/auth/app-user";
import { PostgresTagRepository, type TagRecord } from "@/lib/repositories/postgres-tag-repository";
import { createTagInputSchema, updateTagInputSchema } from "@/lib/validators";
import type { CreateTagInput, Tag, TagDeleteResponse, TagListResponse, TagMutationResponse, UpdateTagInput, User } from "@/types";

type AppUserResolver = typeof requireAppUser;
type PostgresTagRepositoryLike = Pick<PostgresTagRepository, "listByOwner" | "findById" | "create" | "update" | "delete">;

function normalizeTagName(name: string) {
  return name.trim().replace(/^[#＃]+/, "").trim().toLowerCase();
}

function sanitizeTagName(name: string) {
  return name.trim().replace(/^[#＃]+/, "").trim();
}

function sanitizeTagDescription(description: string | undefined) {
  return description?.trim() ?? "";
}

function toTag(record: TagRecord): Tag {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function tagRevision(records: TagRecord[]): string | undefined {
  if (records.length === 0) {
    return undefined;
  }

  return records.reduce((currentMax, record) => Math.max(currentMax, record.version), 0).toString();
}

function tagRevisionFromRecord(record: TagRecord): string {
  return record.version.toString();
}

async function resolveOwner(appUserResolver: AppUserResolver): Promise<User> {
  return appUserResolver();
}

export class PostgresTagService {
  constructor(
    private readonly appUserResolver: AppUserResolver = requireAppUser,
    private readonly tagRepository: PostgresTagRepositoryLike = new PostgresTagRepository(),
  ) {}

  async list(): Promise<TagListResponse> {
    const user = await resolveOwner(this.appUserResolver);
    const tags = await this.tagRepository.listByOwner(user.id);
    const revision = tagRevision(tags);

    return {
      tags: tags.map(toTag),
      revisions: revision ? { tag: revision } : {},
    };
  }

  async get(tagId: string): Promise<Tag | null> {
    const user = await resolveOwner(this.appUserResolver);
    const tag = await this.tagRepository.findById(user.id, tagId);
    return tag ? toTag(tag) : null;
  }

  async create(input: CreateTagInput): Promise<TagMutationResponse> {
    const payload = createTagInputSchema.parse(input);
    const user = await resolveOwner(this.appUserResolver);
    const tags = await this.tagRepository.listByOwner(user.id);
    const sanitizedName = sanitizeTagName(payload.name);

    if (tags.some((tag) => normalizeTagName(tag.name) === normalizeTagName(sanitizedName))) {
      throw new Error("Tag name already exists");
    }

    const now = new Date().toISOString();
    const tag = await this.tagRepository.create({
      id: randomUUID(),
      owner_user_id: user.id,
      name: sanitizedName,
      description: sanitizeTagDescription(payload.description),
      created_at: now,
      updated_at: now,
    });

    return {
      tag: toTag(tag),
      revisions: {
        tag: tagRevisionFromRecord(tag),
      },
    };
  }

  async update(tagId: string, input: UpdateTagInput, expectedRevision?: string): Promise<TagMutationResponse> {
    const payload = updateTagInputSchema.parse(input);
    const user = await resolveOwner(this.appUserResolver);
    const tags = await this.tagRepository.listByOwner(user.id);
    const current = tags.find((tag) => tag.id === tagId);

    if (!current) {
      throw new Error("Tag not found");
    }

    const sanitizedRequestedName = payload.name ? sanitizeTagName(payload.name) : null;
    const normalizedRequestedName = sanitizedRequestedName ? normalizeTagName(sanitizedRequestedName) : null;

    if (normalizedRequestedName && tags.some((tag) => tag.id !== tagId && normalizeTagName(tag.name) === normalizedRequestedName)) {
      throw new Error("Tag name already exists");
    }

    const tag = await this.tagRepository.update({
      id: tagId,
      owner_user_id: user.id,
      name: sanitizedRequestedName ?? undefined,
      description: payload.description !== undefined ? sanitizeTagDescription(payload.description) : undefined,
      updated_at: new Date().toISOString(),
      expectedVersion: expectedRevision ? Number(expectedRevision) : undefined,
    });

    return {
      tag: toTag(tag),
      revisions: {
        tag: tagRevisionFromRecord(tag),
      },
    };
  }

  async delete(tagId: string): Promise<TagDeleteResponse> {
    const user = await resolveOwner(this.appUserResolver);
    const deleted = await this.tagRepository.delete(user.id, tagId);

    if (!deleted) {
      throw new Error("Tag not found");
    }

    return {
      deletedTagId: tagId,
      revisions: {},
    };
  }
}
