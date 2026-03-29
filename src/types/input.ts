export type CreateTaskInput = {
  title: string;
  description?: string | null;
  due_date?: string | null;
  priority?: number | null;
  project_id?: string | null;
  tag_ids?: string[];
};

export type UpdateTaskInput = Partial<CreateTaskInput> & {
  status?: "todo" | "done";
};

export type MoveTaskInput = {
  destination_project_id: string;
};

export type CreateProjectInput = {
  name: string;
  color: string;
  parent_id?: string | null;
};

export type UpdateProjectInput = Partial<CreateProjectInput>;

export type CreateTagInput = {
  name: string;
  description?: string;
};

export type UpdateTagInput = Partial<CreateTagInput>;

export type CreateViewInput = {
  name: string;
  filters: {
    due?: "today" | "overdue" | "any" | "none";
    project_ids: string[];
    tag_ids: string[];
    include_project_descendants?: boolean;
    query?: string;
  };
  sort: {
    active_key: "project" | "subject" | "due" | "priority";
    directions: {
      project: "asc" | "desc";
      subject: "asc" | "desc";
      due: "asc" | "desc";
      priority: "asc" | "desc";
    };
  };
  display_options: {
    show_completed: boolean;
  };
};

export type UpdateViewInput = Partial<CreateViewInput>;

export type GenerateTestTasksInput = {
  project_id: string;
  tag_ids: string[];
  count: number;
  use_random_tags?: boolean;
};
