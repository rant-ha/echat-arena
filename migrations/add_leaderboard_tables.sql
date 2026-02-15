-- Strategy Rankings table
CREATE TABLE IF NOT EXISTS strategy_rankings (
  id BIGSERIAL PRIMARY KEY,
  strategy_name TEXT UNIQUE NOT NULL,
  rating REAL DEFAULT 1000.0,
  uncertainty REAL DEFAULT 350.0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  total_battles INTEGER DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ranking History (daily snapshots for trend charts)
CREATE TABLE IF NOT EXISTS ranking_history (
  id BIGSERIAL PRIMARY KEY,
  strategy_name TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  rating REAL DEFAULT 1000.0,
  uncertainty REAL DEFAULT 350.0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  total_battles INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(strategy_name, snapshot_date)
);

-- RLS: service_role only
ALTER TABLE strategy_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_strategy_rankings" ON strategy_rankings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_ranking_history" ON ranking_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Index for range queries on snapshot_date
CREATE INDEX IF NOT EXISTS idx_ranking_history_snapshot_date
  ON ranking_history(snapshot_date);

-- Seed data
INSERT INTO strategy_rankings (strategy_name, rating, uncertainty)
VALUES ('baseline', 1000.0, 350.0), ('empathy', 1000.0, 350.0)
ON CONFLICT (strategy_name) DO NOTHING;
