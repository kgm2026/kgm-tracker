-- Add invoice attachment columns to material_purchases
ALTER TABLE material_purchases
  ADD COLUMN IF NOT EXISTS invoice_data TEXT,
  ADD COLUMN IF NOT EXISTS invoice_name TEXT;

-- Add budget_categories JSON column to projects (used by BudgetVsActual)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS budget_categories JSONB DEFAULT '{}'::jsonb;

-- Index for faster budget lookups
CREATE INDEX IF NOT EXISTS idx_projects_budget_categories ON projects USING GIN (budget_categories);
