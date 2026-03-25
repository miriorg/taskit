"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { TagCloud } from "@/components/tag";
import { DEFAULT_TASK_LIST_SORT, sortTaskListItems, toggleTaskListSort } from "@/lib/task-list-sort";
import { DONE_PROJECT_ID, INBOX_PROJECT_ID } from "@/lib/utils/system-projects";
import type {
  FileRevisionMap,
  Project,
  ProjectListResponse,
  Tag,
  TagListResponse,
  Task,
  TaskListResponse,
  TaskListSortKey,
  View,
  ViewListResponse,
  ViewSort,
} from "@/types";

type WorkspaceState = {
  projects: Project[];
  tags: Tag[];
  views: View[];
  tasks: TaskListResponse;
  currentView: View | null;
  revisions: FileRevisionMap;
};

const emptyTaskListResponse: TaskListResponse = {
  items: [],
  todoItems: [],
  completedItems: [],
  revisions: {},
};

type ViewDraft = {
  name: string;
  filters: {
    due: "today" | "overdue" | "any" | "none";
    project_ids: string[];
    tag_ids: string[];
    include_project_descendants: boolean;
    query: string;
  };
  sort: ViewSort;
  display_options: {
    show_completed: boolean;
  };
};

type EntityType = "task" | "project" | "view" | "tag";

type UiMessage = {
  text: string;
  isConflict?: boolean;
};

class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const SORT_BUTTONS: Array<{ key: TaskListSortKey; label: string }> = [
  { key: "project", label: "Project" },
  { key: "subject", label: "Subject" },
  { key: "due", label: "Due" },
  { key: "priority", label: "Priority" },
];

const compactDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const compactDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

function formatSortSummary(sort: ViewSort): string {
  const active = SORT_BUTTONS.find((item) => item.key === sort.active_key);
  const direction = sort.directions[sort.active_key] === "asc" ? "Asc" : "Desc";
  return `${active?.label ?? "Due"} ${direction}`;
}
function createDefaultViewDraft(projectId?: string, sort: ViewSort = DEFAULT_TASK_LIST_SORT): ViewDraft {
  return {
    name: "",
    filters: {
      due: "any",
      project_ids: projectId ? [projectId] : [],
      tag_ids: [],
      include_project_descendants: Boolean(projectId),
      query: "",
    },
    sort,
    display_options: {
      show_completed: false,
    },
  };
}

function createViewDraftFromView(view: View): ViewDraft {
  return {
    name: view.name,
    filters: {
      due: view.filters.due ?? "any",
      project_ids: view.filters.project_ids,
      tag_ids: view.filters.tag_ids,
      include_project_descendants: view.filters.include_project_descendants ?? false,
      query: view.filters.query ?? "",
    },
    sort: view.sort,
    display_options: {
      show_completed: view.display_options.show_completed,
    },
  };
}

function renderTriangleIcon(src: string, alt: string) {
  return <img alt={alt} className="inline-triangle-icon" src={src} />;
}

function formatTaskDueLabel(dueDate: string | null): string | null {
  if (!dueDate) {
    return null;
  }

  return compactDateTimeFormatter.format(new Date(dueDate));
}

function getDueTone(dueDate: string | null): "normal" | "today" | "overdue" {
  if (!dueDate) {
    return "normal";
  }

  const now = new Date();
  const due = new Date(dueDate);
  const todayKey = compactDateFormatter.format(now);
  const dueKey = compactDateFormatter.format(due);

  if (due.getTime() < now.getTime()) {
    return dueKey === todayKey ? "today" : "overdue";
  }

  return dueKey === todayKey ? "today" : "normal";
}

function groupTasksByProject(items: TaskListResponse["items"]) {
  const groups: Array<{ projectId: string; projectPath: string; items: TaskListResponse["items"] }> = [];

  items.forEach((item) => {
    const currentGroup = groups[groups.length - 1];

    if (!currentGroup || currentGroup.projectId !== item.project.id) {
      groups.push({
        projectId: item.project.id,
        projectPath: item.projectPath,
        items: [item],
      });
      return;
    }

    currentGroup.items.push(item);
  });

  return groups;
}

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
    throw new ApiClientError(body?.error?.message ?? `Request failed: ${response.status}`, body?.error?.code, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function buildConflictMessage(entityType: EntityType): string {
  switch (entityType) {
    case "task":
      return "このタスクは他の画面で更新されたため保存できませんでした。最新データを読み込んでから再度保存してください。";
    case "project":
      return "このプロジェクトは他の画面で更新されたため保存できませんでした。最新データを読み込んでから再度お試しください。";
    case "view":
      return "この保存ビューは他の画面で更新されたため保存できませんでした。最新データを読み込んでから再度保存してください。";
    case "tag":
      return "タグ一覧が他の画面で更新されたため保存できませんでした。最新データを読み込んでから再度お試しください。";
  }
}

function toUiMessage(error: unknown, entityType?: EntityType): UiMessage {
  if (error instanceof ApiClientError && (error.code === "conflict" || error.status === 409) && entityType) {
    return {
      text: buildConflictMessage(entityType),
      isConflict: true,
    };
  }

  return {
    text: error instanceof Error ? error.message : "Unexpected error",
  };
}

function toDateTimeLocal(isoValue: string | null | undefined): string {
  if (!isoValue) {
    return "";
  }

  return isoValue.slice(0, 16);
}

function fromDateTimeLocal(localValue: string): string | null {
  if (!localValue) {
    return null;
  }

  return new Date(localValue).toISOString();
}

function getIndentedProjects(projects: Project[]): Array<Project & { depth: number }> {
  const childrenByParent = new Map<string | null, Project[]>();

  projects.forEach((project) => {
    const siblings = childrenByParent.get(project.parent_id) ?? [];
    siblings.push(project);
    childrenByParent.set(project.parent_id, siblings);
  });

  const sortProjects = (items: Project[]) => [...items].sort((left, right) => left.name.localeCompare(right.name));
  const ordered: Array<Project & { depth: number }> = [];

  const walk = (parentId: string | null, depth: number) => {
    sortProjects(childrenByParent.get(parentId) ?? []).forEach((project) => {
      ordered.push({ ...project, depth });
      walk(project.id, depth + 1);
    });
  };

  walk(null, 0);
  return ordered;
}

function collectDescendantIds(projects: Project[], rootProjectId: string): string[] {
  const descendants = new Set<string>();
  const stack = [rootProjectId];

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current || descendants.has(current)) {
      continue;
    }

    descendants.add(current);

    projects
      .filter((project) => project.parent_id === current)
      .forEach((project) => stack.push(project.id));
  }

  return Array.from(descendants);
}

function formatProjectLabel(projects: Project[], projectId: string): string {
  const orderedProjects = getIndentedProjects(projects);
  const target = orderedProjects.find((project) => project.id === projectId);

  if (!target) {
    return projectId;
  }

  return `${"  ".repeat(target.depth)}${target.name}`;
}

export function TaskWorkspaceClient({ projectId, viewId }: { projectId?: string; viewId?: string }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceState>({
      projects: [],
      tags: [],
      views: [],
      tasks: emptyTaskListResponse,
      currentView: null,
      revisions: {},
  });
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState("");
  const [taskTagIds, setTaskTagIds] = useState<string[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectColor, setProjectColor] = useState("#ff8080");
  const [tagName, setTagName] = useState("");
  const [viewDraft, setViewDraft] = useState<ViewDraft>(() => createDefaultViewDraft(projectId));
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [projectRename, setProjectRename] = useState("");
  const [parentProjectId, setParentProjectId] = useState("");
  const [subprojectName, setSubprojectName] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskListSort, setTaskListSort] = useState<ViewSort>(DEFAULT_TASK_LIST_SORT);
  const [collapsedProjectGroups, setCollapsedProjectGroups] = useState<Record<string, boolean>>({});
  const [isCompletedCollapsed, setIsCompletedCollapsed] = useState(true);
  const [includeChildProjects, setIncludeChildProjects] = useState(Boolean(projectId));
  const [message, setMessage] = useState<UiMessage | null>(null);
  const [isPending, startTransition] = useTransition();
  const [shortcutPrefix, setShortcutPrefix] = useState<string | null>(null);
  const createTaskInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const withExpectedRevision = (revisionKey: keyof FileRevisionMap | `task:${string}` | undefined, init?: RequestInit): RequestInit => {
    const headers = new Headers(init?.headers);
    const revision = revisionKey ? workspace.revisions[revisionKey] : undefined;

    if (revision) {
      headers.set("X-Taskit-Revision", revision);
    }

    return {
      ...init,
      headers,
    };
  };

  const withJsonRevision = (revisionKey: keyof FileRevisionMap | `task:${string}` | undefined, init?: RequestInit): RequestInit =>
    withExpectedRevision(revisionKey, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : {}),
      },
    });

  const refresh = async () => {
    const resolvedProjectId = projectId ?? INBOX_PROJECT_ID;
    const trimmedSearchQuery = searchQuery.trim();
    const includeProjectDescendants = Boolean(projectId) && includeChildProjects;
    const taskRequest = viewId
      ? readJson<TaskListResponse>(`/api/views/${viewId}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmedSearchQuery || undefined }),
        })
      : trimmedSearchQuery
        ? readJson<TaskListResponse>(`/api/search?${new URLSearchParams({
            query: trimmedSearchQuery,
            projectId: resolvedProjectId,
            includeProjectDescendants: includeProjectDescendants ? "true" : "false",
            includeCompleted: "true",
          }).toString()}`)
        : readJson<TaskListResponse>(`/api/tasks?${new URLSearchParams({
            projectId: resolvedProjectId,
            includeProjectDescendants: includeProjectDescendants ? "true" : "false",
          }).toString()}`);
    const [projects, tags, views, tasks] = await Promise.all([
      readJson<ProjectListResponse>("/api/projects"),
      readJson<TagListResponse>("/api/tags"),
      readJson<ViewListResponse>("/api/views"),
      taskRequest,
    ]);
    const currentView = viewId ? views.views.find((view) => view.id === viewId) ?? null : null;

    setWorkspace({
      projects: projects.projects,
      tags: tags.tags,
      views: views.views,
      tasks,
      currentView,
      revisions: {
        ...projects.revisions,
        ...tags.revisions,
        ...views.revisions,
        ...tasks.revisions,
      },
    });
  };

  useEffect(() => {
    void refresh();
  }, [includeChildProjects, projectId, searchQuery, viewId]);

  useEffect(() => {
    if (projectId) {
      const currentProject = workspace.projects.find((project) => project.id === projectId);
      setProjectRename(currentProject?.name ?? "");
      setParentProjectId(currentProject?.parent_id ?? "");
    }
  }, [projectId, workspace.projects]);

  useEffect(() => {
    setIncludeChildProjects(Boolean(projectId));
  }, [projectId]);

  useEffect(() => {
    if (viewId && workspace.currentView) {
      const nextDraft = createViewDraftFromView(workspace.currentView);
      setViewDraft(nextDraft);
      setTaskListSort(nextDraft.sort);
      return;
    }

    const nextSort = DEFAULT_TASK_LIST_SORT;
    setViewDraft(createDefaultViewDraft(projectId, nextSort));
    setTaskListSort(nextSort);
  }, [projectId, viewId, workspace.currentView]);

  useEffect(() => {
    if (!viewId || !selectedTask) {
      return;
    }

    if (!workspace.tasks.items.some((task) => task.id === selectedTask.id)) {
      setSelectedTask(null);
    }
  }, [selectedTask, viewId, workspace.tasks.items]);

  const run = (action: () => Promise<void>, entityType?: EntityType) => {
    startTransition(() => {
      void action().catch((error: unknown) => {
        setMessage(toUiMessage(error, entityType));
      });
    });
  };

  const resetCreateTaskForm = () => {
    setTaskTitle("");
    setTaskDueDate("");
    setTaskPriority("");
    setTaskTagIds([]);
  };

  const toggleViewProjectFilterId = (value: string, checked: boolean) => {
    setViewDraft((current) => ({
      ...current,
      filters: {
        ...current.filters,
        project_ids: checked
          ? [...current.filters.project_ids, value]
          : current.filters.project_ids.filter((id) => id !== value),
      },
    }));
  };

  const openTaskEditor = (taskId: string) => {
    run(async () => {
      const task = await readJson<Task>(`/api/tasks/${taskId}`);
      setSelectedTask(task);
      setActiveTaskId(taskId);
      setMessage(null);
    }, "task");
  };

  const toggleTaskStatus = (task: TaskListResponse["items"][number]) => {
    run(async () => {
      await readJson(`/api/tasks/${task.id}`, {
        ...withJsonRevision(`task:${task.project.id}`, { method: "PATCH" }),
        body: JSON.stringify({
          status: task.status === "done" ? "todo" : "done",
        }),
      });
      await refresh();
      setMessage({ text: task.status === "done" ? "Task reopened" : "Task updated" });
    }, "task");
  };

  const handleTaskListSortChange = (key: TaskListSortKey) => {
    setTaskListSort((current) => {
      const next = toggleTaskListSort(current, key);
      setViewDraft((draft) => ({
        ...draft,
        sort: next,
      }));
      return next;
    });
  };

  const workspaceLabel = viewId
    ? workspace.currentView?.name ?? "View"
    : projectId
      ? workspace.projects.find((project) => project.id === projectId)?.name ?? "Project"
      : "Inbox";
  const isDoneProjectPage = projectId === DONE_PROJECT_ID;
  const currentProject = projectId ? workspace.projects.find((project) => project.id === projectId) ?? null : null;
  const descendantIds = currentProject ? collectDescendantIds(workspace.projects, currentProject.id) : [];
  const availableParentProjects = workspace.projects
    .filter((project) => project.id !== INBOX_PROJECT_ID && project.id !== DONE_PROJECT_ID)
    .filter((project) => project.id !== currentProject?.id)
    .filter((project) => !descendantIds.includes(project.id))
    .sort((left, right) => left.name.localeCompare(right.name));
  const visibleProjects = getIndentedProjects(workspace.projects).filter((project) => project.id !== INBOX_PROJECT_ID);
  const shouldShowCompletedSection = !projectId;
  const visibleTasks = isDoneProjectPage ? workspace.tasks.completedItems : workspace.tasks.todoItems;
  const sortedVisibleTasks = sortTaskListItems(visibleTasks, taskListSort);
  const sortedCompletedTasks = sortTaskListItems(workspace.tasks.completedItems, taskListSort);
  const visibleTaskGroups = groupTasksByProject(sortedVisibleTasks);
  const completedTaskGroups = groupTasksByProject(sortedCompletedTasks);
  const isProjectOrderActive = taskListSort.active_key === "project";
  const visibleTaskCount = sortedVisibleTasks.length;
  const completedTaskCount = workspace.tasks.completedItems.length;

  useEffect(() => {
    if (sortedVisibleTasks.length === 0) {
      setActiveTaskId(null);
      return;
    }

    if (!activeTaskId || !sortedVisibleTasks.some((task) => task.id === activeTaskId)) {
      setActiveTaskId(sortedVisibleTasks[0]?.id ?? null);
    }
  }, [activeTaskId, sortedVisibleTasks]);

  useEffect(() => {
    if (!shortcutPrefix) {
      return undefined;
    }

    const timer = window.setTimeout(() => setShortcutPrefix(null), 1000);
    return () => window.clearTimeout(timer);
  }, [shortcutPrefix]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tagName = target.tagName.toLowerCase();
      return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (shortcutPrefix === "g") {
        if (event.key === "i") {
          event.preventDefault();
          setShortcutPrefix(null);
          router.push("/inbox");
          return;
        }

        if (event.key === "d") {
          event.preventDefault();
          setShortcutPrefix(null);
          router.push(`/project/${DONE_PROJECT_ID}`);
          return;
        }
      }

      if (isTypingTarget(event.target)) {
        if (event.key === "/" && searchInputRef.current) {
          event.preventDefault();
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }

        return;
      }

      if (event.key === "q" && createTaskInputRef.current) {
        event.preventDefault();
        createTaskInputRef.current.focus();
        createTaskInputRef.current.select();
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === "g") {
        event.preventDefault();
        setShortcutPrefix("g");
        return;
      }

      const activeTask = sortedVisibleTasks.find((task) => task.id === activeTaskId);

      if (event.key === "e" && activeTask) {
        event.preventDefault();
        openTaskEditor(activeTask.id);
        return;
      }

      if (event.key === "x" && activeTask) {
        event.preventDefault();
        toggleTaskStatus(activeTask);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTaskId, router, shortcutPrefix, sortedVisibleTasks]);

  const renderTaskRow = (task: TaskListResponse["items"][number], showProjectLabel: boolean, isCompletedSection = false) => {
    const dueTone = getDueTone(task.dueDate);
    const dueLabel = formatTaskDueLabel(task.dueDate);
    const tagSummary = task.tags.slice(0, 3);
    const remainingTagCount = task.tags.length - tagSummary.length;

    return (
      <li
        key={task.id}
        className={`task-row${task.status === "done" ? " task-row--completed" : ""}${!isCompletedSection && activeTaskId === task.id ? " task-row--active" : ""}`}
        style={{ "--task-project-color": task.project.color } as CSSProperties}
        onClick={() => setActiveTaskId(task.id)}
      >
        <label
          className="task-row__checkbox"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <input
            checked={task.status === "done"}
            className="task-checkbox"
            type="checkbox"
            onChange={() => toggleTaskStatus(task)}
          />
        </label>
        <div className="task-row__main">
          <div className="task-row__title-line">
            <span className="task-project-dot" style={{ backgroundColor: task.project.color }} aria-hidden="true" />
            <span className="task-title-chip">
              <strong className="task-title">{task.title}</strong>
            </span>
            {task.priority !== null ? <span className="task-pill task-pill--priority">{`P${task.priority}`}</span> : null}
            {dueLabel ? (
              <span className={`task-pill task-pill--due task-pill--${dueTone}`}>{dueLabel}</span>
            ) : null}
          </div>
          <div className="task-meta task-meta--dense">
            {showProjectLabel ? <span className="task-meta__project">{task.projectPath}</span> : null}
            {task.tags.length > 0 ? (
              <div className="task-tag-list" aria-label="Task tags">
                {tagSummary.map((tag) => (
                  <span key={tag.id} className="task-tag">
                    #{tag.name}
                  </span>
                ))}
                {remainingTagCount > 0 ? <span className="task-tag task-tag--more">{`+${remainingTagCount}`}</span> : null}
              </div>
            ) : (
              <span className="task-meta__muted">No tags</span>
            )}
          </div>
        </div>
        <div className="task-actions">
          <button
            aria-label="Edit task"
            className="button-secondary task-icon-button"
            type="button"
            title="Edit"
            onClick={(event) => {
              event.stopPropagation();
              openTaskEditor(task.id);
            }}
          >
            <img alt="" aria-hidden="true" className="task-icon" src="/icons/pen-monochrome.svg" />
          </button>
          <button
            aria-label="Delete task"
            className="button-secondary task-icon-button task-icon-button--danger"
            type="button"
            title="Delete"
            onClick={(event) => {
              event.stopPropagation();
              run(async () => {
                await readJson(`/api/tasks/${task.id}`, withExpectedRevision(`task:${task.project.id}`, { method: "DELETE" }));
                setSelectedTask((current) => (current?.id === task.id ? null : current));
                await refresh();
                setMessage({ text: "Task deleted" });
              }, "task");
            }}
          >
            <img alt="" aria-hidden="true" className="task-icon" src="/icons/trash-monochrome.svg" />
          </button>
        </div>
      </li>
    );
  };

  const renderTaskCollection = (items: TaskListResponse["items"], groups: ReturnType<typeof groupTasksByProject>, isCompletedSection = false) => {
    if (isProjectOrderActive) {
      return (
        <div className="project-groups">
          {groups.map((group) => {
            const isCollapsed = collapsedProjectGroups[group.projectId] ?? false;

            return (
              <section key={group.projectId} className="project-group">
                <button
                  className="project-group__toggle"
                  type="button"
                  onClick={() =>
                    setCollapsedProjectGroups((current) => ({
                      ...current,
                      [group.projectId]: !isCollapsed,
                    }))
                  }
                >
                  {renderTriangleIcon(
                    isCollapsed ? "/icons/triangle-close.svg" : "/icons/triangle-open.svg",
                    isCollapsed ? "Collapsed" : "Expanded",
                  )}
                  <span className="project-group__title">{group.projectPath}</span>
                  <span className="project-group__count">{`${group.items.length} tasks`}</span>
                </button>
                {!isCollapsed ? <ul className="task-list">{group.items.map((task) => renderTaskRow(task, false, isCompletedSection))}</ul> : null}
              </section>
            );
          })}
        </div>
      );
    }

    return <ul className="task-list">{items.map((task) => renderTaskRow(task, true, isCompletedSection))}</ul>;
  };

  return (
    <div className="workspace">
      <aside className="workspace__sidebar">
        <div className="panel">
          <h2>Projects</h2>
          <nav className="list">
            <Link href="/inbox">Inbox</Link>
            {visibleProjects.map((project) => (
                <Link key={project.id} href={`/project/${project.id}`} style={{ paddingLeft: `${project.depth * 16}px` }}>
                  {project.name}
                </Link>
              ))}
          </nav>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await readJson("/api/projects", {
                  ...withJsonRevision("project", { method: "POST" }),
                  body: JSON.stringify({
                    name: projectName,
                    color: projectColor,
                  }),
                });
                setProjectName("");
                await refresh();
                setMessage({ text: "Project created" });
              }, "project");
            }}
          >
            <input required value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="New project" />
            <input value={projectColor} onChange={(event) => setProjectColor(event.target.value)} type="color" />
            <button disabled={isPending} type="submit">
              Add project
            </button>
          </form>
        </div>

        <div className="panel">
          <h2>Tags</h2>
          <ul className="chip-list">
            {workspace.tags.map((tag) => (
              <li key={tag.id} className="chip">
                <span className="chip__label">{tag.name}</span>
                <button
                  aria-label={`Delete tag ${tag.name}`}
                  className="chip__icon-button"
                  title="Delete"
                  type="button"
                  onClick={() =>
                    run(async () => {
                      await readJson(`/api/tags/${tag.id}`, withExpectedRevision("tag", { method: "DELETE" }));
                      await refresh();
                      setMessage({ text: "Tag deleted" });
                    }, "tag")
                  }
                >
                  <img alt="" aria-hidden="true" className="chip__icon" src="/icons/cross_l.svg" />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await readJson("/api/tags", {
                  ...withJsonRevision("tag", { method: "POST" }),
                  body: JSON.stringify({ name: tagName }),
                });
                setTagName("");
                await refresh();
                setMessage({ text: "Tag created" });
              }, "tag");
            }}
          >
            <input required value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="New tag" />
            <button disabled={isPending} type="submit">
              Add tag
            </button>
          </form>
        </div>

        <div className="panel">
          <h2>Views</h2>
          <ul className="list">
            {workspace.views.map((view) => (
              <li key={view.id}>
                <Link href={`/view/${view.id}`}>{view.name}</Link>
              </li>
            ))}
          </ul>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await readJson("/api/views", {
                  ...withJsonRevision("view", { method: "POST" }),
                  body: JSON.stringify({
                    name: viewDraft.name,
                    filters: {
                      ...viewDraft.filters,
                      query: viewDraft.filters.query.trim() || undefined,
                    },
                    sort: viewDraft.sort,
                    display_options: viewDraft.display_options,
                  }),
                });
                setViewDraft(createDefaultViewDraft(projectId));
                await refresh();
                setMessage({ text: "View created" });
              }, "view");
            }}
          >
            <input
              required
              value={viewDraft.name}
              onChange={(event) => setViewDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="New view"
            />
            <input
              value={viewDraft.filters.query}
              onChange={(event) =>
                setViewDraft((current) => ({
                  ...current,
                  filters: {
                    ...current.filters,
                    query: event.target.value,
                  },
                }))
              }
              placeholder="Filter by text"
            />
            <select
              value={viewDraft.filters.due}
              onChange={(event) =>
                setViewDraft((current) => ({
                  ...current,
                  filters: {
                    ...current.filters,
                    due: event.target.value as ViewDraft["filters"]["due"],
                  },
                }))
              }
            >
              <option value="any">Any due date</option>
              <option value="today">Due today</option>
              <option value="overdue">Overdue</option>
              <option value="none">No due date</option>
            </select>
            <p className="section-caption">{`Sort: ${formatSortSummary(viewDraft.sort)}`}</p>
            <label className="checkbox-item">
              <input
                checked={viewDraft.display_options.show_completed}
                type="checkbox"
                onChange={(event) =>
                  setViewDraft((current) => ({
                    ...current,
                    display_options: {
                      show_completed: event.target.checked,
                    },
                  }))
                }
              />
              <span>Show completed</span>
            </label>
            <label className="checkbox-item">
              <input
                checked={viewDraft.filters.include_project_descendants}
                type="checkbox"
                onChange={(event) =>
                  setViewDraft((current) => ({
                    ...current,
                    filters: {
                      ...current.filters,
                      include_project_descendants: event.target.checked,
                    },
                  }))
                }
              />
              <span>Include child projects</span>
            </label>
            <div className="checkbox-grid">
              {workspace.projects.map((project) => (
                <label key={project.id} className="checkbox-item">
                  <input
                    checked={viewDraft.filters.project_ids.includes(project.id)}
                    type="checkbox"
                    onChange={(event) => toggleViewProjectFilterId(project.id, event.target.checked)}
                  />
                  <span>{project.name}</span>
                </label>
              ))}
            </div>
            <TagCloud
              tags={workspace.tags}
              selectedTagIds={viewDraft.filters.tag_ids}
              onChange={(tagIds) =>
                setViewDraft((current) => ({
                  ...current,
                  filters: {
                    ...current.filters,
                    tag_ids: tagIds,
                  },
                }))
              }
              inputPlaceholder="Filter tags"
            />
            <button disabled={isPending || !viewDraft.name.trim()} type="submit">
              Add view
            </button>
          </form>
        </div>
      </aside>

      <main className="workspace__main">
        <header className="panel">
          <h1>{viewId ? workspace.currentView?.name ?? "View" : projectId ? "Project" : "Inbox"}</h1>
          {projectId ? (
            !currentProject ? (
              <p>Loading project...</p>
            ) : currentProject.system ? (
              <p>System project settings are fixed.</p>
            ) : (
              <div className="stack">
                <form
                  className="inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run(async () => {
                      await readJson(`/api/projects/${projectId}`, {
                        ...withJsonRevision("project", { method: "PATCH" }),
                        body: JSON.stringify({
                          name: projectRename,
                          parent_id: parentProjectId || null,
                        }),
                      });
                      await refresh();
                      setMessage({ text: "Project updated" });
                    }, "project");
                  }}
                >
                  <input value={projectRename} onChange={(event) => setProjectRename(event.target.value)} />
                  <select value={parentProjectId} onChange={(event) => setParentProjectId(event.target.value)}>
                    <option value="">No parent</option>
                    {availableParentProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <button disabled={isPending || !projectRename.trim()} type="submit">
                    Save project
                  </button>
                  <button
                    disabled={isPending}
                    type="button"
                    onClick={() =>
                      run(async () => {
                        await readJson(`/api/projects/${projectId}`, withExpectedRevision("project", { method: "DELETE" }));
                        window.location.href = "/inbox";
                      }, "project")
                    }
                  >
                    Delete project
                  </button>
                </form>
                <form
                  className="inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run(async () => {
                      await readJson("/api/projects", {
                        ...withJsonRevision("project", { method: "POST" }),
                        body: JSON.stringify({
                          name: subprojectName,
                          color: currentProject.color,
                          parent_id: projectId,
                        }),
                      });
                      setSubprojectName("");
                      await refresh();
                      setMessage({ text: "Subproject created" });
                    }, "project");
                  }}
                >
                  <input
                    value={subprojectName}
                    onChange={(event) => setSubprojectName(event.target.value)}
                    placeholder="New subproject"
                  />
                  <button disabled={isPending || !subprojectName.trim()} type="submit">
                    Add subproject
                  </button>
                </form>
              </div>
            )
          ) : viewId ? (
            <p>Saved view based on your filters.</p>
          ) : (
            <p>Default project for uncategorized tasks.</p>
          )}
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              setSearchQuery(searchDraft.trim());
            }}
          >
            <input
              ref={searchInputRef}
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search tasks"
            />
            <button disabled={isPending} type="submit">
              Search
            </button>
            <button
              disabled={isPending || (!searchDraft && !searchQuery)}
              type="button"
              onClick={() => {
                setSearchDraft("");
                setSearchQuery("");
              }}
            >
              Clear
            </button>
          </form>
          <p className="section-caption">
            Shortcuts: <code>/</code> search, <code>q</code> new task, <code>e</code> edit selected, <code>x</code> complete or
            reopen, <code>g i</code> inbox, <code>g d</code> done.
          </p>
        </header>

        <section className="panel">
          {!isDoneProjectPage ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  await readJson("/api/tasks", {
                    ...withJsonRevision(`task:${projectId ?? INBOX_PROJECT_ID}`, { method: "POST" }),
                    body: JSON.stringify({
                      title: taskTitle,
                      due_date: fromDateTimeLocal(taskDueDate),
                      priority: taskPriority === "" ? null : Number(taskPriority),
                      tag_ids: taskTagIds,
                      project_id: projectId ?? INBOX_PROJECT_ID,
                    }),
                  });
                  resetCreateTaskForm();
                  await refresh();
                  setMessage({ text: "Task created" });
                }, "task");
              }}
            >
              <input required ref={createTaskInputRef} value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="New task" />
              <input type="datetime-local" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} />
              <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)}>
                <option value="">Priority</option>
                {Array.from({ length: 10 }, (_, value) => (
                  <option key={value} value={value}>
                    P{value}
                  </option>
                ))}
              </select>
              <TagCloud
                tags={workspace.tags}
                selectedTagIds={taskTagIds}
                onChange={setTaskTagIds}
                inputPlaceholder="Add tags"
              />
              <button disabled={isPending || !taskTitle.trim()} type="submit">
                Add task
              </button>
            </form>
          ) : (
            <p>完了したタスクの保管先です。ここでは完了タスクのみ表示します。</p>
          )}
        </section>

        <section className="panel">
          {searchQuery ? <p className="section-caption">Search results for "{searchQuery}"</p> : null}

          <h2 className="section-heading">{`▼ ${workspaceLabel}`}</h2>
          {projectId && !currentProject?.system ? (
            <label className="checkbox-item checkbox-item--inline">
              <input checked={includeChildProjects} type="checkbox" onChange={(event) => setIncludeChildProjects(event.target.checked)} />
              <span>子プロジェクトを含める</span>
            </label>
          ) : null}
          <div className="task-summary-bar">
            <span className="task-summary-pill">{`${visibleTaskCount} open`}</span>
            <span className="task-summary-pill">{`${completedTaskCount} completed`}</span>
            <span className="task-summary-pill">{formatSortSummary(taskListSort)}</span>
          </div>
          <div className="sort-bar">
            {SORT_BUTTONS.map((item) => {
              const isActive = taskListSort.active_key === item.key;
              const activeDirection = taskListSort.directions[item.key];

              return (
                <button
                  key={item.key}
                  className={`sort-button${isActive ? " sort-button--active" : " button-secondary"}`}
                  type="button"
                  onClick={() => handleTaskListSortChange(item.key)}
                >
                  <span>{item.label}</span>
                  {isActive ? <span className="sort-button__active-indicator">{activeDirection === "asc" ? "▲" : "▼"}</span> : null}
                </button>
              );
            })}
          </div>
          {renderTaskCollection(sortedVisibleTasks, visibleTaskGroups)}
          {isDoneProjectPage
            ? sortedVisibleTasks.length === 0 ? <p>No completed tasks.</p> : null
            : sortedVisibleTasks.length === 0 ? <p>No open tasks.</p> : null}

          {shouldShowCompletedSection ? (
            <>
              <button
                aria-expanded={!isCompletedCollapsed}
                className="section-toggle"
                type="button"
                onClick={() => setIsCompletedCollapsed((current) => !current)}
              >
                {`${isCompletedCollapsed ? "▶" : "▼"} 完了(${workspace.tasks.completedItems.length}件)`}
              </button>
              {!isCompletedCollapsed ? (
                <>
                  {renderTaskCollection(sortedCompletedTasks, completedTaskGroups, true)}
                  {sortedCompletedTasks.length === 0 ? <p>No completed tasks.</p> : null}
                </>
              ) : null}
            </>
          ) : null}
        </section>

        {message ? (
          <div className="stack">
            <p className="message">{message.text}</p>
            {message.isConflict ? (
              <p className="section-caption">再読み込みすると未保存の変更は失われます。</p>
            ) : null}
            {message.isConflict ? (
              <button
                className="button-secondary button-secondary--conflict"
                type="button"
                onClick={() =>
                  run(async () => {
                    await refresh();
                    setMessage({ text: "Reloaded latest data" });
                  })
                }
              >
                Reload latest data
              </button>
            ) : null}
          </div>
        ) : null}
      </main>

      <section className="workspace__detail">
        <div className="panel">
          <h2>{selectedTask ? "Edit task" : viewId ? workspace.currentView?.name ?? "View" : "Details"}</h2>
          {selectedTask ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  await readJson(`/api/tasks/${selectedTask.id}`, {
                    ...withJsonRevision(`task:${selectedTask.project_id}`, { method: "PATCH" }),
                    body: JSON.stringify({
                      title: selectedTask.title,
                      due_date: selectedTask.due_date,
                      priority: selectedTask.priority,
                      tag_ids: selectedTask.tag_ids,
                      project_id: selectedTask.project_id,
                    }),
                  });
                  await refresh();
                  setMessage({ text: "Task updated" });
                }, "task");
              }}
            >
              {viewId ? (
                <button className="button-secondary" type="button" onClick={() => setSelectedTask(null)}>
                  Back to view settings
                </button>
              ) : null}
              <input
                value={selectedTask.title}
                onChange={(event) => setSelectedTask((current) => (current ? { ...current, title: event.target.value } : current))}
              />
              <input
                type="datetime-local"
                value={toDateTimeLocal(selectedTask.due_date)}
                onChange={(event) =>
                  setSelectedTask((current) => (current ? { ...current, due_date: fromDateTimeLocal(event.target.value) } : current))
                }
              />
              <select
                value={selectedTask.project_id}
                onChange={(event) =>
                  setSelectedTask((current) => (current ? { ...current, project_id: event.target.value } : current))
                }
              >
                {workspace.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {formatProjectLabel(workspace.projects, project.id)}
                  </option>
                ))}
              </select>
              <select
                value={selectedTask.priority ?? ""}
                onChange={(event) =>
                  setSelectedTask((current) =>
                    current
                      ? {
                          ...current,
                          priority: event.target.value === "" ? null : Number(event.target.value),
                        }
                      : current,
                  )
                }
              >
                <option value="">Priority</option>
                {Array.from({ length: 10 }, (_, value) => (
                  <option key={value} value={value}>
                    P{value}
                  </option>
                ))}
              </select>
              <TagCloud
                tags={workspace.tags}
                selectedTagIds={selectedTask.tag_ids}
                onChange={(tagIds) =>
                  setSelectedTask((current) => (current ? { ...current, tag_ids: tagIds } : current))
                }
                inputPlaceholder="Add tags"
              />
              <button disabled={isPending || !selectedTask.title.trim()} type="submit">
                Save task
              </button>
            </form>
          ) : viewId ? (
            workspace.currentView ? (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async () => {
                    await readJson(`/api/views/${workspace.currentView?.id}`, {
                      ...withJsonRevision("view", { method: "PATCH" }),
                      body: JSON.stringify({
                        name: viewDraft.name,
                        filters: {
                          ...viewDraft.filters,
                          query: viewDraft.filters.query.trim() || undefined,
                        },
                        sort: viewDraft.sort,
                        display_options: viewDraft.display_options,
                      }),
                    });
                    await refresh();
                    setMessage({ text: "View updated" });
                  }, "view");
                }}
              >
                <input
                  value={viewDraft.name}
                  onChange={(event) => setViewDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="View name"
                />
                <input
                  value={viewDraft.filters.query}
                  onChange={(event) =>
                    setViewDraft((current) => ({
                      ...current,
                      filters: {
                        ...current.filters,
                        query: event.target.value,
                      },
                    }))
                  }
                  placeholder="Text filter"
                />
                <select
                  value={viewDraft.filters.due}
                  onChange={(event) =>
                    setViewDraft((current) => ({
                      ...current,
                      filters: {
                        ...current.filters,
                        due: event.target.value as ViewDraft["filters"]["due"],
                      },
                    }))
                  }
                >
                  <option value="any">Any due date</option>
                  <option value="today">Due today</option>
                  <option value="overdue">Overdue</option>
                  <option value="none">No due date</option>
                </select>
                <p className="section-caption">{`Sort: ${formatSortSummary(viewDraft.sort)}`}</p>
                <label className="checkbox-item">
                  <input
                    checked={viewDraft.display_options.show_completed}
                    type="checkbox"
                    onChange={(event) =>
                      setViewDraft((current) => ({
                        ...current,
                        display_options: {
                          show_completed: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>Show completed</span>
                </label>
                <label className="checkbox-item">
                  <input
                    checked={viewDraft.filters.include_project_descendants}
                    type="checkbox"
                    onChange={(event) =>
                      setViewDraft((current) => ({
                        ...current,
                        filters: {
                          ...current.filters,
                          include_project_descendants: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>Include child projects</span>
                </label>
                <div className="checkbox-grid">
                  {workspace.projects.map((project) => (
                    <label key={project.id} className="checkbox-item">
                      <input
                        checked={viewDraft.filters.project_ids.includes(project.id)}
                        type="checkbox"
                        onChange={(event) => toggleViewProjectFilterId(project.id, event.target.checked)}
                      />
                      <span>{project.name}</span>
                    </label>
                  ))}
                </div>
                <TagCloud
                  tags={workspace.tags}
                  selectedTagIds={viewDraft.filters.tag_ids}
                  onChange={(tagIds) =>
                    setViewDraft((current) => ({
                      ...current,
                      filters: {
                        ...current.filters,
                        tag_ids: tagIds,
                      },
                    }))
                  }
                  inputPlaceholder="Filter tags"
                />
                <div className="inline-form">
                  <button disabled={isPending || !viewDraft.name.trim()} type="submit">
                    Save view
                  </button>
                  <button
                    className="button-secondary"
                    disabled={isPending}
                    type="button"
                    onClick={() =>
                      run(async () => {
                        await readJson(`/api/views/${workspace.currentView?.id}`, withExpectedRevision("view", { method: "DELETE" }));
                        window.location.href = "/inbox";
                      }, "view")
                    }
                  >
                    Delete view
                  </button>
                </div>
              </form>
            ) : (
              <p>View not found.</p>
            )
          ) : (
            <p>Select a task to edit tags, due date, and priority.</p>
          )}
        </div>
      </section>
    </div>
  );
}
