-- Junk Atelier gallery schema.
-- Apply with: wrangler d1 execute junk-gallery --file=./schema.sql --remote

CREATE TABLE IF NOT EXISTS entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL CHECK (length(name) <= 40),
  author     TEXT    NOT NULL DEFAULT 'anonymous' CHECK (length(author) <= 24),
  scene      TEXT    NOT NULL CHECK (length(scene) <= 16384),
  created_at INTEGER NOT NULL, -- unix seconds
  hidden     INTEGER NOT NULL DEFAULT 0 -- moderation flag
);

CREATE TABLE IF NOT EXISTS rate (
  ip_hash TEXT    NOT NULL,
  day     TEXT    NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day)
);

CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries (created_at);
