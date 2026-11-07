const groups = [
  ["Writing", [
    ["Save", ["Mod", "S"]], ["Undo", ["Mod", "Z"]], ["Redo", ["Mod", "Shift", "Z"]],
    ["Line break", ["Shift", "Enter"]],
  ]],
  ["Find and navigate", [
    ["Find and replace", ["Mod", "F"]], ["Toggle outline", ["Mod", "Shift", "O"]],
    ["Next match in Find", ["Enter"]], ["Previous match in Find", ["Shift", "Enter"]],
  ]],
  ["Formatting", [
    ["Bold", ["Mod", "B"]], ["Italic", ["Mod", "I"]], ["Inline code", ["Mod", "E"]],
    ["Strikethrough", ["Mod", "Alt", "X"]], ["Blockquote", ["Mod", "Shift", "B"]],
  ]],
  ["Blocks and lists", [
    ["Heading 1–6", ["Mod", "Alt", "1–6"]], ["Paragraph", ["Mod", "Alt", "0"]],
    ["Code block", ["Mod", "Alt", "C"]], ["Bullet list", ["Mod", "Alt", "8"]],
    ["Numbered list", ["Mod", "Alt", "7"]], ["Indent list item", ["Tab"]],
    ["Outdent list item", ["Shift", "Tab"]], ["Leave code block", ["Mod", "Enter"]],
  ]],
] as const;

/** Reference for the installed Crepe keymaps and MilkO's existing navigation controls. */
export function installShortcuts(platform = navigator.platform) {
  const mac = /Mac|iPhone|iPad/i.test(platform);
  const keyName = (key: string) => key === "Mod" ? (mac ? "⌘" : "Ctrl") : key === "Alt" && mac ? "Option" : key;
  const dialog = document.createElement("dialog");
  dialog.className = "milko-shortcuts";
  dialog.setAttribute("aria-labelledby", "milko-shortcuts-title");
  dialog.innerHTML = `
    <header><h2 id="milko-shortcuts-title">Keyboard shortcuts</h2><button type="button" aria-label="Close shortcuts">×</button></header>
    <p class="shortcuts-help">${mac ? "⌘ is the Command key." : "Use the Ctrl key for these shortcuts."} Formatting shortcuts apply in prose; code blocks use code editor behaviour.</p>
    <div class="shortcuts-grid">${groups.map(([title, shortcuts]) => `
      <section><h3>${title}</h3><table><tbody>${shortcuts.map(([label, keys]) => `
        <tr><th scope="row">${label}</th><td>${keys.map((key) => `<kbd>${keyName(key)}</kbd>`).join(" + ")}</td></tr>
      `).join("")}</tbody></table></section>
    `).join("")}</div>
    <p class="shortcuts-help">Press Esc or use the close button to return to your document.</p>
  `;
  dialog.querySelector("button")!.addEventListener("click", () => dialog.close());
  document.body.append(dialog);
  return { open() { if (!dialog.open) dialog.showModal(); }, dispose() { dialog.remove(); } };
}
