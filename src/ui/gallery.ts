// Public gallery browser + submit flow. Shares the xp-dialog chrome from
// notify.ts styles; all data goes through gallery/api.ts.

import { listEntries, submitEntry, type GalleryEntry } from "../gallery/api";
import { formModal, toast } from "./notify";

export interface GalleryHooks {
  getScene: () => string;                // current scene, serialized
  loadScene: (entry: GalleryEntry) => void; // caller confirms the wipe + applies
}

export function openGallery(hooks: GalleryHooks): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const win = document.createElement("div");
  win.className = "xp-dialog form gallery";
  win.innerHTML = `
    <div class="xp-titlebar">
      <span class="xp-title">public gallery</span>
      <button class="xp-x" aria-label="Close">✕</button>
    </div>
    <div class="xp-body form-body"><div class="gallery-list"><p class="gallery-msg">loading…</p></div></div>
    <div class="xp-actions">
      <button class="xp-cancel">close</button>
      <button class="xp-ok">submit current scene</button>
    </div>`;
  overlay.appendChild(win);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("in"));

  const close = () => {
    overlay.classList.remove("in");
    overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
    setTimeout(() => overlay.remove(), 300);
    window.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  window.addEventListener("keydown", onKey);
  (win.querySelector(".xp-x") as HTMLButtonElement).addEventListener("click", close);
  (win.querySelector(".xp-cancel") as HTMLButtonElement).addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  (win.querySelector(".xp-ok") as HTMLButtonElement).addEventListener("click", () => {
    close();
    submitFlow(hooks.getScene());
  });

  const list = win.querySelector(".gallery-list") as HTMLElement;
  listEntries().then(({ entries }) => {
    list.innerHTML = "";
    if (entries.length === 0) {
      list.innerHTML = `<p class="gallery-msg">nothing here yet — be the first to submit.</p>`;
      return;
    }
    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "gallery-row";
      const meta = document.createElement("div");
      meta.className = "gallery-meta";
      const title = document.createElement("strong");
      title.textContent = entry.name;
      const by = document.createElement("span");
      by.textContent = `by ${entry.author} · ${new Date(entry.createdAt * 1000).toLocaleDateString()}`;
      meta.append(title, by);
      const load = document.createElement("button");
      load.className = "gallery-load";
      load.textContent = "load";
      load.addEventListener("click", () => { close(); hooks.loadScene(entry); });
      row.append(meta, load);
      list.appendChild(row);
    }
  }).catch(() => {
    list.innerHTML = `<p class="gallery-msg">couldn't reach the gallery. try again later.</p>`;
  });
}

async function submitFlow(scene: string): Promise<void> {
  const body = document.createElement("div");
  body.className = "welcome gallery-submit";
  body.innerHTML = `
    <p>submits the scene as it looks right now. imported media stays on your
       machine — other people will see a placeholder where it was.</p>
    <label>name<br><input id="g-name" maxlength="40" placeholder="my junk"></label>
    <label>author (optional)<br><input id="g-author" maxlength="24" placeholder="anonymous"></label>`;
  const nameEl = body.querySelector("#g-name") as HTMLInputElement;
  const authorEl = body.querySelector("#g-author") as HTMLInputElement;

  if (!(await formModal("submit to gallery", body, "submit", "cancel"))) return;
  const name = nameEl.value.trim();
  if (!name) { toast("needs a name", "warn"); return; }

  try {
    await submitEntry(name, authorEl.value.trim() || "anonymous", scene);
    toast("submitted — thanks!", "success");
  } catch (e) {
    toast((e as Error).message, "error");
  }
}
