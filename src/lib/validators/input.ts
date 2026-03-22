import { z } from "zod";

const isoDateOrNullSchema = z.string().datetime({ offset: true }).nullable();

export const createTaskInputSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  due_date: isoDateOrNullSchema.optional(),
  priority: z.number().int().min(0).max(9).nullable().optional(),
  project_id: z.string().min(1).nullable().optional(),
  tag_ids: z.array(z.string().min(1)).optional(),
});

export const updateTaskInputSchema = createTaskInputSchema
  .partial()
  .extend({
    status: z.enum(["todo", "done"]).optional(),
  });

export const moveTaskInputSchema = z.object({
  destination_project_id: z.string().min(1),
});

export const createProjectInputSchema = z.object({
  name: z.string().trim().min(1),
  color: z.string().trim().min(1),
  parent_id: z.string().min(1).nullable().optional(),
});

export const updateProjectInputSchema = createProjectInputSchema.partial();

export const createTagInputSchema = z.object({
  name: z.string().trim().min(1),
});

export const updateTagInputSchema = createTagInputSchema.partial();

export const createViewInputSchema = z.object({
  name: z.string().trim().min(1),
  filters: z.object({
    due: z.enum(["today", "overdue", "any", "none"]).optional(),
    project_ids: z.array(z.string().min(1)),
    tag_ids: z.array(z.string().min(1)),
    include_project_descendants: z.boolean().optional(),
    query: z.string().trim().optional(),
  }),
  sort: z.object({
    field: z.enum(["due_date", "created_at", "updated_at", "priority", "title"]),
    direction: z.enum(["asc", "desc"]),
  }),
  display_options: z.object({
    show_completed: z.boolean(),
  }),
});

export const updateViewInputSchema = createViewInputSchema.partial();

export const generateTestTasksInputSchema = z.object({
  project_id: z.string().min(1),
  tag_ids: z.array(z.string().min(1)).max(20),
  count: z.number().int().min(1).max(100),
});
