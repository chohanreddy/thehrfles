-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  industry TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('Interview Process', 'Responsiveness', 'Offer Stage', 'Overall HR')),
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  role TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Interview candidate', 'Offer recipient', 'Former employee', 'Current employee')),
  rating NUMERIC(2,1) NOT NULL CHECK (rating >= 1.0 AND rating <= 5.0),
  verified BOOLEAN DEFAULT FALSE,
  flags INTEGER DEFAULT 0,
  upvotes INTEGER DEFAULT 0,
  date TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_reviews_company_id ON reviews(company_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(date DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_flags ON reviews(flags DESC);

-- Enable Row Level Security
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Companies: anyone can read, nobody can write directly
CREATE POLICY "companies_select" ON companies FOR SELECT USING (true);

-- Reviews: anyone can read, nobody can write directly (all writes go through Express)
CREATE POLICY "reviews_select" ON reviews FOR SELECT USING (true);
