import { getDbClient } from "@/lib/db/client";
import type { View } from "@/types";

type ViewRow = {
  id: string;
  owner_user_id: string;
  name: string;
  version: number;
  created_at: string;
  updated_at: string;
};

type ViewFilterRow = {
  view_id: string;
  due: View["filters"]["due"] | null;
  include_project_descendants: boolean;
  query: string | null;
};

type ViewFilterProjectRow = {
  view_id: string;
  project_id: string;
};

type ViewFilterTagRow = {
  view_id: string;
  tag_id: string;
};

type ViewSortRow = {
  view_id: string;
  active_key: View["sort"]["active_key"];
  project_direction: View["sort"]["directions"]["project"];
  subject_direction: View["sort"]["directions"]["subject"];
  due_direction: View["sort"]["directions"]["due"];
  priority_direction: View["sort"]["directions"]["priority"];
};

type ViewDisplayOptionsRow = {
  view_id: string;
  show_completed: boolean;
};

export type ViewRecord = View & {
  owner_user_id: string;
  version: number;
};

export type CreateViewRecordInput = {
  id: string;
  owner_user_id: string;
  name: string;
  filters: View["filters"];
  sort: View["sort"];
  display_options: View["display_options"];
  created_at: string;
  updated_at: string;
};

export type UpdateViewRecordInput = {
  id: string;
  owner_user_id: string;
  name?: string;
  filters?: View["filters"];
  sort?: View["sort"];
  display_options?: View["display_options"];
  updated_at: string;
  expectedVersion?: number;
};

function buildViewRecords(
  viewRows: ViewRow[],
  filterRows: ViewFilterRow[],
  filterProjectRows: ViewFilterProjectRow[],
  filterTagRows: ViewFilterTagRow[],
  sortRows: ViewSortRow[],
  displayOptionRows: ViewDisplayOptionsRow[],
): ViewRecord[] {
  const filterRowByViewId = new Map(filterRows.map((row) => [row.view_id, row]));
  const sortRowByViewId = new Map(sortRows.map((row) => [row.view_id, row]));
  const displayOptionRowByViewId = new Map(displayOptionRows.map((row) => [row.view_id, row]));
  const projectIdsByViewId = new Map<string, string[]>();
  const tagIdsByViewId = new Map<string, string[]>();

  for (const row of filterProjectRows) {
    const projectIds = projectIdsByViewId.get(row.view_id) ?? [];
    projectIds.push(row.project_id);
    projectIdsByViewId.set(row.view_id, projectIds);
  }

  for (const row of filterTagRows) {
    const tagIds = tagIdsByViewId.get(row.view_id) ?? [];
    tagIds.push(row.tag_id);
    tagIdsByViewId.set(row.view_id, tagIds);
  }

  return viewRows.map((row) => {
    const filterRow = filterRowByViewId.get(row.id);
    const sortRow = sortRowByViewId.get(row.id);
    const displayOptionsRow = displayOptionRowByViewId.get(row.id);

    if (!filterRow || !sortRow || !displayOptionsRow) {
      throw new Error(`View aggregate is incomplete for ${row.id}`);
    }

    return {
      id: row.id,
      owner_user_id: row.owner_user_id,
      name: row.name,
      filters: {
        due: filterRow.due ?? undefined,
        project_ids: projectIdsByViewId.get(row.id) ?? [],
        tag_ids: tagIdsByViewId.get(row.id) ?? [],
        include_project_descendants: filterRow.include_project_descendants,
        query: filterRow.query ?? undefined,
      },
      sort: {
        active_key: sortRow.active_key,
        directions: {
          project: sortRow.project_direction,
          subject: sortRow.subject_direction,
          due: sortRow.due_direction,
          priority: sortRow.priority_direction,
        },
      },
      display_options: {
        show_completed: displayOptionsRow.show_completed,
      },
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

export class PostgresViewRepository {
  private async attachRelations(viewRows: ViewRow[]): Promise<ViewRecord[]> {
    if (viewRows.length === 0) {
      return [];
    }

    const sql = getDbClient();
    const viewIds = viewRows.map((row) => row.id);
    const [filterRows, filterProjectRows, filterTagRows, sortRows, displayOptionsRows] = await Promise.all([
      sql<ViewFilterRow[]>`
        select view_id, due, include_project_descendants, query
        from view_filters
        where view_id in ${sql(viewIds)}
      `,
      sql<ViewFilterProjectRow[]>`
        select view_id, project_id
        from view_filter_projects
        where view_id in ${sql(viewIds)}
      `,
      sql<ViewFilterTagRow[]>`
        select view_id, tag_id
        from view_filter_tags
        where view_id in ${sql(viewIds)}
      `,
      sql<ViewSortRow[]>`
        select view_id, active_key, project_direction, subject_direction, due_direction, priority_direction
        from view_sorts
        where view_id in ${sql(viewIds)}
      `,
      sql<ViewDisplayOptionsRow[]>`
        select view_id, show_completed
        from view_display_options
        where view_id in ${sql(viewIds)}
      `,
    ]);

    return buildViewRecords(viewRows, filterRows, filterProjectRows, filterTagRows, sortRows, displayOptionsRows);
  }

  async listByOwner(ownerUserId: string): Promise<ViewRecord[]> {
    const sql = getDbClient();
    const rows = await sql<ViewRow[]>`
      select id, owner_user_id, name, version, created_at, updated_at
      from views
      where owner_user_id = ${ownerUserId}
      order by created_at asc, id asc
    `;

    return this.attachRelations(rows);
  }

  async findById(ownerUserId: string, viewId: string): Promise<ViewRecord | null> {
    const sql = getDbClient();
    const rows = await sql<ViewRow[]>`
      select id, owner_user_id, name, version, created_at, updated_at
      from views
      where owner_user_id = ${ownerUserId}
        and id = ${viewId}
      limit 1
    `;

    const [view] = await this.attachRelations(rows);
    return view ?? null;
  }

  async create(input: CreateViewRecordInput): Promise<ViewRecord> {
    const sql = getDbClient();

    return sql.begin(async (transaction) => {
      const [viewRow] = await transaction<ViewRow[]>`
        insert into views (
          id,
          owner_user_id,
          name,
          created_at,
          updated_at
        )
        values (
          ${input.id},
          ${input.owner_user_id},
          ${input.name},
          ${input.created_at},
          ${input.updated_at}
        )
        returning id, owner_user_id, name, version, created_at, updated_at
      `;

      await transaction`
        insert into view_filters (view_id, due, include_project_descendants, query)
        values (
          ${input.id},
          ${input.filters.due ?? null},
          ${input.filters.include_project_descendants ?? false},
          ${input.filters.query ?? null}
        )
      `;

      for (const projectId of input.filters.project_ids) {
        await transaction`
          insert into view_filter_projects (view_id, project_id)
          values (${input.id}, ${projectId})
        `;
      }

      for (const tagId of input.filters.tag_ids) {
        await transaction`
          insert into view_filter_tags (view_id, tag_id)
          values (${input.id}, ${tagId})
        `;
      }

      await transaction`
        insert into view_sorts (
          view_id,
          active_key,
          project_direction,
          subject_direction,
          due_direction,
          priority_direction
        )
        values (
          ${input.id},
          ${input.sort.active_key},
          ${input.sort.directions.project},
          ${input.sort.directions.subject},
          ${input.sort.directions.due},
          ${input.sort.directions.priority}
        )
      `;

      await transaction`
        insert into view_display_options (view_id, show_completed)
        values (${input.id}, ${input.display_options.show_completed})
      `;

      return {
        id: viewRow.id,
        owner_user_id: viewRow.owner_user_id,
        name: viewRow.name,
        filters: input.filters,
        sort: input.sort,
        display_options: input.display_options,
        version: viewRow.version,
        created_at: viewRow.created_at,
        updated_at: viewRow.updated_at,
      };
    });
  }

  async update(input: UpdateViewRecordInput): Promise<ViewRecord> {
    const sql = getDbClient();
    const name = input.name ?? null;
    const rows = input.expectedVersion === undefined
      ? await sql<ViewRow[]>`
          update views
          set
            name = coalesce(${name}, name),
            version = version + 1,
            updated_at = ${input.updated_at}
          where owner_user_id = ${input.owner_user_id}
            and id = ${input.id}
          returning id, owner_user_id, name, version, created_at, updated_at
        `
      : await sql<ViewRow[]>`
          update views
          set
            name = coalesce(${name}, name),
            version = version + 1,
            updated_at = ${input.updated_at}
          where owner_user_id = ${input.owner_user_id}
            and id = ${input.id}
            and version = ${input.expectedVersion}
          returning id, owner_user_id, name, version, created_at, updated_at
        `;

    const [viewRow] = rows;

    if (!viewRow) {
      throw new Error("View not found or version conflict");
    }

    await sql.begin(async (transaction) => {
      if (input.filters) {
        await transaction`
          update view_filters
          set
            due = ${input.filters.due ?? null},
            include_project_descendants = ${input.filters.include_project_descendants ?? false},
            query = ${input.filters.query ?? null}
          where view_id = ${input.id}
        `;

        await transaction`
          delete from view_filter_projects
          where view_id = ${input.id}
        `;

        for (const projectId of input.filters.project_ids) {
          await transaction`
            insert into view_filter_projects (view_id, project_id)
            values (${input.id}, ${projectId})
          `;
        }

        await transaction`
          delete from view_filter_tags
          where view_id = ${input.id}
        `;

        for (const tagId of input.filters.tag_ids) {
          await transaction`
            insert into view_filter_tags (view_id, tag_id)
            values (${input.id}, ${tagId})
          `;
        }
      }

      if (input.sort) {
        await transaction`
          update view_sorts
          set
            active_key = ${input.sort.active_key},
            project_direction = ${input.sort.directions.project},
            subject_direction = ${input.sort.directions.subject},
            due_direction = ${input.sort.directions.due},
            priority_direction = ${input.sort.directions.priority}
          where view_id = ${input.id}
        `;
      }

      if (input.display_options) {
        await transaction`
          update view_display_options
          set
            show_completed = ${input.display_options.show_completed}
          where view_id = ${input.id}
        `;
      }
    });

    const updatedView = await this.findById(input.owner_user_id, input.id);

    if (!updatedView) {
      throw new Error("View not found");
    }

    return updatedView;
  }

  async delete(ownerUserId: string, viewId: string): Promise<boolean> {
    const sql = getDbClient();
    const rows = await sql<{ id: string }[]>`
      delete from views
      where owner_user_id = ${ownerUserId}
        and id = ${viewId}
      returning id
    `;

    return rows.length > 0;
  }
}
