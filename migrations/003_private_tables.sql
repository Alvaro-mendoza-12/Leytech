DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['schema_migrations','settings','categories','products','variants','admins','sessions','rate_limits','quotes','orders','order_items','payments','payment_events','stock_movements','audit_log','claims']
 LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',table_name); END IF;
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated',table_name); END IF;
 END LOOP;
END $$;
INSERT INTO schema_migrations(version) VALUES('003') ON CONFLICT DO NOTHING;
