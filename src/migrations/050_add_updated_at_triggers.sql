-- Migration 050: Add updated_at triggers for new tables

-- Drop existing triggers if any
DROP TRIGGER IF EXISTS update_visits_updated_at ON visits;
DROP TRIGGER IF EXISTS update_calls_updated_at ON calls;
DROP TRIGGER IF EXISTS update_releases_updated_at ON releases;

-- Create triggers
CREATE TRIGGER update_visits_updated_at BEFORE UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_releases_updated_at BEFORE UPDATE ON releases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
