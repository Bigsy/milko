import { normalizePreferences, type Preferences } from "./preferences";
import type { ProofingStatus } from "./proofing/types";
import { EDITOR_THEMES, MERMAID_THEMES } from "./themes";

export function installOptions(initial: Preferences, change: (value: Preferences) => void, notice: (message: string) => void) {
  let current = initial;
  const dialog = document.createElement("dialog");
  dialog.className = "milko-options";
  dialog.setAttribute("aria-labelledby", "milko-options-title");
  dialog.innerHTML = `
    <header><h2 id="milko-options-title">MilkO options</h2><button type="button" data-close aria-label="Close options">×</button></header>
    <p data-options-notice role="alert" hidden></p>
    <label>Appearance<select data-key="appearance"><option value="auto">Follow Orca</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
    <label>Editor theme<select data-key="editorTheme">${EDITOR_THEMES.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
    <label>Mermaid theme<select data-key="mermaidTheme">${MERMAID_THEMES.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
    <label>Text size<input data-key="fontSize" type="number" min="12" max="24" step="1"></label>
    <label class="check"><input data-key="wide" type="checkbox">Wide writing area</label>
    <fieldset><legend>Proofing</legend>
      <label class="check"><input data-key="proofingEnabled" type="checkbox">Check spelling and grammar with Harper</label>
      <p data-proofing-status role="status">Proofing on</p>
      <label>English dialect<select data-key="dialect"><option value="AUTO">Automatic</option><option value="BRITISH">British</option><option value="AMERICAN">American</option><option value="AUSTRALIAN">Australian</option><option value="CANADIAN">Canadian</option><option value="INDIAN">Indian</option></select></label>
      <label>Personal dictionary<textarea data-key="dictionary" rows="4" placeholder="One word per line" spellcheck="false"></textarea></label>
      <label>Import Weirpack<input data-key="weirpack" type="file" accept=".weirpack,.zip"></label>
      <ul data-packs></ul>
    </fieldset>
    <p class="options-help">Changes are saved automatically and apply to all MilkO documents.</p>
  `;
  const status = dialog.querySelector<HTMLElement>("[data-proofing-status]")!;
  const help = dialog.querySelector<HTMLElement>(".options-help")!;
  const list = dialog.querySelector<HTMLElement>("[data-packs]")!;

  function update(next: Partial<Preferences>) {
    current = normalizePreferences({ ...current, ...next });
    change(current);
  }
  function render() {
    for (const key of ["appearance", "editorTheme", "mermaidTheme", "fontSize", "wide", "proofingEnabled", "dialect", "dictionary"] as const) {
      const control = dialog.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-key="${key}"]`)!;
      if (control instanceof HTMLInputElement && control.type === "checkbox") control.checked = Boolean(current[key]);
      else control.value = key === "dictionary" ? current.dictionary.join("\n") : String(current[key]);
    }
    list.replaceChildren();
    current.weirpacks.forEach((pack, index) => {
      const item = document.createElement("li");
      item.textContent = pack.name + " ";
      const remove = document.createElement("button");
      remove.type = "button"; remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${pack.name}`);
      remove.onclick = () => { update({ weirpacks: current.weirpacks.filter((_, i) => i !== index) }); render(); };
      item.append(remove); list.append(item);
    });
  }
  dialog.querySelector("[data-close]")!.addEventListener("click", () => dialog.close());
  dialog.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement)) return;
    const key = input.dataset.key;
    if (key === "weirpack") return;
    if (key === "wide" || key === "proofingEnabled") update({ [key]: (input as HTMLInputElement).checked });
    else if (key === "fontSize") update({ fontSize: Number(input.value) });
    else if (key === "dictionary") update({ dictionary: input.value.split(/\r?\n/) });
    else if (key === "appearance" || key === "editorTheme" || key === "mermaidTheme" || key === "dialect") update({ [key]: input.value });
  });
  const packInput = dialog.querySelector<HTMLInputElement>("[data-key=weirpack]")!;
  packInput.onchange = () => {
    const file = packInput.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { notice("Choose a Weirpack smaller than 4 MB."); packInput.value = ""; return; }
    void file.arrayBuffer().then((buffer) => {
      if (buffer.byteLength > 4 * 1024 * 1024) throw new Error("Choose a Weirpack smaller than 4 MB.");
      const bytes = new Uint8Array(buffer);
      let raw = "";
      for (let i = 0; i < bytes.length; i += 32768) raw += String.fromCharCode(...bytes.subarray(i, i + 32768));
      update({ weirpacks: [...current.weirpacks, { name: file.name, data: btoa(raw) }] });
      render(); packInput.value = "";
    }).catch((error) => notice(String(error)));
  };
  document.body.append(dialog);
  render();
  return {
    open() { render(); dialog.showModal(); },
    update(value: Preferences) { current = value; if (!dialog.open) render(); },
    proofingStatus(value: ProofingStatus) {
      status.textContent = value === "error" ? "Proofing unavailable — see the message above the document." :
        value === "checking" || value === "initializing" ? "Checking…" : value === "disabled" ? "Proofing off" : "Proofing on";
    },
    persistence(saved: boolean) {
      help.textContent = saved ? "Changes are saved automatically and apply to all MilkO documents." :
        "Could not save these options. They apply to this tab only.";
    },
    report(message: string) {
      if (!dialog.open && message) return;
      const warning = dialog.querySelector<HTMLElement>("[data-options-notice]")!;
      warning.textContent = message; warning.hidden = message === "";
    },
    dispose() { dialog.remove(); },
  };
}
