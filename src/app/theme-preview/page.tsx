import styles from "./theme-preview.module.css";

type ThemePreview = {
  id: string;
  name: string;
  note: string;
  vars: Record<string, string>;
};

const themes: ThemePreview[] = [
  {
    id: "paper-moss",
    name: "Paper Moss",
    note: "今の雰囲気を保ちつつ、背景コントラストを強めた案。",
    vars: {
      "--page-bg": "#ebe4d6",
      "--page-text": "#1d241f",
      "--sidebar-bg": "linear-gradient(180deg, #17382d 0%, #285341 100%)",
      "--sidebar-text": "#f7f2e8",
      "--panel-bg": "#fffaf0",
      "--panel-border": "rgba(23, 56, 45, 0.18)",
      "--chip-bg": "#e1d5bd",
      "--task-bg": "#fffdf8",
      "--muted-text": "#4b5a51",
      "--accent": "#c85f36",
      "--accent-text": "#fff9f3",
    },
  },
  {
    id: "mist-blue",
    name: "Mist Blue",
    note: "青みを足して文字の見やすさを優先した、軽めの業務UI向け案。",
    vars: {
      "--page-bg": "#dfe9ef",
      "--page-text": "#1b2530",
      "--sidebar-bg": "linear-gradient(180deg, #173049 0%, #264b68 100%)",
      "--sidebar-text": "#eef6fb",
      "--panel-bg": "#f8fbfd",
      "--panel-border": "rgba(23, 48, 73, 0.16)",
      "--chip-bg": "#d8e7f1",
      "--task-bg": "#ffffff",
      "--muted-text": "#4f6475",
      "--accent": "#d1693f",
      "--accent-text": "#fff9f3",
    },
  },
  {
    id: "graphite-sand",
    name: "Graphite Sand",
    note: "余白感を抑えて締まって見える、少し密度高めの案。",
    vars: {
      "--page-bg": "#ddd6cb",
      "--page-text": "#1f2022",
      "--sidebar-bg": "linear-gradient(180deg, #2c2f36 0%, #4a4e56 100%)",
      "--sidebar-text": "#f4efe7",
      "--panel-bg": "#f7f2ea",
      "--panel-border": "rgba(31, 32, 34, 0.16)",
      "--chip-bg": "#e0d5c7",
      "--task-bg": "#fcfaf7",
      "--muted-text": "#5c5a57",
      "--accent": "#b85a38",
      "--accent-text": "#fff7f0",
    },
  },
];

function MockWorkspace({ theme }: { theme: ThemePreview }) {
  return (
    <section className={styles.preview}>
      <header className={styles.previewHeader}>
        <div>
          <h2>{theme.name}</h2>
          <p>{theme.note}</p>
        </div>
      </header>
      <div className={styles.mock} style={theme.vars as React.CSSProperties}>
        <aside className={styles.sidebar}>
          <div className={styles.panel}>
            <h3>Projects</h3>
            <ul className={styles.list}>
              <li>Inbox</li>
              <li>Personal</li>
              <li>Work</li>
            </ul>
          </div>
          <div className={styles.panel}>
            <h3>Tags</h3>
            <div className={styles.chips}>
              <span className={styles.chip}>urgent</span>
              <span className={styles.chip}>design</span>
              <span className={styles.chip}>today</span>
            </div>
          </div>
        </aside>
        <main className={styles.main}>
          <div className={styles.panel}>
            <h3>Inbox</h3>
            <div className={styles.formRow}>
              <input defaultValue="資料の最終チェック" />
              <button>Add task</button>
            </div>
          </div>
          <div className={styles.panel}>
            <ul className={styles.taskList}>
              <li className={styles.taskRow}>
                <div>
                  <strong>仕様確認</strong>
                  <div className={styles.meta}>
                    <span>Inbox</span>
                    <span>Due 03/24 10:00</span>
                    <span>P3</span>
                    <span>#design</span>
                  </div>
                </div>
                <div className={styles.actions}>
                  <button>Edit</button>
                </div>
              </li>
              <li className={styles.taskRow}>
                <div>
                  <strong>画面密度の調整</strong>
                  <div className={styles.meta}>
                    <span>Inbox</span>
                    <span>P5</span>
                    <span>#urgent</span>
                  </div>
                </div>
                <div className={styles.actions}>
                  <button>Complete</button>
                </div>
              </li>
            </ul>
          </div>
        </main>
        <section className={styles.detail}>
          <div className={styles.panel}>
            <h3>Edit task</h3>
            <div className={styles.detailStack}>
              <input defaultValue="仕様確認" />
              <input defaultValue="2026-03-24T10:00" type="datetime-local" />
              <select defaultValue="3">
                <option value="">Priority</option>
                <option value="3">P3</option>
              </select>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

export default function ThemePreviewPage() {
  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>Theme Preview</h1>
        <p>今の3カラムレイアウトに当てた背景色と面の組み合わせです。</p>
      </header>
      <div className={styles.grid}>
        {themes.map((theme) => (
          <MockWorkspace key={theme.id} theme={theme} />
        ))}
      </div>
    </main>
  );
}
