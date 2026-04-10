import { getDbClient } from "@/lib/db/client";
import type { Tag } from "@/types";

type TagRow = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export type TagRecord = Tag & {
  owner_user_id: string;
  version: number;
};

export type CreateTagRecordInput = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type UpdateTagRecordInput = {
  id: string;
  owner_user_id: string;
  name?: string;
  description?: string;
  updated_at: string;
  expectedVersion?: number;
};

function mapTagRow(row: TagRow): TagRecord {
  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    name: row.name,
    description: row.description,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class PostgresTagRepository {
  async listByOwner(ownerUserId: string): Promise<TagRecord[]> {
    const sql = getDbClient();
    const rows = await sql<TagRow[]>`
      select id, owner_user_id, name, description, version, created_at, updated_at
      from tags
      where owner_user_id = ${ownerUserId}
      order by created_at asc, id asc
    `;

    return rows.map(mapTagRow);
  }

  async findById(ownerUserId: string, tagId: string): Promise<TagRecord | null> {
    const sql = getDbClient();
    const [row] = await sql<TagRow[]>`
      select id, owner_user_id, name, description, version, created_at, updated_at
      from tags
      where owner_user_id = ${ownerUserId}
        and id = ${tagId}
      limit 1
    `;

    return row ? mapTagRow(row) : null;
  }

  async create(input: CreateTagRecordInput): Promise<TagRecord> {
    const sql = getDbClient();
    const [row] = await sql<TagRow[]>`
      insert into tags (
        id,
        owner_user_id,
        name,
        description,
        created_at,
        updated_at
      )
      values (
        ${input.id},
        ${input.owner_user_id},
        ${input.name},
        ${input.description},
        ${input.created_at},
        ${input.updated_at}
      )
      returning id, owner_user_id, name, description, version, created_at, updated_at
    `;

    return mapTagRow(row);
  }

  async update(input: UpdateTagRecordInput): Promise<TagRecord> {
    const sql = getDbClient();
    const name = input.name ?? null;
    const description = input.description ?? null;
    let rows: TagRow[];

    if (input.expectedVersion === undefined) {
      rows = await sql<TagRow[]>`
        update tags
        set
          name = coalesce(${name}, name),
          description = coalesce(${description}, description),
          version = version + 1,
          updated_at = ${input.updated_at}
        where owner_user_id = ${input.owner_user_id}
          and id = ${input.id}
        returning id, owner_user_id, name, description, version, created_at, updated_at
      `;
    } else {
      rows = await sql<TagRow[]>`
        update tags
        set
          name = coalesce(${name}, name),
          description = coalesce(${description}, description),
          version = version + 1,
          updated_at = ${input.updated_at}
        where owner_user_id = ${input.owner_user_id}
          and id = ${input.id}
          and version = ${input.expectedVersion}
        returning id, owner_user_id, name, description, version, created_at, updated_at
      `;
    }

    const [row] = rows;

    if (!row) {
      throw new Error("Tag not found or version conflict");
    }

    return mapTagRow(row);
  }

  async delete(ownerUserId: string, tagId: string): Promise<boolean> {
    const sql = getDbClient();
    const rows = await sql<{ id: string }[]>`
      delete from tags
      where owner_user_id = ${ownerUserId}
        and id = ${tagId}
      returning id
    `;

    return rows.length > 0;
  }
}
