import styles from "./view-density-preview.module.css";

type ProjectNode = {
  id: string;
  name: string;
  depth: number;
  selected?: boolean;
  count?: number;
  expanded?: boolean;
};

type PreviewPattern = {
  id: string;
  name: string;
  note: string;
  recommendation?: string;
};

const projects: ProjectNode[] = [
  { id: "inbox", name: "Inbox", depth: 0, count: 18 },
  { id: "work", name: "Work", depth: 0, selected: true, count: 42, expanded: true },
  { id: "roadmap", name: "Roadmap", depth: 1, selected: true, count: 12 },
  { id: "launch", name: "Launch Prep", depth: 1, selected: true, count: 8 },
  { id: "ops", name: "Ops", depth: 1, count: 6 },
  { id: "personal", name: "Personal", depth: 0, count: 16, expanded: true },
  { id: "health", name: "Health", depth: 1, count: 5 },
  { id: "writing", name: "Writing", depth: 1, selected: true, count: 7 },
  { id: "archive", name: "Archive", depth: 0, count: 31 },
];

const patterns: PreviewPattern[] = [
  {
    id: "current",
    name: "Current",
    note: "全件チェックボックスをそのまま並べる現状イメージ。見通しは良いが、縦に伸びやすい。",
  },
  {
    id: "selected-first",
    name: "Selected First",
    note: "選択中を上部チップに集約し、一覧は折りたたみ式ツリーにする案。",
    recommendation: "Recommended",
  },
  {
    id: "selected-first-removable",
    name: "Selected First + Clear Chips",
    note: "選択中チップから直接解除できるようにし、一覧は折りたたみツリーで保持する案。",
  },
  {
    id: "scope-picker",
    name: "Scope Picker",
    note: "通常はサマリーだけ見せ、詳細選択はモーダルやドロワーに逃がす案。",
  },
];

function CurrentPattern() {
  return (
    <div className={styles.filterCard}>
      <div className={styles.fieldLabel}>Projects</div>
      <div className={styles.checkboxGrid}>
        {projects.map((project) => (
          <label key={project.id} className={styles.checkboxItem}>
            <input defaultChecked={project.selected} type="checkbox" />
            <span style={{ paddingLeft: `${project.depth * 18}px` }}>{project.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SelectedFirstPattern() {
  const selectedProjects = projects.filter((project) => project.selected);

  return (
    <div className={styles.filterCard}>
      <div className={styles.fieldLabelRow}>
        <span className={styles.fieldLabel}>Projects</span>
        <button className={styles.ghostButton} type="button">
          Edit
        </button>
      </div>
      <div className={styles.selectionSummary}>
        {selectedProjects.map((project) => (
          <span key={project.id} className={styles.summaryChip}>
            {project.name}
          </span>
        ))}
      </div>
      <div className={styles.compactTree}>
        {projects
          .filter((project) => project.depth === 0 || project.depth === 1)
          .map((project) => (
            <label
              key={project.id}
              className={project.selected ? styles.treeRowSelected : styles.treeRow}
              style={{ paddingLeft: `${14 + project.depth * 18}px` }}
            >
              <div className={styles.treeLabel}>
                {project.depth === 0 ? <span className={styles.disclosure}>{project.expanded ? "▾" : "▸"}</span> : null}
                <input defaultChecked={project.selected} type="checkbox" />
                <span>{project.name}</span>
              </div>
              <span className={styles.countBadge}>{project.count}</span>
            </label>
          ))}
      </div>
      <p className={styles.helperText}>通常は3行前後で収まり、必要なときだけ階層を展開します。</p>
    </div>
  );
}

function SelectedFirstRemovablePattern() {
  const selectedProjects = projects.filter((project) => project.selected);

  return (
    <div className={styles.filterCard}>
      <div className={styles.fieldLabelRow}>
        <span className={styles.fieldLabel}>Projects</span>
        <button className={styles.ghostButton} type="button">
          Browse tree
        </button>
      </div>
      <div className={styles.selectionSummary}>
        {selectedProjects.map((project) => (
          <button key={project.id} className={styles.summaryChipButton} type="button">
            <span>{project.name}</span>
            <span className={styles.summaryChipRemove} aria-hidden="true">
              x
            </span>
          </button>
        ))}
      </div>
      <div className={styles.compactTree}>
        <div className={styles.treeSectionLabel}>Project tree</div>
        {projects
          .filter((project) => project.depth === 0 || project.depth === 1)
          .map((project) => (
            <label
              key={project.id}
              className={project.selected ? styles.treeRowSelected : styles.treeRow}
              style={{ paddingLeft: `${14 + project.depth * 18}px` }}
            >
              <div className={styles.treeLabel}>
                {project.depth === 0 ? <span className={styles.disclosure}>{project.expanded ? "▾" : "▸"}</span> : null}
                <input defaultChecked={project.selected} type="checkbox" />
                <span>{project.name}</span>
              </div>
              <span className={styles.countBadge}>{project.count}</span>
            </label>
          ))}
      </div>
      <p className={styles.helperText}>
        チップで即解除、ツリーで追加や階層確認を行う分担です。右ペインではこの案が最も操作密度を下げられます。
      </p>
    </div>
  );
}

function ScopePickerPattern() {
  return (
    <div className={styles.filterCard}>
      <div className={styles.fieldLabel}>Projects</div>
      <div className={styles.scopeRow}>
        <button className={styles.scopeButtonActive} type="button">
          Work
        </button>
        <button className={styles.scopeButton} type="button">
          Personal
        </button>
        <button className={styles.scopeButton} type="button">
          Inbox
        </button>
      </div>
      <button className={styles.pickerTrigger} type="button">
        Select specific projects
        <span className={styles.triggerMeta}>3 selected</span>
      </button>
      <div className={styles.miniPicker}>
        <div className={styles.miniPickerHeader}>
          <strong>Project picker</strong>
          <span className={styles.triggerMeta}>drawer / modal</span>
        </div>
        <div className={styles.searchField}>Search projects...</div>
        <div className={styles.miniPickerList}>
          {projects.filter((project) => project.selected).map((project) => (
            <label key={project.id} className={styles.miniPickerRow}>
              <input defaultChecked type="checkbox" />
              <span>{project.depth === 0 ? project.name : `Work / ${project.name}`}</span>
            </label>
          ))}
        </div>
      </div>
      <p className={styles.helperText}>右ペインの常時表示面積を最小化したい場合に有効です。</p>
    </div>
  );
}

function MockWorkspace({ pattern }: { pattern: PreviewPattern }) {
  return (
    <section className={styles.preview}>
      <header className={styles.previewHeader}>
        <div>
          <div className={styles.eyebrow}>
            <span>{pattern.name}</span>
            {pattern.recommendation ? <span className={styles.recommendation}>{pattern.recommendation}</span> : null}
          </div>
          <h2>{pattern.name}</h2>
          <p>{pattern.note}</p>
        </div>
      </header>
      <div className={styles.mock}>
        <aside className={styles.sidebar}>
          <div className={styles.sidePanel}>
            <div className={styles.panelTitle}>Views</div>
            <ul className={styles.simpleList}>
              <li>Today</li>
              <li>Deep Work</li>
              <li>Weekly Review</li>
            </ul>
          </div>
          <div className={styles.sidePanel}>
            <div className={styles.panelTitle}>Tags</div>
            <div className={styles.tagRow}>
              <span className={styles.tag}>focus</span>
              <span className={styles.tag}>team</span>
              <span className={styles.tag}>high-energy</span>
            </div>
          </div>
        </aside>

        <main className={styles.mainPanel}>
          <div className={styles.workspacePanel}>
            <div className={styles.workspaceHeader}>
              <div>
                <div className={styles.title}>Weekly Review</div>
                <div className={styles.subtitle}>Saved view based on filters and sort order.</div>
              </div>
              <button className={styles.primaryButton} type="button">
                Save view
              </button>
            </div>

            <div className={styles.formStack}>
              <div className={styles.inputMock}>View name</div>
              <div className={styles.inputMock}>Text filter</div>
              <div className={styles.inlineOptions}>
                <span className={styles.optionPill}>Show completed</span>
                <span className={styles.optionPill}>Include child projects</span>
                <span className={styles.optionPill}>Sort: project / due</span>
              </div>
            </div>
          </div>

          <div className={styles.workspacePanel}>
            <div className={styles.taskListHeader}>
              <strong>Previewed tasks</strong>
              <span className={styles.triggerMeta}>12 tasks match</span>
            </div>
            <ul className={styles.taskList}>
              <li className={styles.taskRow}>
                <div>
                  <strong>Prepare roadmap review</strong>
                  <div className={styles.taskMeta}>Work / Roadmap ・ due today ・ #focus</div>
                </div>
                <button className={styles.ghostButton} type="button">
                  Edit
                </button>
              </li>
              <li className={styles.taskRow}>
                <div>
                  <strong>Draft retrospective notes</strong>
                  <div className={styles.taskMeta}>Personal / Writing ・ tomorrow ・ #high-energy</div>
                </div>
                <button className={styles.ghostButton} type="button">
                  Edit
                </button>
              </li>
            </ul>
          </div>
        </main>

        <section className={styles.detailPanel}>
          <div className={styles.workspacePanel}>
            <div className={styles.panelTitle}>View filters</div>
            {pattern.id === "current" ? <CurrentPattern /> : null}
            {pattern.id === "selected-first" ? <SelectedFirstPattern /> : null}
            {pattern.id === "selected-first-removable" ? <SelectedFirstRemovablePattern /> : null}
            {pattern.id === "scope-picker" ? <ScopePickerPattern /> : null}
          </div>
        </section>
      </div>
    </section>
  );
}

export default function ViewDensityPreviewPage() {
  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>View Filter Density Preview</h1>
        <p>View 定義と編集のプロジェクト一覧を、現状と省エリア案で比較するサンプルです。</p>
      </header>
      <section className={styles.recommendationPanel}>
        <h2>Recommendation</h2>
        <p>
          まずは <strong>Selected First + Clear Chips</strong> を本命にするのが妥当です。選択済みプロジェクトを上部チップに寄せ、
          チップから即解除できるようにし、一覧は折りたたみツリーにすると、階層情報は残したまま右ペインの高さをかなり削れます。
        </p>
      </section>
      <div className={styles.grid}>
        {patterns.map((pattern) => (
          <MockWorkspace key={pattern.id} pattern={pattern} />
        ))}
      </div>
    </main>
  );
}
