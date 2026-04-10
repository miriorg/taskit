import { randomUUID } from "node:crypto";

import { getDbClient } from "@/lib/db/client";
import type { Project } from "@/types";

type ProjectRow = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string;
  color: string;
  parent_id: string | null;
  system: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type ProjectRecord = Project & {
  owner_user_id: string;
  version: number;
};

export type CreateProjectRecordInput = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string;
  color: string;
  parent_id: string | null;
  system: boolean;
  created_at: string;
  updated_at: string;
};

export type UpdateProjectRecordInput = {
  id: string;
  owner_user_id: string;
  name?: string;
  description?: string;
  color?: string;
  parent_id?: string | null;
  system?: boolean;
  updated_at: string;
  expectedVersion?: number;
};

function mapProjectRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    name: row.name,
    description: row.description,
    color: row.color,
    parent_id: row.parent_id,
    system: row.system,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function createSystemProjectSeeds(ownerUserId: string, now: string): Omit<CreateProjectRecordInput, "id">[] {
  return [
    {
      owner_user_id: ownerUserId,
      name: "インボックス",
      description: "",
      color: "#808080",
      parent_id: null,
      system: true,
      created_at: now,
      updated_at: now,
    },
    {
      owner_user_id: ownerUserId,
      name: "完了",
      description: "",
      color: "#4caf50",
      parent_id: null,
      system: true,
      created_at: now,
      updated_at: now,
    },
  ];
}

export class PostgresProjectRepository {
  async listByOwner(ownerUserId: string): Promise<ProjectRecord[]> {
    const sql = getDbClient();
    const rows = await sql<ProjectRow[]>`
      select id, owner_user_id, name, description, color, parent_id, system, version, created_at, updated_at
      from projects
      where owner_user_id = ${ownerUserId}
      order by created_at asc, id asc
    `;

    return rows.map(mapProjectRow);
  }

  async findById(ownerUserId: string, projectId: string): Promise<ProjectRecord | null> {
    const sql = getDbClient();
    const [row] = await sql<ProjectRow[]>`
      select id, owner_user_id, name, description, color, parent_id, system, version, created_at, updated_at
      from projects
      where owner_user_id = ${ownerUserId}
        and id = ${projectId}
      limit 1
    `;

    return row ? mapProjectRow(row) : null;
  }

  async create(input: CreateProjectRecordInput): Promise<ProjectRecord> {
    const sql = getDbClient();
    const [row] = await sql<ProjectRow[]>`
      insert into projects (
        id,
        owner_user_id,
        name,
        description,
        color,
        parent_id,
        system,
        created_at,
        updated_at
      )
      values (
        ${input.id},
        ${input.owner_user_id},
        ${input.name},
        ${input.description},
        ${input.color},
        ${input.parent_id},
        ${input.system},
        ${input.created_at},
        ${input.updated_at}
      )
      returning id, owner_user_id, name, description, color, parent_id, system, version, created_at, updated_at
    `;

    return mapProjectRow(row);
  }

  async update(input: UpdateProjectRecordInput): Promise<ProjectRecord> {
    const sql = getDbClient();
    const name = input.name ?? null;
    const description = input.description ?? null;
    const color = input.color ?? null;
    const system = input.system ?? null;
    let rows: ProjectRow[];

    if (input.parent_id === undefined) {
      if (input.expectedVersion === undefined) {
        rows = await sql<ProjectRow[]>`
          update projects
          set
            name = coalesce(${name}, name),
            description = coalesce(${description}, description),
            color = coalesce(${color}, color),
            system = coalesce(${system}, system),
            version = version + 1,
            updated_at = ${input.updated_at}
          where owner_user_id = ${input.owner_user_id}
            and id = ${input.id}
          returning id, owner_user_id, name, description, color, parent_id, system, version, created_at, updated_at
        `;
      } else {
        rows = await sql<ProjectRow[]>`
          update projects
          set
            name = coalesce(${name}, name),
            description = coalesce(${description}, description),
            color = coalesce(${color}, color),
            system = coalesce(${system}, system),
            version = version + 1,
            updated_at = ${input.updated_at}
          where owner_user_id = ${input.owner_user_id}
            and id = ${input.id}
            and version = ${input.expectedVersion}
          returning id, owner_user_id, name, description, color, parent_id, system, version, created_at, updated_at
        `;
      }
    } else if (input.expectedVersion === undefined) {
      rows = await sql<ProjectRow[]>`
        update projects
        set
          name = coalesce(${name}, name),
          description = coalesce(${description}, description),
          color = coalesce(${color}, color),
          parent_id = ${input.parent_id},
          system = coalesce(${system}, system),
          version = version + 1,
          updated_at = ${input.updated_at}
        where owner_user_id = ${input.owner_user_id}
          and id = ${input.id}
        returning id, owner_user_id, name, description, color, parent_id, system, version, created_at, updated_at
      `;
    } else {
      rows = await sql<ProjectRow[]>`
        update projects
        set
          name = coalesce(${name}, name),
          description = coalesce(${description}, description),
          color = coalesce(${color}, color),
          parent_id = ${input.parent_id},
          system = coalesce(${system}, system),
          version = version + 1,
          updated_at = ${input.updated_at}
        where owner_user_id = ${input.owner_user_id}
          and id = ${input.id}
          and version = ${input.expectedVersion}
        returning id, owner_user_id, name, description, color, parent_id, system, version, created_at, updated_at
      `;
    }

    const [row] = rows;

    if (!row) {
      throw new Error("Project not found or version conflict");
    }

    return mapProjectRow(row);
  }

  async deleteMany(ownerUserId: string, projectIds: string[]): Promise<string[]> {
    if (projectIds.length === 0) {
      return [];
    }

    const sql = getDbClient();
    const rows = await sql<{ id: string }[]>`
      delete from projects
      where owner_user_id = ${ownerUserId}
        and id in ${sql(projectIds)}
      returning id
    `;

    return rows.map((row) => row.id);
  }

  async ensureSystemProjects(ownerUserId: string, now = new Date().toISOString()): Promise<ProjectRecord[]> {
    const sql = getDbClient();
    const seeds = createSystemProjectSeeds(ownerUserId, now);
    const rows = await sql.begin(async (transaction) => {
      const insertedOrExisting: ProjectRow[] = [];
      const existingRows = await transaction<ProjectRow[]>`
        select id, owner_user_id, name, description, color, parent_id, system, version, created_at, updated_at
        from projects
        where owner_user_id = ${ownerUserId}
          and system = true
          and name in ${transaction(seeds.map((seed) => seed.name))}
      `;

      for (const seed of seeds) {
        const existing = existingRows.find((row) => row.name === seed.name);

        if (existing) {
          insertedOrExisting.push(existing);
          continue;
        }

        const [row] = await transaction<ProjectRow[]>`
          insert into projects (
            id,
            owner_user_id,
            name,
            description,
            color,
            parent_id,
            system,
            created_at,
            updated_at
          )
          values (
            ${randomUUID()},
            ${seed.owner_user_id},
            ${seed.name},
            ${seed.description},
            ${seed.color},
            ${seed.parent_id},
            ${seed.system},
            ${seed.created_at},
            ${seed.updated_at}
          )
          returning id, owner_user_id, name, description, color, parent_id, system, version, created_at, updated_at
        `;

        insertedOrExisting.push(row);
      }

      return insertedOrExisting;
    });

    return rows.map(mapProjectRow);
  }
}
