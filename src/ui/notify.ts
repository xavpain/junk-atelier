// Retro/XP-flavoured notifications: transient toasts + modal dialogs.
// No deps; everything is DOM + CSS classes defined in style.css.

type Kind = "info" | "success" | "error" | "warn";

const ICON: Record<Kind, string> = { info: "ℹ", success: "✔", error: "✕", warn: "⚠" };

function toastLayer(): HTMLElement {
  let l = document.getElementById("toasts");
  if (!l) {
    l = document.createElement("div");
    l.id = "toasts";
    document.body.appendChild(l);
  }
  return l;
}

export function toast(message: string, kind: Kind = "info", ms = 2600): void {
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.innerHTML = `<span class="toast-ico">${ICON[kind]}</span><span class="toast-msg"></span>`;
  (t.querySelector(".toast-msg") as HTMLElement).textContent = message;
  toastLayer().appendChild(t);
  // enter
  requestAnimationFrame(() => t.classList.add("in"));
  const close = () => {
    t.classList.remove("in");
    t.addEventListener("transitionend", () => t.remove(), { once: true });
    setTimeout(() => t.remove(), 400); // fallback
  };
  t.addEventListener("click", close);
  setTimeout(close, ms);
}

// XP-style modal dialog. Resolves when dismissed.
export function dialog(title: string, message: string, kind: Kind = "error"): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const win = document.createElement("div");
    win.className = `xp-dialog ${kind}`;
    win.innerHTML = `
      <div class="xp-titlebar">
        <span class="xp-title">${esc(title)}</span>
        <button class="xp-x" aria-label="Close">✕</button>
      </div>
      <div class="xp-body">
        <div class="xp-ico">${ICON[kind]}</div>
        <div class="xp-text"></div>
      </div>
      <div class="xp-actions"><button class="xp-ok">OK</button></div>`;
    (win.querySelector(".xp-text") as HTMLElement).textContent = message;
    overlay.appendChild(win);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("in"));

    const done = () => {
      overlay.classList.remove("in");
      overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
      setTimeout(() => overlay.remove(), 300);
      window.removeEventListener("keydown", onKey);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") done(); };
    window.addEventListener("keydown", onKey);
    (win.querySelector(".xp-ok") as HTMLButtonElement).addEventListener("click", done);
    (win.querySelector(".xp-x") as HTMLButtonElement).addEventListener("click", done);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) done(); });
    (win.querySelector(".xp-ok") as HTMLButtonElement).focus();
  });
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
