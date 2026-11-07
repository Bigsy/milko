/** User-gesture clipboard action, with a fallback for desktop frame clipboard permissions. */
export async function copyCode(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch { /* Try the desktop document's copy action. */ }
  const active = document.activeElement;
  const input = document.createElement("textarea");
  input.value = text;
  input.style.cssText = "position:fixed;left:-10000px;top:0";
  input.setAttribute("aria-hidden", "true");
  document.body.append(input);
  try {
    input.select();
    if (typeof document.execCommand !== "function" || !document.execCommand("copy")) {
      throw new Error("Clipboard access was refused. Select the code and use Cmd/Ctrl+C.");
    }
  } finally {
    input.remove();
    if (active instanceof HTMLElement) active.focus();
  }
}
