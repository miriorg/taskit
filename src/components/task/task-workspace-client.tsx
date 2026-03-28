"use client";

import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { TagCloud } from "@/components/tag";
import { DEFAULT_TASK_LIST_SORT, sortTaskListItems, toggleTaskListSort } from "@/lib/task-list-sort";
import { DONE_PROJECT_ID, INBOX_PROJECT_ID } from "@/lib/utils/system-projects";
import type {
  FileRevisionMap,
  Project,
  ProjectDeleteResponse,
  ProjectMutationResponse,
  ProjectListResponse,
  Tag,
  TagDeleteResponse,
  TagMutationResponse,
  TagListResponse,
  Task,
  TaskDeleteResponse,
  TaskListResponse,
  TaskListSortKey,
  TaskListItemDto,
  TaskMutationResponse,
  View,
  ViewDeleteResponse,
  ViewListResponse,
  ViewMutationResponse,
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

type InlineTagPickerState = {
  target: "create" | "edit";
  top: number;
  left: number;
  focusSignal: number;
  initialQuery: string;
};

type IndentedProject = Project & { depth: number };

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
  const groups: Array<{ projectId: string; projectPath: string; projectColor: string; items: TaskListResponse["items"] }> = [];

  items.forEach((item) => {
    const currentGroup = groups[groups.length - 1];

    if (!currentGroup || currentGroup.projectId !== item.project.id) {
      groups.push({
        projectId: item.project.id,
        projectPath: item.projectPath,
        projectColor: item.project.color,
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

function getIndentedProjects(projects: Project[]): IndentedProject[] {
  const childrenByParent = new Map<string | null, Project[]>();

  projects.forEach((project) => {
    const siblings = childrenByParent.get(project.parent_id) ?? [];
    siblings.push(project);
    childrenByParent.set(project.parent_id, siblings);
  });

  const sortProjects = (items: Project[]) => [...items].sort((left, right) => left.name.localeCompare(right.name));
  const ordered: IndentedProject[] = [];

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

function buildProjectPathFromProjects(projectId: string, projects: Project[]): string {
  const names: string[] = [];
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const visited = new Set<string>();
  let currentId: string | null = projectId;

  while (currentId) {
    if (visited.has(currentId)) {
      break;
    }

    visited.add(currentId);
    const project = projectMap.get(currentId);

    if (!project) {
      names.unshift(currentId);
      break;
    }

    names.unshift(project.name);
    currentId = project.parent_id;
  }

  return names.join("/");
}

function toTaskListItemDto(task: Task, projects: Project[], tags: Tag[]): TaskListItemDto {
  const project = projects.find((candidate) => candidate.id === task.project_id);
  const selectedTags = task.tag_ids
    .map((tagId) => tags.find((tag) => tag.id === tagId))
    .filter((tag): tag is Tag => Boolean(tag))
    .map((tag) => ({ id: tag.id, name: tag.name }));

  return {
    id: task.id,
    title: task.title,
    dueDate: task.due_date,
    priority: task.priority,
    createdAt: task.created_at,
    projectPath: buildProjectPathFromProjects(task.project_id, projects),
    status: task.status,
    project: project ?? {
      id: task.project_id,
      name: task.project_id,
      color: "#808080",
    },
    tags: selectedTags,
  };
}

function refreshTaskListItemMetadata(items: TaskListItemDto[], projects: Project[], tags: Tag[]): TaskListItemDto[] {
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const tagMap = new Map(tags.map((tag) => [tag.id, tag]));

  return items.map((item) => ({
    ...item,
    projectPath: buildProjectPathFromProjects(item.project.id, projects),
    project: projectMap.get(item.project.id) ?? item.project,
    tags: item.tags.map((tag) => tagMap.get(tag.id) ?? tag),
  }));
}

function buildInitialExpandedProjectIds(projects: Project[], selectedProjectIds: string[]): string[] {
  const expanded = new Set<string>();
  const parentById = new Map(projects.map((project) => [project.id, project.parent_id]));

  projects.forEach((project) => {
    if (project.parent_id === null) {
      expanded.add(project.id);
    }
  });

  selectedProjectIds.forEach((projectId) => {
    let parentId = parentById.get(projectId) ?? null;

    while (parentId) {
      expanded.add(parentId);
      parentId = parentById.get(parentId) ?? null;
    }
  });

  return Array.from(expanded);
}

type ViewProjectFilterProps = {
  projects: Project[];
  selectedProjectIds: string[];
  expandedProjectIds: string[];
  onToggleProject: (projectId: string, checked: boolean) => void;
  onToggleExpanded: (projectId: string) => void;
};

function ViewProjectFilter({
  projects,
  selectedProjectIds,
  expandedProjectIds,
  onToggleProject,
  onToggleExpanded,
}: ViewProjectFilterProps) {
  const orderedProjects = getIndentedProjects(projects);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const expandedSet = new Set(expandedProjectIds);
  const selectedSet = new Set(selectedProjectIds);
  const selectedProjects = selectedProjectIds
    .map((projectId) => projectById.get(projectId))
    .filter((project): project is Project => Boolean(project));
  const childrenByParent = new Map<string | null, Project[]>();

  projects.forEach((project) => {
    const children = childrenByParent.get(project.parent_id) ?? [];
    children.push(project);
    childrenByParent.set(project.parent_id, children);
  });

  const isVisible = (project: IndentedProject) => {
    let parentId = project.parent_id;

    while (parentId) {
      if (!expandedSet.has(parentId)) {
        return false;
      }

      parentId = projectById.get(parentId)?.parent_id ?? null;
    }

    return true;
  };

  return (
    <div className="project-filter">
      <ul className="chip-list">
        {selectedProjects.length > 0 ? (
          selectedProjects.map((project) => (
            <li key={project.id} className="chip">
              <span className="chip__label">{project.name}</span>
              <button
                aria-label={`Remove project ${project.name}`}
                className="chip__icon-button"
                title="Remove"
                type="button"
                onClick={() => onToggleProject(project.id, false)}
              >
                <img alt="" aria-hidden="true" className="chip__icon" src="/icons/cross_l.svg" />
              </button>
            </li>
          ))
        ) : (
          <li className="section-caption">No projects selected.</li>
        )}
      </ul>
      <div className="project-filter__tree">
        <div className="project-filter__tree-label">Project tree</div>
        {orderedProjects.filter(isVisible).map((project) => {
          const hasChildren = (childrenByParent.get(project.id)?.length ?? 0) > 0;
          const isExpanded = expandedSet.has(project.id);
          const isSelected = selectedSet.has(project.id);

          return (
            <label
              key={project.id}
              className={isSelected ? "project-filter__tree-row project-filter__tree-row--selected" : "project-filter__tree-row"}
              style={{ paddingLeft: `${12 + project.depth * 18}px` }}
            >
              <div className="project-filter__tree-main">
                {hasChildren ? (
                  <button
                    aria-label={isExpanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
                    className="project-filter__disclosure"
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      onToggleExpanded(project.id);
                    }}
                  >
                    {isExpanded ? "▾" : "▸"}
                  </button>
                ) : (
                  <span aria-hidden="true" className="project-filter__disclosure project-filter__disclosure--placeholder">
                    •
                  </span>
                )}
                <input checked={isSelected} type="checkbox" onChange={(event) => onToggleProject(project.id, event.target.checked)} />
                <span>{project.name}</span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function getCaretPopoverPosition(element: HTMLInputElement | HTMLTextAreaElement) {
  const mirror = document.createElement("div");
  const computed = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const propertiesToCopy = [
    "boxSizing",
    "width",
    "height",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "fontFamily",
    "fontSize",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "letterSpacing",
    "lineHeight",
    "textTransform",
    "textIndent",
    "textAlign",
    "whiteSpace",
    "wordSpacing",
  ] as const;

  mirror.style.position = "fixed";
  mirror.style.left = `${rect.left}px`;
  mirror.style.top = `${rect.top}px`;
  mirror.style.visibility = "hidden";
  mirror.style.overflow = "hidden";
  mirror.style.whiteSpace = element instanceof HTMLTextAreaElement ? "pre-wrap" : "pre";
  mirror.style.wordWrap = "break-word";

  propertiesToCopy.forEach((property) => {
    mirror.style[property] = computed[property];
  });

  if (element instanceof HTMLTextAreaElement) {
    mirror.style.width = `${rect.width}px`;
  }
  mirror.scrollTop = element.scrollTop;
  mirror.scrollLeft = element.scrollLeft;

  const caretIndex = element.selectionStart ?? element.value.length;
  mirror.textContent = element.value.slice(0, caretIndex);

  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const markerRect = marker.getBoundingClientRect();
  document.body.removeChild(mirror);

  return {
    top: Math.min(markerRect.bottom + 8, window.innerHeight - 24),
    left: Math.min(markerRect.left, window.innerWidth - 380),
  };
}

function extractInlineTagTrigger(value: string, caretIndex: number) {
  const beforeCaret = value.slice(0, caretIndex);
  const match = beforeCaret.match(/(^|\s)[#＃]([^\s#＃]*)$/);

  if (!match) {
    return null;
  }

  const query = match[2] ?? "";
  const tokenLength = 1 + query.length;
  const tokenStart = caretIndex - tokenLength;

  return {
    nextValue: value.slice(0, tokenStart) + value.slice(caretIndex),
    query,
  };
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
  const [taskDescription, setTaskDescription] = useState("");
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
  const [projectEditColor, setProjectEditColor] = useState("#ff8080");
  const [parentProjectId, setParentProjectId] = useState("");
  const [subprojectName, setSubprojectName] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [inlineTagPicker, setInlineTagPicker] = useState<InlineTagPickerState | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskListSort, setTaskListSort] = useState<ViewSort>(DEFAULT_TASK_LIST_SORT);
  const [collapsedProjectGroups, setCollapsedProjectGroups] = useState<Record<string, boolean>>({});
  const [isCompletedCollapsed, setIsCompletedCollapsed] = useState(true);
  const [includeChildProjects, setIncludeChildProjects] = useState(Boolean(projectId));
  const [message, setMessage] = useState<UiMessage | null>(null);
  const [pendingActions, setPendingActions] = useState<Record<string, string>>({});
  const [shortcutPrefix, setShortcutPrefix] = useState<string | null>(null);
  const [expandedViewProjectIds, setExpandedViewProjectIds] = useState<string[]>([]);
  const createTaskInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const inlineTagSourceRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const pendingActionKeysRef = useRef(new Set<string>());

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
      setProjectEditColor(currentProject?.color ?? "#ff8080");
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
      setExpandedViewProjectIds(buildInitialExpandedProjectIds(workspace.projects, nextDraft.filters.project_ids));
      return;
    }

    const nextSort = DEFAULT_TASK_LIST_SORT;
    const nextDraft = createDefaultViewDraft(projectId, nextSort);
    setViewDraft(nextDraft);
    setTaskListSort(nextSort);
    setExpandedViewProjectIds(buildInitialExpandedProjectIds(workspace.projects, nextDraft.filters.project_ids));
  }, [projectId, viewId, workspace.currentView, workspace.projects]);

  useEffect(() => {
    if (!viewId || !selectedTask) {
      return;
    }

    if (!workspace.tasks.items.some((task) => task.id === selectedTask.id)) {
      setSelectedTask(null);
    }
  }, [selectedTask, viewId, workspace.tasks.items]);

  useEffect(() => {
    if (inlineTagPicker?.target === "edit" && !selectedTask) {
      setInlineTagPicker(null);
    }
  }, [inlineTagPicker, selectedTask]);

  useEffect(() => {
    if (!inlineTagPicker) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof HTMLElement && target.closest(".inline-tag-picker")) {
        return;
      }

      closeInlineTagPicker();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [inlineTagPicker]);

  const isActionPending = (key: string) => key in pendingActions;

  const executeAction = async <T,>(
    key: string,
    label: string,
    action: () => Promise<T>,
    entityType?: EntityType,
  ): Promise<T | null> => {
    if (pendingActionKeysRef.current.has(key)) {
      return null;
    }

    pendingActionKeysRef.current.add(key);
    setPendingActions((current) => ({ ...current, [key]: label }));

    try {
      return await action();
    } catch (error) {
      setMessage(toUiMessage(error, entityType));
      return null;
    } finally {
      pendingActionKeysRef.current.delete(key);
      setPendingActions((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };

  const runAction = (key: string, label: string, action: () => Promise<void>, entityType?: EntityType) => {
    void executeAction(key, label, action, entityType);
  };

  const createInlineTag = async (name: string) => {
    const response = await executeAction(
      "tag:create:inline",
      "Creating tag...",
      () =>
        readJson<TagMutationResponse>("/api/tags", {
          ...withJsonRevision("tag", { method: "POST" }),
          body: JSON.stringify({ name }),
        }),
      "tag",
    );

    if (!response) {
      throw new Error("Tag creation is already in progress");
    }

    applyTagMutationToWorkspace(response.tag, response.revisions);
    setMessage({ text: `Tag #${response.tag.name} created` });
    return response.tag;
  };

  const setTagIdsForTarget = (target: InlineTagPickerState["target"], tagIds: string[]) => {
    if (target === "edit") {
      setSelectedTask((current) => (current ? { ...current, tag_ids: tagIds } : current));
      return;
    }

    setTaskTagIds(tagIds);
  };

  const currentInlineTagIds =
    inlineTagPicker?.target === "edit" ? selectedTask?.tag_ids ?? [] : taskTagIds;

  const mergeRevisions = (
    currentRevisions: FileRevisionMap,
    incoming: FileRevisionMap,
    options?: { removeKeys?: Array<keyof FileRevisionMap | `task:${string}`> },
  ): FileRevisionMap => {
    const next = { ...currentRevisions, ...incoming };

    options?.removeKeys?.forEach((key) => {
      delete next[key];
    });

    return next;
  };

  const buildTaskListState = (items: TaskListItemDto[], revisions: FileRevisionMap) => {
    const sortedItems = sortTaskListItems(items, taskListSort);

    return {
      items: sortedItems,
      todoItems: sortedItems.filter((item) => item.status !== "done"),
      completedItems: sortedItems.filter((item) => item.status === "done"),
      revisions,
    };
  };

  const matchesCurrentTaskContext = (task: Task, projects: Project[], currentView: View | null): boolean => {
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();

    if (normalizedSearchQuery && !task.title.toLowerCase().includes(normalizedSearchQuery)) {
      return false;
    }

    if (viewId && currentView) {
      const query = currentView.filters.query?.trim().toLowerCase();

      if (query && !task.title.toLowerCase().includes(query)) {
        return false;
      }

      if (currentView.filters.project_ids.length > 0) {
        const allowedProjectIds = currentView.filters.include_project_descendants
          ? new Set(currentView.filters.project_ids.flatMap((id) => collectDescendantIds(projects, id)))
          : new Set(currentView.filters.project_ids);

        if (!allowedProjectIds.has(task.project_id)) {
          return false;
        }
      }

      if (!currentView.filters.tag_ids.every((tagId) => task.tag_ids.includes(tagId))) {
        return false;
      }

      if (!currentView.display_options.show_completed && task.status === "done") {
        return false;
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const startOfTodayIso = startOfToday.toISOString();

      if (currentView.filters.due === "today") {
        return Boolean(task.due_date && task.due_date.slice(0, 10) === startOfTodayIso.slice(0, 10));
      }

      if (currentView.filters.due === "overdue") {
        return Boolean(task.due_date && task.due_date < startOfTodayIso);
      }

      if (currentView.filters.due === "none") {
        return task.due_date === null;
      }

      return true;
    }

    const resolvedProjectId = projectId ?? INBOX_PROJECT_ID;

    if (projectId) {
      if (includeChildProjects) {
        return collectDescendantIds(projects, projectId).includes(task.project_id);
      }

      return task.project_id === projectId;
    }

    return task.project_id === resolvedProjectId;
  };

  const applyTaskMutationToWorkspace = (task: Task, revisions: FileRevisionMap) => {
    setWorkspace((current) => {
      const nextItems = current.tasks.items.filter((item) => item.id !== task.id);

      if (matchesCurrentTaskContext(task, current.projects, current.currentView)) {
        nextItems.push(toTaskListItemDto(task, current.projects, current.tags));
      }

      const nextRevisions = mergeRevisions(current.revisions, revisions);

      return {
        ...current,
        revisions: nextRevisions,
        tasks: buildTaskListState(nextItems, mergeRevisions(current.tasks.revisions, revisions)),
      };
    });
  };

  const applyTaskDeletionToWorkspace = (taskId: string, revisions: FileRevisionMap) => {
    setWorkspace((current) => {
      const nextItems = current.tasks.items.filter((item) => item.id !== taskId);
      const nextRevisions = mergeRevisions(current.revisions, revisions);

      return {
        ...current,
        revisions: nextRevisions,
        tasks: buildTaskListState(nextItems, mergeRevisions(current.tasks.revisions, revisions)),
      };
    });
  };

  const applyProjectMutationToWorkspace = (project: Project, revisions: FileRevisionMap) => {
    setWorkspace((current) => {
      const nextProjects = current.projects.some((candidate) => candidate.id === project.id)
        ? current.projects.map((candidate) => (candidate.id === project.id ? project : candidate))
        : [...current.projects, project];
      const nextItems = refreshTaskListItemMetadata(current.tasks.items, nextProjects, current.tags);
      const nextRevisions = mergeRevisions(current.revisions, revisions);

      return {
        ...current,
        projects: nextProjects,
        revisions: nextRevisions,
        tasks: buildTaskListState(nextItems, mergeRevisions(current.tasks.revisions, revisions)),
      };
    });
  };

  const applyProjectDeletionToWorkspace = (deletedProjectIds: string[], revisions: FileRevisionMap) => {
    setSelectedTask((current) => (current && deletedProjectIds.includes(current.project_id) ? null : current));
    setViewDraft((current) => ({
      ...current,
      filters: {
        ...current.filters,
        project_ids: current.filters.project_ids.filter((projectId) => !deletedProjectIds.includes(projectId)),
      },
    }));
    setWorkspace((current) => {
      const nextProjects = current.projects.filter((project) => !deletedProjectIds.includes(project.id));
      const nextItems = current.tasks.items.filter((item) => !deletedProjectIds.includes(item.project.id));
      const removeKeys = deletedProjectIds.map((id) => `task:${id}` as const);
      const nextRevisions = mergeRevisions(current.revisions, revisions, { removeKeys });

      return {
        ...current,
        projects: nextProjects,
        revisions: nextRevisions,
        tasks: buildTaskListState(nextItems, mergeRevisions(current.tasks.revisions, revisions, { removeKeys })),
      };
    });
  };

  const applyTagMutationToWorkspace = (tag: Tag, revisions: FileRevisionMap) => {
    setWorkspace((current) => {
      const nextTags = current.tags.some((candidate) => candidate.id === tag.id)
        ? current.tags.map((candidate) => (candidate.id === tag.id ? tag : candidate))
        : [...current.tags, tag];
      const nextItems = refreshTaskListItemMetadata(current.tasks.items, current.projects, nextTags);
      const nextCurrentView = current.currentView
        ? {
            ...current.currentView,
            filters: {
              ...current.currentView.filters,
              tag_ids: current.currentView.filters.tag_ids.filter((tagId) => nextTags.some((candidate) => candidate.id === tagId)),
            },
          }
        : null;
      const nextRevisions = mergeRevisions(current.revisions, revisions);

      return {
        ...current,
        tags: nextTags,
        currentView: nextCurrentView,
        revisions: nextRevisions,
        tasks: buildTaskListState(nextItems, mergeRevisions(current.tasks.revisions, revisions)),
      };
    });
  };

  const applyTagDeletionToWorkspace = (deletedTagId: string, revisions: FileRevisionMap) => {
    setTaskTagIds((current) => current.filter((tagId) => tagId !== deletedTagId));
    setSelectedTask((current) => (current ? { ...current, tag_ids: current.tag_ids.filter((tagId) => tagId !== deletedTagId) } : current));
    setViewDraft((current) => ({
      ...current,
      filters: {
        ...current.filters,
        tag_ids: current.filters.tag_ids.filter((tagId) => tagId !== deletedTagId),
      },
    }));
    setWorkspace((current) => {
      const nextTags = current.tags.filter((tag) => tag.id !== deletedTagId);
      const nextItems = current.tasks.items.map((item) => ({
        ...item,
        tags: item.tags.filter((tag) => tag.id !== deletedTagId),
      }));
      const nextCurrentView = current.currentView
        ? {
            ...current.currentView,
            filters: {
              ...current.currentView.filters,
              tag_ids: current.currentView.filters.tag_ids.filter((tagId) => tagId !== deletedTagId),
            },
          }
        : null;
      const nextRevisions = mergeRevisions(current.revisions, revisions);

      return {
        ...current,
        tags: nextTags,
        currentView: nextCurrentView,
        revisions: nextRevisions,
        tasks: buildTaskListState(nextItems, mergeRevisions(current.tasks.revisions, revisions)),
      };
    });
  };

  const applyViewMutationToWorkspace = (view: View, revisions: FileRevisionMap) => {
    setWorkspace((current) => {
      const nextViews = current.views.some((candidate) => candidate.id === view.id)
        ? current.views.map((candidate) => (candidate.id === view.id ? view : candidate))
        : [...current.views, view];
      const nextRevisions = mergeRevisions(current.revisions, revisions);

      return {
        ...current,
        views: nextViews,
        currentView: current.currentView?.id === view.id ? view : current.currentView,
        revisions: nextRevisions,
      };
    });
  };

  const applyViewDeletionToWorkspace = (deletedViewId: string, revisions: FileRevisionMap) => {
    setWorkspace((current) => ({
      ...current,
      views: current.views.filter((view) => view.id !== deletedViewId),
      currentView: current.currentView?.id === deletedViewId ? null : current.currentView,
      revisions: mergeRevisions(current.revisions, revisions),
    }));
  };

  const renderTagSelectionSummary = (tagIds: string[], target: InlineTagPickerState["target"]) => {
    const selectedTags = tagIds
      .map((tagId) => workspace.tags.find((tag) => tag.id === tagId))
      .filter((tag): tag is Tag => Boolean(tag));

    return (
      <div className="inline-tag-summary">
        {selectedTags.length > 0 ? (
          <div className="chip-list inline-tag-summary__chips">
            {selectedTags.map((tag) => (
              <button
                key={tag.id}
                className="tag-cloud__chip"
                type="button"
                onClick={() => setTagIdsForTarget(target, tagIds.filter((tagId) => tagId !== tag.id))}
              >
                <span>{`#${tag.name}`}</span>
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="section-caption">No tags selected.</p>
        )}
        <button
          className="button-secondary"
          type="button"
          onClick={() => {
            inlineTagSourceRef.current = null;
            openInlineTagPicker(target, { top: Math.min(window.innerHeight - 240, 220), left: Math.min(window.innerWidth - 380, 240) });
          }}
        >
          Open tag picker
        </button>
      </div>
    );
  };

  const resetCreateTaskForm = () => {
    setTaskTitle("");
    setTaskDescription("");
    setTaskDueDate("");
    setTaskPriority("");
    setTaskTagIds([]);
    setInlineTagPicker(null);
  };

  const openInlineTagPicker = (
    target: InlineTagPickerState["target"],
    position: Pick<InlineTagPickerState, "top" | "left">,
    initialQuery = "",
  ) => {
    setInlineTagPicker((current) => ({
      target,
      top: position.top,
      left: position.left,
      focusSignal: (current?.focusSignal ?? 0) + 1,
      initialQuery,
    }));
  };

  const closeInlineTagPicker = () => {
    setInlineTagPicker(null);
  };

  const closeInlineTagPickerAndRestoreFocus = () => {
    const source = inlineTagSourceRef.current;
    setInlineTagPicker(null);

    if (!source) {
      return;
    }

    window.setTimeout(() => {
      source.focus();
      const caret = source.selectionStart ?? source.value.length;
      source.setSelectionRange?.(caret, caret);
    }, 0);
  };

  const handleInlineTagShortcut = (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    target: InlineTagPickerState["target"],
  ) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key !== "#" && event.key !== "＃") {
      return;
    }

    event.preventDefault();
    inlineTagSourceRef.current = event.currentTarget;
    const position = getCaretPopoverPosition(event.currentTarget);
    openInlineTagPicker(target, position);
  };

  const handleInlineTagInput = (
    element: HTMLInputElement | HTMLTextAreaElement,
    target: InlineTagPickerState["target"],
    updateValue: (value: string) => void,
  ) => {
    const caretIndex = element.selectionStart ?? element.value.length;
    const trigger = extractInlineTagTrigger(element.value, caretIndex);

    if (!trigger) {
      updateValue(element.value);
      return;
    }

    updateValue(trigger.nextValue);
    inlineTagSourceRef.current = element;
    const position = getCaretPopoverPosition(element);
    openInlineTagPicker(target, position, trigger.query);
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

  const toggleExpandedViewProjectId = (value: string) => {
    setExpandedViewProjectIds((current) =>
      current.includes(value) ? current.filter((projectId) => projectId !== value) : [...current, value],
    );
  };

  const openTaskEditor = (taskId: string) => {
    runAction(`task:open:${taskId}`, "Loading task...", async () => {
      const task = await readJson<Task>(`/api/tasks/${taskId}`);
      setSelectedTask(task);
      setActiveTaskId(taskId);
      setMessage(null);
    }, "task");
  };

  const toggleTaskStatus = (task: TaskListResponse["items"][number]) => {
    runAction(`task:toggle:${task.id}`, task.status === "done" ? "Reopening task..." : "Completing task...", async () => {
      const response = await readJson<TaskMutationResponse>(`/api/tasks/${task.id}`, {
        ...withJsonRevision(`task:${task.project.id}`, { method: "PATCH" }),
        body: JSON.stringify({
          status: task.status === "done" ? "todo" : "done",
        }),
      });
      applyTaskMutationToWorkspace(response.task, response.revisions);
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
  const pendingStatusText = Object.values(pendingActions)[0] ?? null;
  const isProjectCreatePending = isActionPending("project:create");
  const isTagCreatePending = isActionPending("tag:create");
  const isViewCreatePending = isActionPending("view:create");
  const isProjectUpdatePending = projectId ? isActionPending(`project:update:${projectId}`) : false;
  const isProjectDeletePending = projectId ? isActionPending(`project:delete:${projectId}`) : false;
  const isSubprojectCreatePending = projectId ? isActionPending(`project:create-child:${projectId}`) : false;
  const isTaskCreatePending = isActionPending("task:create");
  const isSelectedTaskUpdatePending = selectedTask ? isActionPending(`task:update:${selectedTask.id}`) : false;
  const isViewUpdatePending = workspace.currentView ? isActionPending(`view:update:${workspace.currentView.id}`) : false;
  const isViewDeletePending = workspace.currentView ? isActionPending(`view:delete:${workspace.currentView.id}`) : false;

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
    const isTaskTogglePending = isActionPending(`task:toggle:${task.id}`);
    const isTaskDeletePending = isActionPending(`task:delete:${task.id}`);
    const isTaskOpenPending = isActionPending(`task:open:${task.id}`);

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
            disabled={isTaskTogglePending}
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
            className={`button-secondary task-icon-button${isTaskOpenPending ? " button--busy" : ""}`}
            disabled={isTaskOpenPending}
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
            className={`button-secondary task-icon-button task-icon-button--danger${isTaskDeletePending ? " button--busy" : ""}`}
            disabled={isTaskDeletePending}
            type="button"
            title="Delete"
            onClick={(event) => {
              event.stopPropagation();
              runAction(`task:delete:${task.id}`, "Deleting task...", async () => {
                const response = await readJson<TaskDeleteResponse>(
                  `/api/tasks/${task.id}`,
                  withExpectedRevision(`task:${task.project.id}`, { method: "DELETE" }),
                );
                setSelectedTask((current) => (current?.id === task.id ? null : current));
                applyTaskDeletionToWorkspace(response.deletedTaskId, response.revisions);
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
              <section
                key={group.projectId}
                className="project-group"
                style={{ "--project-group-color": group.projectColor } as CSSProperties}
              >
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
              runAction("project:create", "Creating project...", async () => {
                const response = await readJson<ProjectMutationResponse>("/api/projects", {
                  ...withJsonRevision("project", { method: "POST" }),
                  body: JSON.stringify({
                    name: projectName,
                    color: projectColor,
                  }),
                });
                setProjectName("");
                applyProjectMutationToWorkspace(response.project, response.revisions);
                setMessage({ text: "Project created" });
              }, "project");
            }}
          >
            <input required value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="New project" />
            <label className="color-picker-button" style={{ backgroundColor: projectColor }}>
              <span className="sr-only">Choose project color</span>
              <img alt="" aria-hidden="true" className="task-icon" src="/icons/palette-monochrome.svg" />
              <input className="color-picker-button__input" value={projectColor} onChange={(event) => setProjectColor(event.target.value)} type="color" />
            </label>
            <button className={isProjectCreatePending ? "button--busy" : undefined} disabled={isProjectCreatePending} type="submit">
              {isProjectCreatePending ? "Adding..." : "Add project"}
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
                  className={`chip__icon-button${isActionPending(`tag:delete:${tag.id}`) ? " button--busy" : ""}`}
                  disabled={isActionPending(`tag:delete:${tag.id}`)}
                  title="Delete"
                  type="button"
                  onClick={() =>
                    runAction(`tag:delete:${tag.id}`, "Deleting tag...", async () => {
                      const response = await readJson<TagDeleteResponse>(`/api/tags/${tag.id}`, withExpectedRevision("tag", { method: "DELETE" }));
                      applyTagDeletionToWorkspace(response.deletedTagId, response.revisions);
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
              runAction("tag:create", "Creating tag...", async () => {
                const response = await readJson<TagMutationResponse>("/api/tags", {
                  ...withJsonRevision("tag", { method: "POST" }),
                  body: JSON.stringify({ name: tagName }),
                });
                setTagName("");
                applyTagMutationToWorkspace(response.tag, response.revisions);
                setMessage({ text: "Tag created" });
              }, "tag");
            }}
          >
            <input required value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="New tag" />
            <button className={isTagCreatePending ? "button--busy" : undefined} disabled={isTagCreatePending} type="submit">
              {isTagCreatePending ? "Adding..." : "Add tag"}
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
              runAction("view:create", "Creating view...", async () => {
                const response = await readJson<ViewMutationResponse>("/api/views", {
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
                applyViewMutationToWorkspace(response.view, response.revisions);
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
            <ViewProjectFilter
              projects={workspace.projects}
              selectedProjectIds={viewDraft.filters.project_ids}
              expandedProjectIds={expandedViewProjectIds}
              onToggleProject={toggleViewProjectFilterId}
              onToggleExpanded={toggleExpandedViewProjectId}
            />
            <TagCloud
              tags={workspace.tags}
              selectedTagIds={viewDraft.filters.tag_ids}
              selectedChipVariant="tag"
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
            <button className={isViewCreatePending ? "button--busy" : undefined} disabled={isViewCreatePending || !viewDraft.name.trim()} type="submit">
              {isViewCreatePending ? "Adding..." : "Add view"}
            </button>
          </form>
        </div>
      </aside>

      <main className="workspace__main">
        {pendingStatusText ? (
          <div className="status-banner status-banner--pending" role="status" aria-live="polite">
            <span className="status-banner__spinner" aria-hidden="true" />
            <span>{pendingStatusText}</span>
          </div>
        ) : null}
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
                    runAction(`project:update:${projectId}`, "Saving project...", async () => {
                      const response = await readJson<ProjectMutationResponse>(`/api/projects/${projectId}`, {
                        ...withJsonRevision("project", { method: "PATCH" }),
                        body: JSON.stringify({
                          name: projectRename,
                          color: projectEditColor,
                          parent_id: parentProjectId || null,
                        }),
                      });
                      applyProjectMutationToWorkspace(response.project, response.revisions);
                      setMessage({ text: "Project updated" });
                    }, "project");
                  }}
                >
                  <input value={projectRename} onChange={(event) => setProjectRename(event.target.value)} />
                  <label className="color-picker-button" style={{ backgroundColor: projectEditColor }}>
                    <span className="sr-only">Choose project color</span>
                    <img alt="" aria-hidden="true" className="task-icon" src="/icons/palette-monochrome.svg" />
                    <input
                      className="color-picker-button__input"
                      value={projectEditColor}
                      onChange={(event) => setProjectEditColor(event.target.value)}
                      type="color"
                    />
                  </label>
                  <select value={parentProjectId} onChange={(event) => setParentProjectId(event.target.value)}>
                    <option value="">No parent</option>
                    {availableParentProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <button
                    aria-label="Save project"
                    className={`button-secondary task-icon-button${isProjectUpdatePending ? " button--busy" : ""}`}
                    disabled={isProjectUpdatePending || !projectRename.trim()}
                    title="Save project"
                    type="submit"
                  >
                    <img alt="" aria-hidden="true" className="task-icon" src="/icons/save-monochrome.svg" />
                  </button>
                  <button
                    aria-label="Delete project"
                    className={`button-secondary task-icon-button task-icon-button--danger${isProjectDeletePending ? " button--busy" : ""}`}
                    disabled={isProjectDeletePending}
                    title="Delete project"
                    type="button"
                    onClick={() =>
                      runAction(`project:delete:${projectId}`, "Deleting project...", async () => {
                        const response = await readJson<ProjectDeleteResponse>(
                          `/api/projects/${projectId}`,
                          withExpectedRevision("project", { method: "DELETE" }),
                        );
                        applyProjectDeletionToWorkspace(response.deletedProjectIds, response.revisions);
                        window.location.href = "/inbox";
                      }, "project")
                    }
                  >
                    <img alt="" aria-hidden="true" className="task-icon" src="/icons/trash-monochrome.svg" />
                  </button>
                </form>
                <form
                  className="inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    runAction(`project:create-child:${projectId}`, "Creating subproject...", async () => {
                      const response = await readJson<ProjectMutationResponse>("/api/projects", {
                        ...withJsonRevision("project", { method: "POST" }),
                        body: JSON.stringify({
                          name: subprojectName,
                          color: currentProject.color,
                          parent_id: projectId,
                        }),
                      });
                      setSubprojectName("");
                      applyProjectMutationToWorkspace(response.project, response.revisions);
                      setMessage({ text: "Subproject created" });
                    }, "project");
                  }}
                >
                  <input
                    value={subprojectName}
                    onChange={(event) => setSubprojectName(event.target.value)}
                    placeholder="New subproject"
                  />
                  <button className={isSubprojectCreatePending ? "button--busy" : undefined} disabled={isSubprojectCreatePending || !subprojectName.trim()} type="submit">
                    {isSubprojectCreatePending ? "Adding..." : "Add subproject"}
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
            <button
              aria-label="Search tasks"
              className="button-secondary task-icon-button"
              title="Search tasks"
              type="submit"
            >
              <img alt="" aria-hidden="true" className="task-icon" src="/icons/loupe-monochrome.svg" />
            </button>
            <button
              aria-label="Clear search"
              className="button-secondary task-icon-button"
              disabled={!searchDraft && !searchQuery}
              title="Clear search"
              type="button"
              onClick={() => {
                setSearchDraft("");
                setSearchQuery("");
              }}
            >
              <img alt="" aria-hidden="true" className="task-icon" src="/icons/cross_l.svg" />
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
                runAction("task:create", "Creating task...", async () => {
                  const response = await readJson<TaskMutationResponse>("/api/tasks", {
                    ...withJsonRevision(`task:${projectId ?? INBOX_PROJECT_ID}`, { method: "POST" }),
                    body: JSON.stringify({
                      title: taskTitle,
                      description: taskDescription.trim() || null,
                      due_date: fromDateTimeLocal(taskDueDate),
                      priority: taskPriority === "" ? null : Number(taskPriority),
                      tag_ids: taskTagIds,
                      project_id: projectId ?? INBOX_PROJECT_ID,
                    }),
                  });
                  resetCreateTaskForm();
                  applyTaskMutationToWorkspace(response.task, response.revisions);
                  setMessage({ text: "Task created" });
                }, "task");
              }}
            >
              <input
                required
                ref={createTaskInputRef}
                value={taskTitle}
                onChange={(event) => handleInlineTagInput(event.currentTarget, "create", setTaskTitle)}
                onKeyDown={(event) => handleInlineTagShortcut(event, "create")}
                placeholder="New task"
              />
              <textarea
                rows={3}
                value={taskDescription}
                onChange={(event) => handleInlineTagInput(event.currentTarget, "create", setTaskDescription)}
                onKeyDown={(event) => handleInlineTagShortcut(event, "create")}
                placeholder="New description"
              />
              <div className="field-row">
                <input type="datetime-local" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} />
                <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)}>
                  <option value="">Priority</option>
                  {Array.from({ length: 10 }, (_, value) => (
                    <option key={value} value={value}>
                      P{value}
                    </option>
                  ))}
                </select>
              </div>
              {renderTagSelectionSummary(taskTagIds, "create")}
              <button className={isTaskCreatePending ? "button--busy" : undefined} disabled={isTaskCreatePending || !taskTitle.trim()} type="submit">
                {isTaskCreatePending ? "Adding..." : "Add task"}
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
          <div className="task-list-toolbar">
            <div className="task-summary-bar">
              <span className="task-summary-pill">{`${visibleTaskCount} open`}</span>
              <span className="task-summary-pill">{`${completedTaskCount} completed`}</span>
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
                    {isActive ? (
                      <img
                        alt={activeDirection === "asc" ? "Ascending sort" : "Descending sort"}
                        className="sort-button__active-indicator"
                        src={activeDirection === "asc" ? "/icons/triangle-asc.svg" : "/icons/triangle-dsc.svg"}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
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
                  runAction("workspace:reload", "Reloading latest data...", async () => {
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
                runAction(`task:update:${selectedTask.id}`, "Saving task...", async () => {
                  const response = await readJson<TaskMutationResponse>(`/api/tasks/${selectedTask.id}`, {
                    ...withJsonRevision(`task:${selectedTask.project_id}`, { method: "PATCH" }),
                    body: JSON.stringify({
                      title: selectedTask.title,
                      description: selectedTask.description,
                      due_date: selectedTask.due_date,
                      priority: selectedTask.priority,
                      tag_ids: selectedTask.tag_ids,
                      project_id: selectedTask.project_id,
                    }),
                  });
                  applyTaskMutationToWorkspace(response.task, response.revisions);
                  setSelectedTask(response.task);
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
                onChange={(event) =>
                  handleInlineTagInput(event.currentTarget, "edit", (value) =>
                    setSelectedTask((current) => (current ? { ...current, title: value } : current)),
                  )
                }
                onKeyDown={(event) => handleInlineTagShortcut(event, "edit")}
              />
              <textarea
                rows={4}
                value={selectedTask.description ?? ""}
                onChange={(event) =>
                  handleInlineTagInput(event.currentTarget, "edit", (value) =>
                    setSelectedTask((current) => (current ? { ...current, description: value || null } : current)),
                  )
                }
                onKeyDown={(event) => handleInlineTagShortcut(event, "edit")}
                placeholder="Task description"
              />
              <div className="field-row">
                <input
                  type="datetime-local"
                  value={toDateTimeLocal(selectedTask.due_date)}
                  onChange={(event) =>
                    setSelectedTask((current) => (current ? { ...current, due_date: fromDateTimeLocal(event.target.value) } : current))
                  }
                />
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
              </div>
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
              {renderTagSelectionSummary(selectedTask.tag_ids, "edit")}
              <button className={isSelectedTaskUpdatePending ? "button--busy" : undefined} disabled={isSelectedTaskUpdatePending || !selectedTask.title.trim()} type="submit">
                {isSelectedTaskUpdatePending ? "Saving..." : "Save task"}
              </button>
            </form>
          ) : viewId ? (
            workspace.currentView ? (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  runAction(`view:update:${workspace.currentView?.id}`, "Saving view...", async () => {
                    const response = await readJson<ViewMutationResponse>(`/api/views/${workspace.currentView?.id}`, {
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
                    applyViewMutationToWorkspace(response.view, response.revisions);
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
                <ViewProjectFilter
                  projects={workspace.projects}
                  selectedProjectIds={viewDraft.filters.project_ids}
                  expandedProjectIds={expandedViewProjectIds}
                  onToggleProject={toggleViewProjectFilterId}
                  onToggleExpanded={toggleExpandedViewProjectId}
                />
                <TagCloud
                  tags={workspace.tags}
                  selectedTagIds={viewDraft.filters.tag_ids}
                  selectedChipVariant="tag"
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
                  <button className={isViewUpdatePending ? "button--busy" : undefined} disabled={isViewUpdatePending || !viewDraft.name.trim()} type="submit">
                    {isViewUpdatePending ? "Saving..." : "Save view"}
                  </button>
                  <button
                    className={`button-secondary${isViewDeletePending ? " button--busy" : ""}`}
                    disabled={isViewDeletePending}
                    type="button"
                    onClick={() =>
                      runAction(`view:delete:${workspace.currentView?.id}`, "Deleting view...", async () => {
                        const response = await readJson<ViewDeleteResponse>(
                          `/api/views/${workspace.currentView?.id}`,
                          withExpectedRevision("view", { method: "DELETE" }),
                        );
                        applyViewDeletionToWorkspace(response.deletedViewId, response.revisions);
                        window.location.href = "/inbox";
                      }, "view")
                    }
                  >
                    {isViewDeletePending ? "Deleting..." : "Delete view"}
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
      {inlineTagPicker ? (
        <div
          className="inline-tag-picker"
          style={{
            top: `${inlineTagPicker.top}px`,
            left: `${inlineTagPicker.left}px`,
          }}
        >
          <TagCloud
            tags={workspace.tags}
            selectedTagIds={currentInlineTagIds}
            onChange={(tagIds) => setTagIdsForTarget(inlineTagPicker.target, tagIds)}
            inputPlaceholder="Add tags"
            onCreateTag={createInlineTag}
            focusSignal={inlineTagPicker.focusSignal}
            initialQuery={inlineTagPicker.initialQuery}
            onRequestClose={closeInlineTagPickerAndRestoreFocus}
            onTagCommitted={closeInlineTagPickerAndRestoreFocus}
          />
        </div>
      ) : null}
    </div>
  );
}
