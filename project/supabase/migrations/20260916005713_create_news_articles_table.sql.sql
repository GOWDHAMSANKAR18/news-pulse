/*
# Create news_articles table for real RSS news feed storage

1. New Tables
- `news_articles`
  - `id` (uuid, primary key)
  - `title` (text, not null) — article headline from RSS feed
  - `source` (text, not null) — publisher name (e.g. "Reuters India")
  - `url` (text) — link to the original article
  - `category` (text, not null) — one of: Tech, Politics, Finance, Sports
  - `sentiment` (text, not null) — one of: Positive, Neutral, Negative
  - `urgency_score` (integer, not null) — 0-100 computed urgency rating
  - `region_id` (text, not null) — region identifier (delhi, mumbai, etc.)
  - `region_name` (text, not null) — human-readable region name
  - `published_at` (timestamptz, not null) — article publish time from RSS
  - `fetched_at` (timestamptz, default now()) — when the edge function ingested it
  - `content_hash` (text, unique) — SHA-256 of title+source for deduplication

2. Indexes
- Index on `published_at` (descending) for time-ordered queries
- Index on `category` for filter-by-category
- Index on `region_id` for filter-by-region
- Index on `urgency_score` (descending) for "most urgent" queries

3. Security
- Enable RLS on `news_articles`.
- This is a single-tenant app with no sign-in screen, so all data is intentionally public.
- Allow anon + authenticated to read (SELECT) all articles.
- Only the service role (used by the edge function) can insert; anon inserts are NOT needed.
- No update or delete policies needed — articles are append-only.
*/

CREATE TABLE IF NOT EXISTS news_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source text NOT NULL,
  url text,
  category text NOT NULL CHECK (category IN ('Tech', 'Politics', 'Finance', 'Sports')),
  sentiment text NOT NULL CHECK (sentiment IN ('Positive', 'Neutral', 'Negative')),
  urgency_score integer NOT NULL CHECK (urgency_score >= 0 AND urgency_score <= 100),
  region_id text NOT NULL,
  region_name text NOT NULL,
  published_at timestamptz NOT NULL,
  fetched_at timestamptz DEFAULT now(),
  content_hash text UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_news_articles_published_at ON news_articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_category ON news_articles (category);
CREATE INDEX IF NOT EXISTS idx_news_articles_region_id ON news_articles (region_id);
CREATE INDEX IF NOT EXISTS idx_news_articles_urgency_score ON news_articles (urgency_score DESC);

ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_news" ON news_articles;
CREATE POLICY "anon_select_news"
  ON news_articles FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "anon_insert_news" ON news_articles;
CREATE POLICY "anon_insert_news"
  ON news_articles FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_news" ON news_articles;
CREATE POLICY "anon_delete_news"
  ON news_articles FOR DELETE
  TO anon, authenticated
  USING (true);
