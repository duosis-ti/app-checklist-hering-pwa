import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ApiError,
  attachPhoto,
  createExecution,
  deactivateTemplate,
  executionErrors,
  finishExecution,
  getSession,
  loadData,
  login,
  logout,
  photoUrl,
  saveExecution,
  saveTemplate,
  startSync,
  subscribe,
  syncNow,
  updateAction,
  type ActionPlan,
  type Answer,
  type AnswerValue,
  type Execution,
  type PhotoMeta,
  type Session,
  type SyncStatus,
  type Template,
} from "./lib";
import "./styles.css";

type IconName =
  | "check"
  | "checklist"
  | "history"
  | "actions"
  | "store"
  | "logout"
  | "arrow"
  | "back"
  | "plus"
  | "wifi"
  | "offline"
  | "refresh"
  | "clock"
  | "user"
  | "photo"
  | "edit"
  | "up"
  | "down"
  | "trash"
  | "download"
  | "eye"
  | "eyeOff"
  | "close";
const iconPaths: Record<IconName, ReactNode> = {
  check: <path d="m5 12 4 4L19 6" />,
  checklist: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3h6v4H9zM9 12l1 1 2-2m2 1h2m-7 5 1 1 2-2m2 1h2" />
    </>
  ),
  history: (
    <>
      <path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  actions: (
    <>
      <path d="M14 5a4 4 0 0 0-5 5L3 16a3 3 0 0 0 4 4l6-6a4 4 0 0 0 5-5l-3 3-3-3 3-3z" />
    </>
  ),
  store: (
    <>
      <path d="M3 10h18l-2-6H5l-2 6zm2 0v10h14V10M9 20v-6h6v6" />
      <path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
    </>
  ),
  logout: (
    <>
      <path d="M9 4H4v16h5m5-12 4 4-4 4M8 12h12" />
    </>
  ),
  arrow: <path d="m9 5 7 7-7 7" />,
  back: <path d="m11 5-7 7 7 7M4 12h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  wifi: (
    <>
      <path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0" />
      <circle cx="12" cy="20" r=".5" />
    </>
  ),
  offline: (
    <>
      <path d="m3 3 18 18M9 6a15 15 0 0 1 12 2M3 8l2-1m1 5a10 10 0 0 1 5-2m6 1 1 1m-9 4a5 5 0 0 1 6 0" />
      <circle cx="12" cy="20" r=".5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  photo: (
    <>
      <path d="M3 7h4l2-3h6l2 3h4v14H3z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  edit: (
    <>
      <path d="m15 4 5 5-10 10-6 1 1-6L15 4zm-2 2 5 5" />
    </>
  ),
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="m3 3 18 18M10 5a13 13 0 0 1 12 7l-3 4M6 6a18 18 0 0 0-4 6s4 7 10 7l4-1M9 9a4 4 0 0 0 6 6" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
};
function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}
const roles = {
  admin: "Administrador",
  manager: "Gerente",
  operator: "Operador",
};
const values: [AnswerValue, string][] = [
  ["C", "Conforme"],
  ["NC", "Não conforme"],
  ["NA", "Não se aplica"],
];
const actionLabels = {
  open: "Aberto",
  in_progress: "Em andamento",
  completed: "Concluído",
};
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível concluir. Tente novamente.";
}
function date(value: string, withTime = true) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
  }).format(new Date(value));
}
function score(value: number | null) {
  return value === null
    ? "Sem pontuação"
    : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;
}
function SyncBadge({ status }: { status: SyncStatus }) {
  const settings: Record<SyncStatus, [string, string, IconName]> = {
    pending: ["Pendente de envio", "warning", "clock"],
    syncing: ["Sincronizando", "neutral", "refresh"],
    synced: ["Sincronizado", "success", "check"],
    error: ["Erro no envio", "error", "refresh"],
  };
  const [text, tone, icon] = settings[status];
  return (
    <span className={`badge ${tone}`}>
      <Icon name={icon} />
      {text}
    </span>
  );
}
function Photo({ photo, alt }: { photo: PhotoMeta; alt: string }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    setFailed(false);
    setUrl("");
    void photoUrl(photo)
      .then((result) => {
        if (current) {
          setUrl(result);
          setFailed(!result);
        }
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [photo.id, photo.url]);
  return url && !failed ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Ampliar: ${alt}`}
    >
      <img src={url} alt={alt} onError={() => setFailed(true)} />
    </a>
  ) : (
    <span className="small muted">
      {failed
        ? "Foto indisponível. Atualize com internet."
        : "Carregando foto…"}
    </span>
  );
}
function SelectedPhoto({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div className="photo-preview">
      {url && <img src={url} alt="Foto selecionada da correção" />}
      <div className="photo-info">
        <p>{file.name}</p>
        <span>A foto será enviada ao concluir.</span>
      </div>
    </div>
  );
}
function Empty({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name={icon} />
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await login(email.trim(), password));
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-layout">
        <div className="brand login-brand">
          <span className="brand-mark">
            <Icon name="check" />
          </span>
          Checklist
        </div>
        <section className="login-panel">
          <h1>Entrar</h1>
          <p className="muted">Acesse os checklists da sua loja.</p>
          <form onSubmit={submit}>
            <div className="form-field">
              <label htmlFor="email">E-mail</label>
              <input
                className="input"
                id="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
              />
            </div>
            <div className="form-field">
              <label htmlFor="password">Senha</label>
              <div className="password-field">
                <input
                  className="input"
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={show}
                >
                  <Icon name={show ? "eyeOff" : "eye"} />
                </button>
              </div>
            </div>
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            <button className="button primary full-width" disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" />
                  Entrando…
                </>
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </section>
        <p className="login-note">O primeiro acesso precisa de internet.</p>
      </div>
    </main>
  );
}

type Tab = "checklists" | "history" | "actions" | "models";
type View = "list" | "execution" | "detail" | "finished" | "action" | "editor";
type TemplateDraft = Template | Omit<Template, "id" | "version">;
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const emptyData = {
  templates: [] as Template[],
  executions: [] as Execution[],
  actions: [] as ActionPlan[],
};

export default function App() {
  const [session, setSession] = useState<Session | null>(getSession);
  const [tab, setTab] = useState<Tab>(
    session?.user.role === "admin" ? "models" : "checklists",
  );
  const [view, setView] = useState<View>("list");
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [pageError, setPageError] = useState("");
  const [execution, setExecution] = useState<Execution | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [action, setAction] = useState<ActionPlan | null>(null);
  const [actionFile, setActionFile] = useState<File | null>(null);
  const [actionFilter, setActionFilter] = useState<"pending" | "completed">(
    "pending",
  );
  const [template, setTemplate] = useState<TemplateDraft | null>(null);
  const [modal, setModal] = useState<"logout" | "install" | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(
    null,
  );
  const [installed, setInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  );
  const [offlineReady, setOfflineReady] = useState(() =>
    Boolean(navigator.serviceWorker?.controller),
  );
  const draftRef = useRef<Execution | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const revision = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const modalRef = useRef<HTMLElement | null>(null);

  const notify = useCallback((text: string, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? 7000 : 4500);
  }, []);
  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const next = await loadData();
      if (getSession()?.user.id === session.user.id) {
        setData(next);
        setPageError("");
      }
    } catch (error) {
      setPageError(message(error));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    const onControlled = () => setOfflineReady(true);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", onInstalled);
    navigator.serviceWorker?.addEventListener("controllerchange", onControlled);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", onInstalled);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        onControlled,
      );
      clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = modalRef.current;
    const controls = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])",
        ) ?? [],
      );
    controls()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = controls();
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      if (previous?.isConnected) previous.focus();
    };
  }, [modal]);
  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 700);
    });
    const stopSync = startSync();
    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);
    return () => {
      clearTimeout(timer);
      unsubscribe();
      stopSync();
      window.removeEventListener("online", onOnline);
    };
  }, [session, refresh]);

  function persistDraft(next: Execution) {
    draftRef.current = next;
    setExecution(next);
    setSaveState("saving");
    const currentRevision = ++revision.current;
    const task = saveQueue.current
      .catch(() => {})
      .then(() => saveExecution(next));
    saveQueue.current = task;
    void task
      .then(() => {
        if (currentRevision === revision.current) setSaveState("saved");
      })
      .catch((error) => {
        setSaveState("error");
        notify(message(error), true);
      });
  }
  function changeAnswer(itemId: string, update: Partial<Answer>) {
    const current = draftRef.current;
    if (!current || current.finishedAt) return;
    const next = {
      ...current,
      answers: current.answers.map((answer) =>
        answer.itemId === itemId ? { ...answer, ...update } : answer,
      ),
    };
    persistDraft(next);
    if (Object.keys(itemErrors).length) setItemErrors(executionErrors(next));
  }
  async function flush() {
    try {
      await saveQueue.current;
      return true;
    } catch {
      notify("Não foi possível salvar. Tente novamente antes de sair.", true);
      return false;
    }
  }
  async function navigate(nextTab: Tab) {
    if (busy && busy !== "sync") {
      notify("Aguarde a operação terminar.");
      return;
    }
    if (!(await flush())) return;
    draftRef.current = null;
    setExecution(null);
    setAction(null);
    setTemplate(null);
    setItemErrors({});
    setPageError("");
    setTab(nextTab);
    setView("list");
    void refresh();
    window.scrollTo({ top: 0 });
  }
  async function begin(model: Template) {
    setBusy(`start-${model.id}`);
    try {
      const next = await createExecution(model);
      draftRef.current = next;
      setExecution(next);
      setSaveState("saved");
      setItemErrors({});
      setView("execution");
      setPageError("");
      window.scrollTo({ top: 0 });
    } catch (error) {
      notify(message(error), true);
    } finally {
      setBusy("");
    }
  }
  function openExecution(next: Execution) {
    draftRef.current = next.finishedAt ? null : next;
    setExecution(next);
    setItemErrors({});
    setSaveState("saved");
    setPageError("");
    setView(next.finishedAt ? "detail" : "execution");
    window.scrollTo({ top: 0 });
  }
  async function addPhoto(itemId: string, file?: File) {
    if (!file || !draftRef.current) return;
    const executionId = draftRef.current.id;
    setBusy(`photo-${itemId}`);
    try {
      const photo = await attachPhoto(executionId, itemId, file);
      if (draftRef.current?.id !== executionId) return;
      changeAnswer(itemId, { photos: [photo] });
      await saveQueue.current;
    } catch (error) {
      notify(message(error), true);
    } finally {
      setBusy("");
    }
  }
  async function complete() {
    const current = draftRef.current;
    if (!current) return;
    const errors = executionErrors(current);
    setItemErrors(errors);
    if (Object.keys(errors).length) {
      const first = current.template.items
        .slice()
        .sort((a, b) => a.order - b.order)
        .find((item) => errors[item.id]);
      requestAnimationFrame(() => {
        const block = document.getElementById(`item-${first?.id}`);
        block?.scrollIntoView({ behavior: "smooth", block: "center" });
        block
          ?.querySelector<HTMLInputElement>(
            current.answers.find((a) => a.itemId === first?.id)?.value === "NC"
              ? "input[type=file]"
              : "input[type=radio]",
          )
          ?.focus({ preventScroll: true });
      });
      return;
    }
    setBusy("finish");
    try {
      await saveQueue.current;
      const finished = await finishExecution(current);
      draftRef.current = null;
      setExecution(finished);
      setView("finished");
      void refresh();
      window.scrollTo({ top: 0 });
    } catch (error) {
      notify(message(error), true);
    } finally {
      setBusy("");
    }
  }
  async function retrySave() {
    if (draftRef.current) persistDraft(draftRef.current);
  }
  async function manualSync() {
    if (!online) {
      notify("O envio começa quando a conexão voltar.");
      return;
    }
    setBusy("sync");
    try {
      await syncNow();
      await refresh();
    } catch (error) {
      notify(message(error), true);
    } finally {
      setBusy("");
    }
  }
  function finishLogout() {
    logout();
    setSession(null);
    setData(emptyData);
    setExecution(null);
    draftRef.current = null;
    setView("list");
    setModal(null);
    saveQueue.current = Promise.resolve();
  }
  async function requestLogout() {
    if (busy && busy !== "sync") {
      notify("Aguarde a operação terminar.");
      return;
    }
    if (!(await flush())) return;
    if (
      data.executions.some(
        (e) =>
          e.userId === session?.user.id &&
          (!e.finishedAt || e.syncStatus !== "synced"),
      )
    )
      setModal("logout");
    else finishLogout();
  }
  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } else setModal("install");
  }
  function editTemplate(model?: Template) {
    setTemplate(
      model
        ? structuredClone(model)
        : {
            name: "",
            description: "",
            role: "operator",
            active: true,
            items: [
              {
                id: crypto.randomUUID(),
                description: "",
                order: 0,
                required: true,
              },
            ],
          },
    );
    setView("editor");
    setPageError("");
    window.scrollTo({ top: 0 });
  }
  async function submitTemplate(event: FormEvent) {
    event.preventDefault();
    if (!template) return;
    if (
      !template.name.trim() ||
      !template.items.length ||
      template.items.some((item) => !item.description.trim())
    ) {
      setPageError("Preencha o nome e a descrição de todos os itens.");
      return;
    }
    setBusy("template");
    setPageError("");
    try {
      await saveTemplate({
        ...template,
        name: template.name.trim(),
        description: template.description.trim(),
        items: template.items.map((item, order) => ({
          ...item,
          description: item.description.trim(),
          order,
        })),
      });
      setView("list");
      setTemplate(null);
      await refresh();
      notify("Modelo salvo.");
    } catch (error) {
      setPageError(message(error));
    } finally {
      setBusy("");
    }
  }
  function moveItem(index: number, direction: number) {
    if (!template) return;
    const items = [...template.items];
    [items[index], items[index + direction]] = [
      items[index + direction],
      items[index],
    ];
    setTemplate({
      ...template,
      items: items.map((item, order) => ({ ...item, order })),
    });
  }
  async function disableTemplate(model: Template) {
    setBusy(`deactivate-${model.id}`);
    try {
      await deactivateTemplate(model.id);
      await refresh();
      notify("Modelo desativado.");
    } catch (error) {
      notify(message(error), true);
    } finally {
      setBusy("");
    }
  }
  async function saveAction(status: ActionPlan["status"]) {
    if (!action) return;
    if (status === "completed" && !actionFile) {
      setPageError("Adicione uma foto da correção.");
      document.getElementById("correction-photo")?.focus();
      return;
    }
    setBusy("action");
    setPageError("");
    try {
      const updated = await updateAction(
        action,
        status,
        actionFile ?? undefined,
      );
      setAction(updated);
      setActionFile(null);
      await refresh();
      notify(status === "completed" ? "Ação concluída." : "Ação em andamento.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try {
          const currentData = await loadData();
          setData(currentData);
          const currentAction = currentData.actions.find(
            (entry) => entry.id === action.id,
          );
          if (currentAction) setAction(currentAction);
          setPageError(
            "Esta ação foi atualizada. Confira as informações antes de tentar novamente.",
          );
        } catch {
          setPageError(message(error));
        }
      } else setPageError(message(error));
    } finally {
      setBusy("");
    }
  }

  if (!session)
    return (
      <Login
        onLogin={(next) => {
          setSession(next);
          setTab(next.user.role === "admin" ? "models" : "checklists");
          setView("list");
        }}
      />
    );
  const user = session.user;
  const drafts = data.executions.filter(
    (e) => !e.finishedAt && e.userId === user.id,
  );
  const history = data.executions.filter((e) => e.finishedAt);
  const pending = history.filter(
    (e) => e.userId === user.id && e.syncStatus !== "synced",
  );
  const pendingActions = data.actions.filter((a) => a.status !== "completed");
  const templates = data.templates.filter((t) => t.active);
  const currentExecution = execution?.finishedAt
    ? (data.executions.find((e) => e.id === execution.id) ?? execution)
    : execution;
  const nav: { id: Tab; label: string; icon: IconName }[] =
    user.role === "admin"
      ? [{ id: "models", label: "Modelos", icon: "checklist" }]
      : [
          { id: "checklists", label: "Checklists", icon: "checklist" },
          { id: "history", label: "Histórico", icon: "history" },
          ...(user.role === "manager"
            ? [
                {
                  id: "actions" as Tab,
                  label: "Ações",
                  icon: "actions" as IconName,
                },
              ]
            : []),
        ];

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand sidebar-brand">
          <span className="brand-mark">
            <Icon name="check" />
          </span>
          Checklist
        </div>
        <nav className="app-nav" aria-label="Navegação principal">
          {nav.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`nav-item ${tab === item.id ? "active" : ""}`}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => void navigate(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "actions" && pendingActions.length > 0 && (
                <span className="nav-count">{pendingActions.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <span className="user-avatar">
            {user.name
              .split(" ")
              .slice(0, 2)
              .map((n) => n[0])
              .join("")}
          </span>
          <div className="user-copy">
            <strong>{user.name}</strong>
            <span>{roles[user.role]}</span>
          </div>
          <button
            type="button"
            className="button ghost"
            aria-label="Sair da conta"
            onClick={() => void requestLogout()}
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="store-name">
            <Icon name="store" />
            <span>{user.storeName ?? "Administração"}</span>
          </div>
          <div className="topbar-actions">
            <span className={`connection-status ${online ? "" : "offline"}`}>
              <Icon name={online ? "wifi" : "offline"} />
              {online ? "Online" : "Sem internet"}
            </span>
            <button
              type="button"
              className="button ghost mobile-user"
              aria-label="Sair da conta"
              onClick={() => void requestLogout()}
            >
              <Icon name="logout" />
            </button>
          </div>
        </header>
        {!online && (
          <div className="offline-banner" role="status">
            <Icon name="offline" />
            <span>
              {user.role === "admin"
                ? "Conecte-se à internet para alterar modelos."
                : "Você pode continuar os checklists. Enviaremos os dados quando a conexão voltar."}
            </span>
          </div>
        )}
        <main className="page-content">
          {pageError && view !== "editor" && view !== "action" && (
            <div
              className="error-box"
              role="alert"
              style={{ marginBottom: 18 }}
            >
              {pageError}
            </div>
          )}
          {loading && view === "list" ? (
            <div className="loading">
              <span className="spinner" />
              <p style={{ marginTop: 12 }}>Carregando…</p>
            </div>
          ) : (
            <>
              {view === "list" && tab === "checklists" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>Checklists</h1>
                      <p>Escolha uma rotina para começar.</p>
                    </div>
                    {!installed && (
                      <button
                        type="button"
                        className="button"
                        onClick={() => void install()}
                      >
                        <Icon name="download" />
                        Instalar app
                      </button>
                    )}
                  </div>
                  {drafts.length > 0 && (
                    <section
                      className="drafts-section"
                      aria-label="Checklists em andamento"
                    >
                      <p className="section-label">Continuar de onde parou</p>
                      {drafts.map((draft) => (
                        <div className="draft-row" key={draft.id}>
                          <div>
                            <h3>{draft.template.name}</h3>
                            <p>
                              {draft.answers.filter((a) => a.value).length} de{" "}
                              {draft.template.items.length} respondidos
                            </p>
                          </div>
                          <button
                            className="button"
                            type="button"
                            onClick={() => openExecution(draft)}
                          >
                            Continuar
                            <Icon name="arrow" />
                          </button>
                        </div>
                      ))}
                    </section>
                  )}
                  {templates.length ? (
                    <div className="card-grid">
                      {templates.map((model) => (
                        <article className="panel template-card" key={model.id}>
                          <div className="template-card-top">
                            <span className="template-icon">
                              <Icon name="checklist" />
                            </span>
                            <span className="badge neutral">
                              <Icon name="check" />
                              {offlineReady
                                ? "Disponível offline"
                                : "Modelo salvo"}
                            </span>
                          </div>
                          <div>
                            <h2>{model.name}</h2>
                            {model.description && <p>{model.description}</p>}
                          </div>
                          <div className="template-card-bottom">
                            <span className="template-meta">
                              <Icon name="checklist" />
                              {model.items.length} itens
                            </span>
                            <button
                              className="button primary"
                              type="button"
                              disabled={busy.startsWith("start-")}
                              onClick={() => void begin(model)}
                            >
                              {busy === `start-${model.id}`
                                ? "Abrindo…"
                                : "Iniciar checklist"}
                              <Icon name="arrow" />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <Empty icon="checklist" title="Nenhum checklist disponível">
                      {online
                        ? "Seu administrador ainda não disponibilizou modelos para seu cargo."
                        : "Conecte-se à internet para baixar os modelos pela primeira vez."}
                    </Empty>
                  )}
                  {pending.length > 0 && (
                    <div className="sync-summary">
                      <span>
                        {pending.length}{" "}
                        {pending.length === 1
                          ? "checklist aguarda envio"
                          : "checklists aguardam envio"}
                      </span>
                      <button
                        type="button"
                        className="button ghost small"
                        onClick={() => void manualSync()}
                        disabled={busy === "sync"}
                      >
                        <Icon name="refresh" />
                        {busy === "sync" ? "Enviando…" : "Tentar enviar"}
                      </button>
                    </div>
                  )}
                </>
              )}

              {view === "execution" && execution && (
                <div className="execution-page">
                  <button
                    type="button"
                    className="text-button back-button"
                    onClick={() => void navigate("checklists")}
                  >
                    <Icon name="back" />
                    Voltar aos checklists
                  </button>
                  <div className="execution-title">
                    <h1>{execution.template.name}</h1>
                    <span className="badge neutral">Em andamento</span>
                  </div>
                  <p className="execution-meta">{user.storeName}</p>
                  <div className="execution-progress">
                    <div className="grow">
                      <div className="progress-copy">
                        <strong>
                          {execution.answers.filter((a) => a.value).length} de{" "}
                          {execution.template.items.length} respondidos
                        </strong>
                        <span className="save-state" aria-live="polite">
                          <Icon
                            name={saveState === "saved" ? "check" : "clock"}
                          />
                          {saveState === "saved"
                            ? "Salvo no aparelho"
                            : saveState === "saving"
                              ? "Salvando…"
                              : "Falha ao salvar"}
                        </span>
                      </div>
                      <div
                        className="progress-track"
                        role="progressbar"
                        aria-label="Itens respondidos"
                        aria-valuemin={0}
                        aria-valuemax={execution.template.items.length}
                        aria-valuenow={
                          execution.answers.filter((a) => a.value).length
                        }
                      >
                        <div
                          className="progress-fill"
                          style={{
                            width: `${(execution.answers.filter((a) => a.value).length / execution.template.items.length) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  {saveState === "error" && (
                    <div
                      className="error-box row between"
                      role="alert"
                      style={{ marginBottom: 15 }}
                    >
                      <span>As últimas alterações não foram salvas.</span>
                      <button
                        type="button"
                        className="button small"
                        onClick={() => void retrySave()}
                      >
                        Tentar salvar
                      </button>
                    </div>
                  )}
                  <div className="items-list">
                    {execution.template.items
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((item, index) => {
                        const answer = execution.answers.find(
                          (a) => a.itemId === item.id,
                        )!;
                        return (
                          <section
                            className={`checklist-item ${itemErrors[item.id] ? "invalid" : ""}`}
                            id={`item-${item.id}`}
                            key={item.id}
                            aria-labelledby={`title-${item.id}`}
                          >
                            <div className="item-heading">
                              <span className="item-number">{index + 1}</span>
                              <div>
                                <h2 id={`title-${item.id}`}>
                                  {item.description}
                                </h2>
                                <span className="item-required">
                                  {item.required ? "Obrigatório" : "Opcional"}
                                </span>
                              </div>
                            </div>
                            <fieldset
                              className="response-options"
                              role="radiogroup"
                              aria-labelledby={`title-${item.id}`}
                              aria-describedby={
                                itemErrors[item.id]
                                  ? `error-${item.id}`
                                  : undefined
                              }
                            >
                              <legend className="sr-only">
                                Resposta para {item.description}
                              </legend>
                              {values.map(([value, label]) => (
                                <label
                                  className={`response-option ${value.toLowerCase()}`}
                                  key={value}
                                >
                                  <input
                                    type="radio"
                                    name={`answer-${item.id}`}
                                    value={value}
                                    checked={answer.value === value}
                                    onChange={() =>
                                      changeAnswer(item.id, { value })
                                    }
                                    disabled={busy === "finish"}
                                  />
                                  <span>{label}</span>
                                </label>
                              ))}
                            </fieldset>
                            {(answer.value === "NC" ||
                              answer.photos.length > 0) && (
                              <div className="item-evidence">
                                <label htmlFor={`photo-${item.id}`}>
                                  {answer.value === "NC"
                                    ? "Foto da não conformidade · obrigatória"
                                    : "Foto do item"}
                                </label>
                                <input
                                  type="file"
                                  id={`photo-${item.id}`}
                                  accept="image/*"
                                  onChange={async (e) => {
                                    const input = e.currentTarget;
                                    const file = input.files?.[0];
                                    await addPhoto(item.id, file);
                                    input.value = "";
                                  }}
                                  disabled={busy !== ""}
                                />
                                {busy === `photo-${item.id}` && (
                                  <p className="evidence-hint" role="status">
                                    Salvando foto no aparelho…
                                  </p>
                                )}
                                {answer.photos.length > 0 && (
                                  <div className="photo-preview">
                                    <Photo
                                      photo={answer.photos[0]}
                                      alt={`Evidência: ${item.description}`}
                                    />
                                    <div className="photo-info">
                                      <p>Foto salva no aparelho</p>
                                      <button
                                        type="button"
                                        className="text-button"
                                        onClick={() =>
                                          changeAnswer(item.id, { photos: [] })
                                        }
                                        disabled={busy !== ""}
                                      >
                                        Remover foto
                                      </button>
                                    </div>
                                  </div>
                                )}
                                {answer.value === "NC" && (
                                  <p className="evidence-hint">
                                    Será criada uma ação para o gerente da loja.
                                  </p>
                                )}
                              </div>
                            )}
                            {answer.value !== "NC" && !answer.photos.length && (
                              <details className="item-note">
                                <summary>Adicionar foto opcional</summary>
                                <label
                                  className="sr-only"
                                  htmlFor={`optional-photo-${item.id}`}
                                >
                                  Foto opcional de {item.description}
                                </label>
                                <input
                                  type="file"
                                  id={`optional-photo-${item.id}`}
                                  accept="image/*"
                                  onChange={async (e) => {
                                    const input = e.currentTarget;
                                    const file = input.files?.[0];
                                    await addPhoto(item.id, file);
                                    input.value = "";
                                  }}
                                  disabled={busy !== ""}
                                />
                              </details>
                            )}
                            <details className="item-note">
                              <summary>Adicionar observação</summary>
                              <label
                                className="sr-only"
                                htmlFor={`observation-${item.id}`}
                              >
                                Observação opcional para {item.description}
                              </label>
                              <textarea
                                id={`observation-${item.id}`}
                                value={answer.observation}
                                maxLength={2000}
                                placeholder="Observação opcional"
                                onChange={(e) =>
                                  changeAnswer(item.id, {
                                    observation: e.target.value,
                                  })
                                }
                                disabled={busy === "finish"}
                              />
                            </details>
                            {itemErrors[item.id] && (
                              <p
                                className="error-text"
                                id={`error-${item.id}`}
                                role="alert"
                              >
                                {itemErrors[item.id]}
                              </p>
                            )}
                          </section>
                        );
                      })}
                  </div>
                  <footer className="execution-footer">
                    <p>Suas respostas ficam salvas neste aparelho.</p>
                    <button
                      type="button"
                      className="button primary"
                      disabled={busy !== ""}
                      onClick={() => void complete()}
                    >
                      {busy === "finish" ? "Concluindo…" : "Concluir checklist"}
                      <Icon name="check" />
                    </button>
                  </footer>
                </div>
              )}

              {view === "finished" && currentExecution && (
                <div className="execution-page">
                  <section className="finish-summary">
                    <div className="summary-check">
                      <Icon name="check" />
                    </div>
                    <h1>Checklist concluído</h1>
                    <p className="muted">{currentExecution.template.name}</p>
                    <div className="summary-score">
                      {score(currentExecution.score)}
                    </div>
                    <p className="small muted">
                      {currentExecution.score === null
                        ? "Nenhum item aplicável."
                        : "de conformidade"}
                    </p>
                    <p className="small">
                      {
                        currentExecution.answers.filter((a) => a.value === "NC")
                          .length
                      }{" "}
                      {currentExecution.answers.filter((a) => a.value === "NC")
                        .length === 1
                        ? "não conformidade registrada"
                        : "não conformidades registradas"}
                    </p>
                    <SyncBadge status={currentExecution.syncStatus} />
                    {currentExecution.syncStatus !== "synced" && (
                      <p className="small muted" style={{ marginTop: 14 }}>
                        Salvo no aparelho. O envio é automático com o app aberto
                        e conectado.
                      </p>
                    )}
                    {currentExecution.syncError && (
                      <p className="error-text">{currentExecution.syncError}</p>
                    )}
                    <div>
                      <button
                        className="button primary"
                        type="button"
                        onClick={() => void navigate("checklists")}
                      >
                        Voltar aos checklists
                      </button>
                    </div>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => setView("detail")}
                    >
                      Ver respostas
                      <Icon name="arrow" />
                    </button>
                  </section>
                </div>
              )}

              {view === "list" && tab === "history" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>Histórico</h1>
                      <p>Checklists concluídos na sua loja.</p>
                    </div>
                    {pending.length > 0 && (
                      <button
                        className="button"
                        type="button"
                        onClick={() => void manualSync()}
                        disabled={busy === "sync"}
                      >
                        <Icon name="refresh" />
                        {busy === "sync" ? "Enviando…" : "Enviar pendentes"}
                      </button>
                    )}
                  </div>
                  {history.length ? (
                    <div className="panel list-panel">
                      {history.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="list-row"
                          onClick={() => openExecution(item)}
                        >
                          <div className="list-row-main">
                            <h3>{item.template.name}</h3>
                            <p>{date(item.finishedAt!)}</p>
                            <p style={{ marginTop: 4 }}>{item.userName}</p>
                            <div style={{ marginTop: 8 }}>
                              <SyncBadge status={item.syncStatus} />
                            </div>
                          </div>
                          <div className="list-row-side">
                            <span className="score">
                              {item.score === null ? "—" : score(item.score)}
                            </span>
                            <Icon name="arrow" />
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Empty icon="history" title="Seu histórico começa aqui">
                      Os checklists concluídos aparecerão nesta tela.
                    </Empty>
                  )}
                </>
              )}

              {view === "detail" && currentExecution && (
                <div className="execution-page">
                  <button
                    type="button"
                    className="text-button back-button"
                    onClick={() => void navigate("history")}
                  >
                    <Icon name="back" />
                    Voltar ao histórico
                  </button>
                  <div className="details-summary">
                    <div>
                      <h1>{currentExecution.template.name}</h1>
                      <p className="small muted no-margin">
                        {date(
                          currentExecution.finishedAt ??
                            currentExecution.startedAt,
                        )}{" "}
                        · {currentExecution.userName}
                      </p>
                    </div>
                    <span className="details-score">
                      {currentExecution.score === null
                        ? "—"
                        : score(currentExecution.score)}
                    </span>
                  </div>
                  <div className="row between" style={{ marginBottom: 24 }}>
                    <SyncBadge status={currentExecution.syncStatus} />
                    {currentExecution.score === null && (
                      <span className="small muted">Nenhum item aplicável</span>
                    )}
                    {currentExecution.syncStatus === "error" && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => void manualSync()}
                        disabled={busy === "sync"}
                      >
                        <Icon name="refresh" />
                        Tentar enviar
                      </button>
                    )}
                  </div>
                  {currentExecution.syncError && (
                    <div className="error-box" style={{ marginBottom: 18 }}>
                      {currentExecution.syncError}
                    </div>
                  )}
                  <div className="items-list">
                    {currentExecution.template.items
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((item, index) => {
                        const answer = currentExecution.answers.find(
                          (a) => a.itemId === item.id,
                        );
                        return (
                          <article className="checklist-item" key={item.id}>
                            <div className="item-heading">
                              <span className="item-number">{index + 1}</span>
                              <h2>{item.description}</h2>
                            </div>
                            <span
                              className={`answer-label ${answer?.value?.toLowerCase() ?? ""}`}
                            >
                              <Icon
                                name={
                                  answer?.value === "C"
                                    ? "check"
                                    : answer?.value === "NC"
                                      ? "actions"
                                      : "checklist"
                                }
                              />
                              {values.find(
                                ([value]) => value === answer?.value,
                              )?.[1] ?? "Não respondido · opcional"}
                            </span>
                            {answer?.observation && (
                              <p className="answer-observation">
                                {answer.observation}
                              </p>
                            )}
                            {!!answer?.photos.length && (
                              <div className="answer-images">
                                {answer.photos.map((photo) => (
                                  <Photo
                                    key={photo.id}
                                    photo={photo}
                                    alt={`Evidência: ${item.description}`}
                                  />
                                ))}
                              </div>
                            )}
                          </article>
                        );
                      })}
                  </div>
                </div>
              )}

              {view === "list" && tab === "actions" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>Planos de ação</h1>
                      <p>Acompanhe as correções da sua loja.</p>
                    </div>
                  </div>
                  <div
                    className="filter-tabs"
                    aria-label="Filtrar planos de ação"
                  >
                    <button
                      type="button"
                      className={`filter-tab ${actionFilter === "pending" ? "active" : ""}`}
                      aria-pressed={actionFilter === "pending"}
                      onClick={() => setActionFilter("pending")}
                    >
                      Pendentes · {pendingActions.length}
                    </button>
                    <button
                      type="button"
                      className={`filter-tab ${actionFilter === "completed" ? "active" : ""}`}
                      aria-pressed={actionFilter === "completed"}
                      onClick={() => setActionFilter("completed")}
                    >
                      Concluídos
                    </button>
                  </div>
                  {data.actions.filter((a) =>
                    actionFilter === "completed"
                      ? a.status === "completed"
                      : a.status !== "completed",
                  ).length ? (
                    <div className="stack">
                      {data.actions
                        .filter((a) =>
                          actionFilter === "completed"
                            ? a.status === "completed"
                            : a.status !== "completed",
                        )
                        .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
                        .map((item) => (
                          <button
                            type="button"
                            className="panel list-row"
                            key={item.id}
                            onClick={() => {
                              setAction(item);
                              setActionFile(null);
                              setPageError("");
                              setView("action");
                              window.scrollTo({ top: 0 });
                            }}
                          >
                            <div className="action-item">
                              <div>
                                <h3>{item.description}</h3>
                                <span
                                  className={`badge ${item.status === "completed" ? "success" : item.status === "in_progress" ? "neutral" : "warning"}`}
                                >
                                  {actionLabels[item.status]}
                                </span>
                              </div>
                              <div className="action-meta">
                                <span
                                  className={
                                    item.status !== "completed" &&
                                    new Date(item.dueAt).getTime() < Date.now()
                                      ? "overdue"
                                      : ""
                                  }
                                >
                                  <Icon name="clock" />
                                  {item.status !== "completed" &&
                                  new Date(item.dueAt).getTime() < Date.now()
                                    ? "Atrasado · "
                                    : "Prazo · "}
                                  {date(item.dueAt, false)}
                                </span>
                                <span>
                                  <Icon name="user" />
                                  {item.responsibleName}
                                </span>
                              </div>
                            </div>
                            <Icon name="arrow" />
                          </button>
                        ))}
                    </div>
                  ) : (
                    <Empty
                      icon="check"
                      title={
                        actionFilter === "completed"
                          ? "Nenhuma ação concluída"
                          : "Nenhuma ação pendente"
                      }
                    >
                      {actionFilter === "completed"
                        ? "As correções concluídas aparecerão aqui."
                        : "As não conformidades dos checklists geram ações automaticamente."}
                    </Empty>
                  )}
                </>
              )}

              {view === "action" && action && (
                <div className="action-details">
                  <button
                    type="button"
                    className="text-button back-button"
                    onClick={() => void navigate("actions")}
                  >
                    <Icon name="back" />
                    Voltar às ações
                  </button>
                  <div className="page-heading">
                    <div>
                      <h1>Corrigir não conformidade</h1>
                      <p>{action.responsibleName}</p>
                    </div>
                    <span
                      className={`badge ${action.status === "completed" ? "success" : "warning"}`}
                    >
                      {actionLabels[action.status]}
                    </span>
                  </div>
                  <section className="panel">
                    <h2>{action.description}</h2>
                    <p className="small muted">Prazo: {date(action.dueAt)}</p>
                    {!!action.sourcePhotos?.length && (
                      <>
                        <p className="field-label" style={{ marginTop: 20 }}>
                          Foto da não conformidade
                        </p>
                        <div className="answer-images">
                          {action.sourcePhotos.map((photo) => (
                            <Photo
                              key={photo.id}
                              photo={photo}
                              alt="Não conformidade registrada"
                            />
                          ))}
                        </div>
                      </>
                    )}
                    {action.status === "completed" ? (
                      <>
                        <div className="notice-box" style={{ marginTop: 22 }}>
                          Concluído{" "}
                          {action.completedAt
                            ? `em ${date(action.completedAt)}`
                            : ""}
                          .
                        </div>
                        <p className="field-label" style={{ marginTop: 20 }}>
                          Evidência da correção
                        </p>
                        <div className="answer-images">
                          {action.photos.map((photo) => (
                            <Photo
                              key={photo.id}
                              photo={photo}
                              alt="Evidência da correção"
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="action-evidence">
                          <label htmlFor="correction-photo">
                            Foto da correção · obrigatória para concluir
                          </label>
                          <input
                            type="file"
                            id="correction-photo"
                            accept="image/*"
                            disabled={busy === "action"}
                            onChange={(e) => {
                              setActionFile(e.target.files?.[0] ?? null);
                              setPageError("");
                            }}
                          />
                          {actionFile && <SelectedPhoto file={actionFile} />}
                        </div>
                        {!online && (
                          <div
                            className="notice-box warning-box"
                            style={{ marginTop: 15 }}
                          >
                            Conecte-se à internet para atualizar esta ação.
                          </div>
                        )}
                        {pageError && (
                          <div
                            className="error-box"
                            role="alert"
                            style={{ marginTop: 15 }}
                          >
                            {pageError}
                          </div>
                        )}
                        <div className="action-buttons">
                          {action.status === "open" && (
                            <button
                              type="button"
                              className="button"
                              disabled={busy === "action" || !online}
                              onClick={() => void saveAction("in_progress")}
                            >
                              Iniciar correção
                            </button>
                          )}
                          <button
                            type="button"
                            className="button primary"
                            disabled={busy === "action" || !online}
                            onClick={() => void saveAction("completed")}
                          >
                            {busy === "action" ? "Salvando…" : "Concluir ação"}
                            <Icon name="check" />
                          </button>
                        </div>
                      </>
                    )}
                  </section>
                </div>
              )}

              {view === "list" && tab === "models" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>Modelos de checklist</h1>
                      <p>Defina as rotinas que cada cargo executa.</p>
                    </div>
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => editTemplate()}
                    >
                      <Icon name="plus" />
                      Novo modelo
                    </button>
                  </div>
                  {data.templates.length ? (
                    <div className="stack">
                      {data.templates.map((model) => (
                        <article className="panel" key={model.id}>
                          <div className="row between">
                            <div>
                              <h2>{model.name}</h2>
                              <p className="small muted no-margin">
                                {model.items.length} itens · {roles[model.role]}{" "}
                                · Versão {model.version}
                              </p>
                            </div>
                            <span
                              className={`badge ${model.active ? "success" : "neutral"}`}
                            >
                              {model.active ? "Ativo" : "Desativado"}
                            </span>
                          </div>
                          {model.description && (
                            <p
                              className="small muted"
                              style={{ marginTop: 13, marginBottom: 0 }}
                            >
                              {model.description}
                            </p>
                          )}
                          <div className="row" style={{ marginTop: 18 }}>
                            <button
                              type="button"
                              className="button small"
                              onClick={() => editTemplate(model)}
                            >
                              <Icon name="edit" />
                              Editar
                            </button>
                            {model.active && (
                              <button
                                type="button"
                                className="button ghost small"
                                onClick={() => void disableTemplate(model)}
                                disabled={busy === `deactivate-${model.id}`}
                              >
                                {busy === `deactivate-${model.id}`
                                  ? "Desativando…"
                                  : "Desativar"}
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <Empty icon="checklist" title="Crie o primeiro modelo">
                      Adicione os itens e escolha o cargo responsável pela
                      execução.
                    </Empty>
                  )}
                </>
              )}

              {view === "editor" && template && (
                <div className="model-editor">
                  <button
                    type="button"
                    className="text-button back-button"
                    onClick={() => void navigate("models")}
                  >
                    <Icon name="back" />
                    Voltar aos modelos
                  </button>
                  <div className="page-heading">
                    <div>
                      <h1>
                        {"id" in template ? "Editar modelo" : "Novo modelo"}
                      </h1>
                      <p>Organize os itens na ordem da execução.</p>
                    </div>
                  </div>
                  <form onSubmit={submitTemplate}>
                    <section className="panel stack">
                      <div className="form-field">
                        <label htmlFor="model-name">Nome do checklist</label>
                        <input
                          className="input"
                          id="model-name"
                          value={template.name}
                          required
                          maxLength={120}
                          onChange={(e) =>
                            setTemplate({ ...template, name: e.target.value })
                          }
                          placeholder="Ex.: Abertura de loja"
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="model-description">
                          Descrição opcional
                        </label>
                        <textarea
                          id="model-description"
                          value={template.description}
                          maxLength={500}
                          onChange={(e) =>
                            setTemplate({
                              ...template,
                              description: e.target.value,
                            })
                          }
                          placeholder="Quando este checklist deve ser executado?"
                        />
                      </div>
                      <div className="form-grid">
                        <div className="form-field">
                          <label htmlFor="model-role">Cargo responsável</label>
                          <select
                            id="model-role"
                            value={template.role}
                            onChange={(e) =>
                              setTemplate({
                                ...template,
                                role: e.target.value as Template["role"],
                              })
                            }
                          >
                            <option value="operator">Operador</option>
                            <option value="manager">Gerente</option>
                          </select>
                        </div>
                        <div className="form-field">
                          <label htmlFor="model-active">Disponibilidade</label>
                          <select
                            id="model-active"
                            value={template.active ? "active" : "inactive"}
                            onChange={(e) =>
                              setTemplate({
                                ...template,
                                active: e.target.value === "active",
                              })
                            }
                          >
                            <option value="active">Ativo</option>
                            <option value="inactive">Desativado</option>
                          </select>
                        </div>
                      </div>
                    </section>
                    <div
                      className="row between"
                      style={{ marginTop: 28, marginBottom: 14 }}
                    >
                      <h2 className="no-margin">Itens do checklist</h2>
                      <span className="small muted">
                        {template.items.length} itens
                      </span>
                    </div>
                    <div className="stack">
                      {template.items.map((item, index) => (
                        <div className="model-item-row" key={item.id}>
                          <div className="model-item-top">
                            <span className="model-order">{index + 1}</span>
                            <label
                              className="sr-only"
                              htmlFor={`model-item-${item.id}`}
                            >
                              Descrição do item {index + 1}
                            </label>
                            <input
                              className="input"
                              id={`model-item-${item.id}`}
                              value={item.description}
                              required
                              maxLength={300}
                              placeholder="Ex.: Vitrine limpa"
                              onChange={(e) =>
                                setTemplate({
                                  ...template,
                                  items: template.items.map((entry) =>
                                    entry.id === item.id
                                      ? {
                                          ...entry,
                                          description: e.target.value,
                                        }
                                      : entry,
                                  ),
                                })
                              }
                            />
                          </div>
                          <div className="model-item-controls">
                            <label>
                              <input
                                type="checkbox"
                                checked={item.required}
                                onChange={(e) =>
                                  setTemplate({
                                    ...template,
                                    items: template.items.map((entry) =>
                                      entry.id === item.id
                                        ? {
                                            ...entry,
                                            required: e.target.checked,
                                          }
                                        : entry,
                                    ),
                                  })
                                }
                              />
                              Resposta obrigatória
                            </label>
                            <span className="grow" />
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`Mover item ${index + 1} para cima`}
                              disabled={index === 0}
                              onClick={() => moveItem(index, -1)}
                            >
                              <Icon name="up" />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`Mover item ${index + 1} para baixo`}
                              disabled={index === template.items.length - 1}
                              onClick={() => moveItem(index, 1)}
                            >
                              <Icon name="down" />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`Remover item ${index + 1}`}
                              onClick={() =>
                                setTemplate({
                                  ...template,
                                  items: template.items
                                    .filter((entry) => entry.id !== item.id)
                                    .map((entry, order) => ({
                                      ...entry,
                                      order,
                                    })),
                                })
                              }
                            >
                              <Icon name="trash" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="button full-width"
                      style={{ marginTop: 14 }}
                      onClick={() =>
                        setTemplate({
                          ...template,
                          items: [
                            ...template.items,
                            {
                              id: crypto.randomUUID(),
                              description: "",
                              required: true,
                              order: template.items.length,
                            },
                          ],
                        })
                      }
                    >
                      <Icon name="plus" />
                      Adicionar item
                    </button>
                    {pageError && (
                      <div
                        className="error-box"
                        role="alert"
                        style={{ marginTop: 18 }}
                      >
                        {pageError}
                      </div>
                    )}
                    <div className="editor-footer">
                      <button
                        type="button"
                        className="button"
                        onClick={() => void navigate("models")}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="button primary"
                        disabled={busy === "template" || !online}
                      >
                        {busy === "template" ? "Salvando…" : "Salvar modelo"}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.text}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setModal(null);
          }}
        >
          <section
            ref={modalRef}
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="row between">
              <h2 id="modal-title">
                {modal === "logout"
                  ? "Sair desta conta?"
                  : "Instalar no celular"}
              </h2>
              <button
                type="button"
                className="button ghost"
                aria-label="Fechar"
                onClick={() => setModal(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            {modal === "logout" ? (
              <>
                <p>
                  Seus checklists ficam neste aparelho. Entre novamente com esta
                  conta para continuar e enviar os pendentes.
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button"
                    onClick={() => setModal(null)}
                  >
                    Continuar aqui
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    onClick={finishLogout}
                  >
                    Sair
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  <strong>iPhone:</strong> abra no Safari, toque em Compartilhar
                  e em “Adicionar à Tela de Início”.
                </p>
                <p>
                  <strong>Android:</strong> abra no Chrome, toque no menu ⋮ e em
                  “Instalar app” ou “Adicionar à tela inicial”.
                </p>
                <p className="small muted">
                  Depois do primeiro acesso, seus checklists ficam disponíveis
                  sem internet.
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => setModal(null)}
                  >
                    Entendi
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
