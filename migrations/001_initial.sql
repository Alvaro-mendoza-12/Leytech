CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS settings (id text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS categories (id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE, icon text NOT NULL DEFAULT 'Monitor', parent_id text REFERENCES categories(id), active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS products (
 id text PRIMARY KEY, slug text NOT NULL UNIQUE, name text NOT NULL, brand text NOT NULL,
 category_id text NOT NULL REFERENCES categories(id), summary text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
 specifications jsonb NOT NULL DEFAULT '{}', images jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 type text NOT NULL DEFAULT 'physical' CHECK(type IN ('physical','digital')), warranty text NOT NULL DEFAULT '',
 featured boolean NOT NULL DEFAULT false, is_demo boolean NOT NULL DEFAULT false,
 seo_title text NOT NULL DEFAULT '', seo_description text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS variants (
 id text PRIMARY KEY, product_id text NOT NULL REFERENCES products(id), sku text NOT NULL UNIQUE,
 name text NOT NULL, color text NOT NULL DEFAULT '', color_hex text NOT NULL DEFAULT '#202833',
 attributes jsonb NOT NULL DEFAULT '{}', image text NOT NULL DEFAULT '',
 price integer NOT NULL CHECK(price > 0 AND price <= 100000000), compare_at integer CHECK(compare_at IS NULL OR compare_at > price),
 stock integer NOT NULL DEFAULT 0 CHECK(stock >= 0), reserved integer NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= stock),
 active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS product_category_idx ON products(category_id, status);
CREATE INDEX IF NOT EXISTS variant_product_idx ON variants(product_id);
CREATE TABLE IF NOT EXISTS admins (id text PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL, role text NOT NULL DEFAULT 'owner' CHECK(role IN ('owner','staff')), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, admin_id text NOT NULL REFERENCES admins(id), expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS session_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 1, resets_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS quotes (
 id text PRIMARY KEY, code bigserial UNIQUE, items jsonb NOT NULL, subtotal integer NOT NULL CHECK(subtotal > 0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','contacted','closed')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
 id text PRIMARY KEY, code bigserial UNIQUE, public_token text NOT NULL UNIQUE, idempotency_key text NOT NULL UNIQUE,
 customer jsonb NOT NULL, items jsonb NOT NULL, subtotal integer NOT NULL CHECK(subtotal > 0), shipping integer NOT NULL CHECK(shipping >= 0),
 total integer NOT NULL CHECK(total = subtotal + shipping), method text NOT NULL CHECK(method IN ('coordinate','transfer','mercadopago')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled','expired','review','refunded')),
 fulfillment text NOT NULL DEFAULT 'unfulfilled' CHECK(fulfillment IN ('unfulfilled','preparing','shipped','delivered')),
 is_demo boolean NOT NULL DEFAULT false, preference_id text, payment_url text, stock_committed boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_items (order_id text NOT NULL REFERENCES orders(id), variant_id text NOT NULL REFERENCES variants(id), quantity integer NOT NULL CHECK(quantity > 0), unit_price integer NOT NULL CHECK(unit_price > 0), PRIMARY KEY(order_id,variant_id));
CREATE INDEX IF NOT EXISTS order_status_idx ON orders(status, expires_at);
CREATE TABLE IF NOT EXISTS payments (provider_id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id), status text NOT NULL, amount integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS payment_events (id text PRIMARY KEY, provider_id text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS stock_movements (id text PRIMARY KEY, variant_id text NOT NULL REFERENCES variants(id), delta integer NOT NULL, reason text NOT NULL, admin_id text REFERENCES admins(id), order_id text REFERENCES orders(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS audit_log (id text PRIMARY KEY, admin_id text REFERENCES admins(id), action text NOT NULL, entity_id text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS claims (id text PRIMARY KEY, code bigserial UNIQUE, customer jsonb NOT NULL, type text NOT NULL CHECK(type IN ('reclamo','queja')), description text NOT NULL, request text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved')), created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES ('001') ON CONFLICT DO NOTHING;
