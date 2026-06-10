# Junk Atelier Gallery Worker

Cloudflare Worker + D1 backend for the public scene gallery. Stores scenes as
the compact base64 strings the editor already produces (typically 1-10 KB).

## Setup

```sh
npm i
npx wrangler login
npx wrangler d1 create junk-gallery
```

Paste the `database_id` from the create command into `wrangler.toml`, then:

```sh
npm run schema   # applies schema.sql to the remote D1 database
npm run deploy
```

The deploy prints a `*.workers.dev` URL. Put it in the app's env as
`VITE_GALLERY_URL` so the editor knows where to fetch/post.

Local dev: `npm run dev` (CORS already allows `http://localhost:5173`).

## API

- `GET /api/gallery?limit=24&offset=0` → `{ entries: [{id, name, author, scene, createdAt}], total }`
- `POST /api/gallery` with `{name, author?, scene}` → `201 {ok: true, id}` (max 10 posts per IP per day)

## Moderation

Entries are never deleted via the API. To hide one:

```sh
npx wrangler d1 execute junk-gallery --remote --command "UPDATE entries SET hidden=1 WHERE id=..."
```
