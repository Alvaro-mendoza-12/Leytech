ALTER TABLE orders ADD COLUMN IF NOT EXISTS quote_id text REFERENCES quotes(id);
CREATE UNIQUE INDEX IF NOT EXISTS orders_quote_unique ON orders(quote_id) WHERE quote_id IS NOT NULL;
INSERT INTO schema_migrations(version) VALUES('002') ON CONFLICT DO NOTHING;
