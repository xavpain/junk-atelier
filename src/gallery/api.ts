// Client for the public gallery Worker (see workers/gallery/). The endpoint is
// injected at build time; without it the gallery UI stays hidden and the app
// remains fully static.

const BASE = (import.meta.env.VITE_GALLERY_URL as string | undefined)?.replace(/\/$/, "");

export const galleryEnabled = !!BASE;

export interface GalleryEntry {
  id: number;
  name: string;
  author: string;
  scene: string;     // serialized scene, same format as share-link hashes
  createdAt: number; // unix seconds
}

export async function listEntries(limit = 24, offset = 0): Promise<{ entries: GalleryEntry[]; total: number }> {
  const res = await fetch(`${BASE}/api/gallery?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(`gallery fetch failed (${res.status})`);
  return res.json();
}

export async function submitEntry(name: string, author: string, scene: string): Promise<void> {
  const res = await fetch(`${BASE}/api/gallery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, author, scene }),
  });
  if (res.status === 429) throw new Error("easy there — submission limit reached for today.");
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `submit failed (${res.status})`);
  }
}
