/*
  # Big Data News Analytics Schema Expansion
  
  1. Table Alterations: `news_articles`
    - `description` (text) — excerpt or description of article
    - `author` (text) — article author if provided
    - `country` (text) — source country
    - `language` (text) — article language
    - `image_url` (text) — lead image URL
    - `provider` (text) — GDELT, GNews, The Guardian, RSS, Import, Synthetic
    - `canonical_url` (text) — cleaned URL without UTM params
    - `quality_score` (integer) — calculated data veracity score (0-100)
    - `is_synthetic` (boolean) — flag to separate stress test synthetic data from real news
    - `event_cluster_id` (text) — NLP cluster group id
    - `raw_data` (jsonb) — full raw API response payload
    
  2. New Tables:
    - `pipeline_jobs`
      - `id` (uuid, primary key)
      - `provider` (text, not null)
      - `fetched_count` (integer, default 0)
      - `inserted_count` (integer, default 0)
      - `skipped_count` (integer, default 0)
      - `rejected_count` (integer, default 0)
      - `duration_ms` (integer, default 0)
      - `status` (text, not null)
      - `created_at` (timestamptz, default now())

    - `data_quality_logs`
      - `id` (uuid, primary key)
      - `total_evaluated` (integer)
      - `valid_count` (integer)
      - `duplicate_count` (integer)
      - `malformed_count` (integer)
      - `average_score` (integer)
      - `quality_grade` (text)
      - `created_at` (timestamptz, default now())
      
  3. Indexes:
    - Index on `canonical_url` for deduplication lookup
    - Index on `provider` for provider analytics
    - Index on `is_synthetic` for dataset isolation
    - Index on `quality_score` for veracity filtering
*/

ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS author text;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS language text DEFAULT 'en';
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS provider text DEFAULT 'RSS';
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS canonical_url text;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS quality_score integer DEFAULT 85;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS is_synthetic boolean DEFAULT false;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS event_cluster_id text;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS raw_data jsonb;

CREATE INDEX IF NOT EXISTS idx_news_articles_provider ON news_articles (provider);
CREATE INDEX IF NOT EXISTS idx_news_articles_is_synthetic ON news_articles (is_synthetic);
CREATE INDEX IF NOT EXISTS idx_news_articles_quality_score ON news_articles (quality_score);
CREATE INDEX IF NOT EXISTS idx_news_articles_canonical_url ON news_articles (canonical_url);

-- Pipeline Job Tracking Table
CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  fetched_count integer DEFAULT 0,
  inserted_count integer DEFAULT 0,
  skipped_count integer DEFAULT 0,
  rejected_count integer DEFAULT 0,
  duration_ms integer DEFAULT 0,
  status text NOT NULL CHECK (status IN ('SUCCESS', 'PARTIAL', 'FAILED')),
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_created_at ON pipeline_jobs (created_at DESC);

-- Data Quality Audit Logs Table
CREATE TABLE IF NOT EXISTS data_quality_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_evaluated integer NOT NULL,
  valid_count integer NOT NULL,
  duplicate_count integer NOT NULL,
  malformed_count integer NOT NULL,
  average_score integer NOT NULL,
  quality_grade text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS Policies
ALTER TABLE pipeline_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_quality_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_jobs" ON pipeline_jobs;
CREATE POLICY "anon_select_jobs" ON pipeline_jobs FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_jobs" ON pipeline_jobs;
CREATE POLICY "anon_insert_jobs" ON pipeline_jobs FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_quality" ON data_quality_logs;
CREATE POLICY "anon_select_quality" ON data_quality_logs FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_quality" ON data_quality_logs;
CREATE POLICY "anon_insert_quality" ON data_quality_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
