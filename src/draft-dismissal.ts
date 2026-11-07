/** Bulk deletion is explicit, with Cancel focused by default and no document edits. */
export function installDraftDismissal() {
  const dialog = document.createElement("dialog");
  dialog.className = "milko-options milko-dismiss-drafts";
  dialog.setAttribute("aria-labelledby", "milko-dismiss-title");
  dialog.innerHTML = `
    <h2 id="milko-dismiss-title">Dismiss recovery drafts?</h2>
    <p data-dismiss-count></p>
    <p>Copy or save any drafts you still need. Dismissing deletes these recovery copies and cannot be undone. Your open document is kept.</p>
    <div class="dismiss-actions"><button type="button" data-cancel-dismiss autofocus>Cancel</button><button type="button" data-confirm-dismiss>Dismiss all</button></div>
  `;
  let confirm: (() => void) | undefined;
  dialog.querySelector("[data-cancel-dismiss]")!.addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-confirm-dismiss]")!.addEventListener("click", () => {
    const action = confirm; confirm = undefined;
    dialog.close(); action?.();
  });
  dialog.addEventListener("close", () => { confirm = undefined; });
  document.body.append(dialog);
  return {
    open(count: number, action: () => void) {
      if (dialog.open) return;
      confirm = action;
      dialog.querySelector("[data-dismiss-count]")!.textContent = `${count} saved ${count === 1 ? "draft will" : "drafts will"} be dismissed.`;
      dialog.showModal();
    },
    dispose() { confirm = undefined; dialog.remove(); },
  };
}
