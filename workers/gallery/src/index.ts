/**
 * Junk Atelier gallery API.
 *
 * A minimal Cloudflare Worker backed by D1 that stores publicly shared
 * pixel-art scenes (compact base64 strings produced by the editor).
 *
 * Routes:
 *   GET  /api/gallery?limit=&offset=  -> list visible entries, newest first
 *   POST /api/gallery                 -> submit a new entry
 */

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
}

const MAX_NAME_LENGTH = 40;
const MAX_AUTHOR_LENGTH = 24;
const MAX_SCENE_LENGTH = 16384;
const SCENE_PATTERN = /^[A-Za-z0-9+/=._~-]+$/;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;
const DAILY_SUBMISSION_LIMIT = 10;
const DEV_ORIGIN = "http://localhost:5173";

interface SubmissionBody {
  name?: unknown;
  author?: unknown;
  scene?: unknown;
  website?: unknown;
}

interface EntryRow {
  id: number;
  name: string;
  author: string;
  scene: string;
  created_at: number;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowlist = [env.ALLOWED_ORIGIN, DEV_ORIGIN];
  const allowed = origin && allowlist.includes(origin) ? origin : env.ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

async function handleList(url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const rawOffset = Number.parseInt(url.searchParams.get("offset") ?? "", 10);
  const limit = Number.isNaN(rawLimit) ? DEFAULT_LIMIT : Math.min(Math.max(rawLimit, 1), MAX_LIMIT);
  const offset = Number.isNaN(rawOffset) ? 0 : Math.max(rawOffset, 0);

  const [list, count] = await Promise.all([
    env.DB.prepare(
      "SELECT id, name, author, scene, created_at FROM entries WHERE hidden = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
      .bind(limit, offset)
      .all<EntryRow>(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM entries WHERE hidden = 0").first<{ total: number }>(),
  ]);

  const entries = (list.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    author: row.author,
    scene: row.scene,
    createdAt: row.created_at,
  }));

  return json({ entries, total: count?.total ?? 0 }, 200, cors);
}

async function handleSubmit(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  let body: SubmissionBody;
  try {
    body = await request.json<SubmissionBody>();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, cors);
  }

  // Honeypot: bots fill this in; pretend success but store nothing.
  if (typeof body.website === "string" && body.website.length > 0) {
    return json({ ok: true }, 200, cors);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    return json({ error: `Name must be 1-${MAX_NAME_LENGTH} characters` }, 400, cors);
  }

  let author = "anonymous";
  if (body.author !== undefined && body.author !== null) {
    if (typeof body.author !== "string" || body.author.trim().length > MAX_AUTHOR_LENGTH) {
      return json({ error: `Author must be at most ${MAX_AUTHOR_LENGTH} characters` }, 400, cors);
    }
    const trimmed = body.author.trim();
    if (trimmed.length > 0) {
      author = trimmed;
    }
  }

  const scene = typeof body.scene === "string" ? body.scene : "";
  if (scene.length < 1 || scene.length > MAX_SCENE_LENGTH || !SCENE_PATTERN.test(scene)) {
    return json({ error: "Invalid scene data" }, 400, cors);
  }

  // Rate limit: at most DAILY_SUBMISSION_LIMIT submissions per IP per UTC day.
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const ipHash = await hashIp(ip);
  const day = utcDay();

  const usage = await env.DB.prepare("SELECT count FROM rate WHERE ip_hash = ? AND day = ?")
    .bind(ipHash, day)
    .first<{ count: number }>();

  if ((usage?.count ?? 0) >= DAILY_SUBMISSION_LIMIT) {
    return json({ error: "Daily submission limit reached, try again tomorrow" }, 429, cors);
  }

  await env.DB.prepare(
    "INSERT INTO rate (ip_hash, day, count) VALUES (?, ?, 1) ON CONFLICT(ip_hash, day) DO UPDATE SET count = count + 1"
  )
    .bind(ipHash, day)
    .run();

  const createdAt = Math.floor(Date.now() / 1000);
  const inserted = await env.DB.prepare(
    "INSERT INTO entries (name, author, scene, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind(name, author, scene, createdAt)
    .run();

  return json({ ok: true, id: inserted.meta.last_row_id }, 201, cors);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const url = new URL(request.url);

      if (url.pathname === "/api/gallery") {
        if (request.method === "GET") {
          return await handleList(url, env, cors);
        }
        if (request.method === "POST") {
          return await handleSubmit(request, env, cors);
        }
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      console.error("Unhandled error:", err);
      return json({ error: "Internal server error" }, 500, cors);
    }
  },
};
