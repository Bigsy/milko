import "@milkdown/crepe/theme/common/style.css";
import "./style.css";
import { mergeConcurrentMarkdown } from "./concurrent-markdown";
import { deliverPendingEdits, DocumentSync } from "./document-sync";
import { DraftSession, DraftStore } from "./recovery";
import { mountEditor, type RichEditor } from "./rich-editor";
import { applyAppearance, readPreferences, savePreferences, type Preferences } from "./preferences";
import { installOptions } from "./options";
import { installShortcuts } from "./shortcuts";
import { installDraftDismissal } from "./draft-dismissal";
import type { ProofingStatus } from "./proofing/types";

const status = document.querySelector<HTMLElement>("#status")!;
const notice = document.querySelector<HTMLElement>("#notice")!;
const recovery = document.querySelector<HTMLElement>("#recovery")!;
const root = document.querySelector<HTMLElement>("#app")!;
let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* In-memory recovery remains available. */ }
const drafts = new DraftStore(storage);
const draftSession = new DraftSession(drafts);
let preferences = readPreferences(storage);
applyAppearance(preferences);
let editor: RichEditor | undefined;
let sync: DocumentSync | undefined;
let disposed = false;
let userEdited = false;
let mergedReplacement: string | undefined;
/** Set while edits must become a recovery draft rather than reach the session. */
let withholdDelivery = false;
const subscriptions: Array<{ dispose(): void }> = [];
const options = installOptions(preferences, updatePreferences, showNotice);
const shortcuts = installShortcuts();
const dismissal = installDraftDismissal();
document.querySelector<HTMLButtonElement>("#options")!.onclick = () => options.open();
document.querySelector<HTMLButtonElement>("#find")!.onclick = () => editor?.find();
document.querySelector<HTMLButtonElement>("#shortcuts")!.onclick = () => shortcuts.open();

function updatePreferences(next: Preferences): void {
  preferences = next;
  applyAppearance(next);
  editor?.configure(next);
  options.update(next);
  try { savePreferences(next, storage); options.persistence(true); }
  catch { options.persistence(false); showNotice("Could not save MilkO options. These preferences last for this tab only."); }
}

function proofingStatus(value: ProofingStatus): void {
  options.proofingStatus(value);
  document.querySelector<HTMLElement>("#proofing-status")!.textContent = value === "error" ? "Proofing unavailable" :
    value === "checking" || value === "initializing" ? "Checking…" : value === "disabled" ? "Proofing off" : "Proofing on";
  if ((value === "idle" || value === "disabled") && notice.textContent?.startsWith("Harper could not check this document:")) {
    notice.textContent = "";
    notice.hidden = true;
    options.report("");
  }
}

function showNotice(message: string): void {
  notice.textContent = message;
  notice.hidden = false;
  options.report(message);
}

function recover(markdown: string, reason: string): void {
  draftSession.recover(markdown, reason);
  showNotice(reason + (drafts.persistent ? "" : " Recovery storage is unavailable; save the draft before closing this tab."));
  renderDrafts();
}

function renderDrafts(): void {
  recovery.replaceChildren();
  const saved = draftSession.visible();
  recovery.hidden = saved.length === 0;
  if (saved.length) {
    const header = document.createElement("div");
    header.className = "milko-recovery-heading";
    const title = document.createElement("strong");
    title.textContent = `Recovery drafts (${saved.length})`;
    const dismissAll = document.createElement("button");
    dismissAll.type = "button"; dismissAll.textContent = "Dismiss all";
    dismissAll.dataset.dismissAll = "";
    const dismissible = saved.filter((draft) => draftSession.canDismiss(draft.id));
    dismissAll.disabled = dismissible.length === 0;
    dismissAll.onclick = () => dismissal.open(dismissible.length, () => {
      const kept = dismissible.filter((draft) => !draftSession.dismiss(draft));
      renderDrafts();
      if (kept.length) showNotice("Some recovery drafts changed or could not be dismissed. Those drafts were kept.");
    });
    header.append(title, dismissAll); recovery.append(header);
    const help = document.createElement("p");
    help.className = "recovery-help";
    help.textContent = "Saved copies from earlier editing sessions. Some may already be saved; compare before restoring.";
    recovery.append(help);
  }
  for (const draft of saved) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `Recover draft · ${new Date(draft.created).toLocaleString()}`;
    const description = document.createElement("p");
    description.textContent = `${draft.reason} Drafts may belong to another file; compare before applying.`;
    const text = document.createElement("textarea");
    text.readOnly = true;
    text.value = draft.markdown;
    text.setAttribute("aria-label", "Recovered Markdown draft");
    const download = document.createElement("button");
    download.textContent = "Save draft as…";
    download.hidden = !window.orca?.files;
    download.onclick = () => {
      void window.orca.files!.saveAs({ suggestedName: "milko-recovered.md", mimeType: "text/markdown", data: draft.markdown })
        .catch((error) => showNotice(String(error)));
    };
    const dismiss = document.createElement("button");
    dismiss.textContent = "Dismiss draft";
    dismiss.disabled = !draftSession.canDismiss(draft.id);
    dismiss.onclick = () => {
      if (!draftSession.dismiss(draft)) showNotice("This recovery draft changed or could not be dismissed. It was kept.");
      renderDrafts();
    };
    details.append(summary, description, text, download, dismiss);
    recovery.append(details);
  }
}

async function start(): Promise<void> {
  renderDrafts();
  const api = window.orca?.document;
  if (!api || !("session" in api)) throw new Error("Open MilkO in the Orca desktop app with document-session support.");
  // Before the session exists, so these listeners run ahead of its own (see deliverPendingEdits).
  subscriptions.push(deliverPendingEdits(window.orca, api, () => { editor?.flush(); }, () => sync?.flush()));
  const session = await api.session<string>({
    debounceMs: 300,
    merge(base, outside, mine) {
      // A refused edit brings Orca here without an event first: deliver pending edits, so that
      // `mine` holds the newest keystroke.
      if (editor?.flush()) mine = session.value;
      const result = mergeConcurrentMarkdown(base, outside, mine);
      if (!result.ok) recover(mine, result.reason);
      mergedReplacement = result.markdown;
      return result.markdown;
    },
  });
  if (disposed) { session.dispose(); return; }
  let pending = false;
  let deliveryNotice = "";
  const updateDocumentStatus = () => { status.textContent = session.readOnly ? (pending ? "Read only · edits unconfirmed" : "Read only") : pending ? "Editing…" : "Ready"; };
  sync = new DocumentSync(session, {
    replace: (markdown) => {
      // Some Orca contexts use its Reload/Overwrite banner instead of calling merge. If a
      // replacement arrives after typing, retain the previous text before showing the outside file.
      // Pending edits normally reached the session before it chose this replacement. Any that did
      // not must not reach it now, where they would overwrite the replacement: keep them as a draft.
      let previous: string | undefined;
      withholdDelivery = true;
      try { previous = editor?.getSource(); } finally { withholdDelivery = false; }
      if (userEdited && previous !== undefined && previous !== markdown && mergedReplacement !== markdown) {
        recover(previous, "Outside content replaced an edited document. The previous draft was kept.");
      }
      userEdited = userEdited && mergedReplacement === markdown;
      mergedReplacement = undefined;
      editor?.replaceMarkdown(markdown);
    },
    state: (value) => {
      pending = value; updateDocumentStatus();
      if (!value && deliveryNotice) {
        if (drafts.persistent && notice.textContent === deliveryNotice) {
          notice.textContent = ""; notice.hidden = true; options.report("");
        }
        deliveryNotice = "";
      }
    },
    recover: (markdown, reason) => { recover(markdown, reason); deliveryNotice = notice.textContent ?? ""; },
  }, api);
  subscriptions.push(window.orca.on("theme", () => { applyAppearance(preferences); editor?.configure(preferences); }));
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== "milko.preferences.v1") return;
    preferences = readPreferences(storage);
    applyAppearance(preferences); editor?.configure(preferences); options.update(preferences);
  };
  window.addEventListener("storage", storageChanged);
  subscriptions.push({ dispose: () => window.removeEventListener("storage", storageChanged) });
  subscriptions.push(api.onDidChange(() => {
    sync?.accessChanged();
    editor?.setReadOnly(session.readOnly);
    updateDocumentStatus();
  }));
  editor = await mountEditor(root, session.value, {
    readOnly: session.readOnly,
    change: (markdown) => {
      userEdited = true;
      // Orca can destroy a frame on Reload/Source switching without a final pagehide. Keep one
      // exact checkpoint per editing session; a successful host flush does not prove a disk save.
      draftSession.checkpoint(markdown);
      if (!drafts.persistent) {
        showNotice("Recovery storage is unavailable. Copy or save the current recovery draft before closing this tab.");
        renderDrafts();
      }
      if (!withholdDelivery) sync?.change(markdown);
    },
    recover,
    notice: showNotice,
    preferences,
    addDictionaryWord: (word) => updatePreferences({ ...preferences, dictionary: [...new Set([...preferences.dictionary, word])] }),
    proofingStatus,
  });
  if (disposed) { await editor.destroy(); return; }
  // A document or read-only update may have arrived while Crepe was mounting.
  if (editor.getSource() !== session.value) editor.replaceMarkdown(session.value);
  editor.setReadOnly(session.readOnly);
  editor.configure(preferences);
  updateDocumentStatus();
}

root.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  const href = target.getAttribute("href") ?? "";
  if (href.startsWith("#")) {
    if (!editor?.navigate(href)) showNotice("No matching heading was found in this document.");
  } else if (/^https?:|^mailto:/i.test(href) && window.orca?.shell) {
    void window.orca.shell.openExternal(href).catch((error) => showNotice(String(error)));
  } else {
    showNotice("Project file links are not available yet. Open the target from Orca’s Explorer.");
  }
}, { capture: true });

window.addEventListener("pagehide", () => {
  editor?.flush(); // Pending edits reach the session, and its recovery below, before it closes.
  disposed = true;
  subscriptions.forEach((subscription) => subscription.dispose());
  sync?.dispose();
  options.dispose();
  shortcuts.dispose();
  dismissal.dispose();
  void editor?.destroy();
}, { once: true });

void start().catch((error) => {
  sync?.dispose();
  subscriptions.forEach((subscription) => subscription.dispose());
  status.textContent = "Could not open editor";
  showNotice(error instanceof Error ? error.message : String(error));
  console.error(error);
});
