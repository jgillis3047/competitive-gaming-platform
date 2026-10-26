-- Curated marketplace: sellers, products (gift cards + gear), orders
-- Sellers are approved by admin; only they can list products and receive orders.

CREATE TABLE IF NOT EXISTS "public"."sellers" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "business_name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "logo_url" text,
  "commission_percent" numeric(5,2) NOT NULL DEFAULT 10.00,
  "status" text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended')),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  UNIQUE("slug")
);
CREATE INDEX IF NOT EXISTS sellers_user_id_idx ON "public"."sellers"("user_id");
CREATE INDEX IF NOT EXISTS sellers_status_idx ON "public"."sellers"("status");

CREATE TABLE IF NOT EXISTS "public"."products" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "seller_id" uuid NOT NULL REFERENCES "public"."sellers"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "price_cents" integer NOT NULL CHECK (price_cents >= 0),
  "category" text NOT NULL DEFAULT 'gear' CHECK (category IN ('gift_card', 'gear', 'apparel', 'other')),
  "image_url" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS products_seller_id_idx ON "public"."products"("seller_id");
CREATE INDEX IF NOT EXISTS products_category_idx ON "public"."products"("category");
CREATE INDEX IF NOT EXISTS products_is_active_idx ON "public"."products"("is_active");

CREATE TABLE IF NOT EXISTS "public"."orders" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "public"."products"("id") ON DELETE RESTRICT,
  "seller_id" uuid NOT NULL REFERENCES "public"."sellers"("id") ON DELETE RESTRICT,
  "amount_cents" integer NOT NULL CHECK (amount_cents >= 0),
  "quantity" integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  "platform_fee_cents" integer NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
  "status" text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'fulfilled', 'refunded')),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON "public"."orders"("user_id");
CREATE INDEX IF NOT EXISTS orders_seller_id_idx ON "public"."orders"("seller_id");
CREATE INDEX IF NOT EXISTS orders_product_id_idx ON "public"."orders"("product_id");

-- Optional: sponsored challenges (seller sponsors a challenge; prize can be their product)
ALTER TABLE "public"."challenges" ADD COLUMN IF NOT EXISTS "sponsored_by_seller_id" uuid REFERENCES "public"."sellers"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS challenges_sponsored_by_seller_id_idx ON "public"."challenges"("sponsored_by_seller_id");

-- RLS: sellers (public can see approved only; seller can update own)
ALTER TABLE "public"."sellers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sellers_select" ON "public"."sellers";
CREATE POLICY "sellers_select" ON "public"."sellers" FOR SELECT TO "authenticated"
  USING (status = 'approved' OR user_id = auth.uid());
DROP POLICY IF EXISTS "sellers_insert" ON "public"."sellers";
CREATE POLICY "sellers_insert" ON "public"."sellers" FOR INSERT TO "authenticated"
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "sellers_update" ON "public"."sellers";
CREATE POLICY "sellers_update" ON "public"."sellers" FOR UPDATE TO "authenticated"
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS: products (public read active; seller CRUD own)
ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_select" ON "public"."products";
CREATE POLICY "products_select" ON "public"."products" FOR SELECT TO "authenticated"
  USING (
    is_active = true
    OR EXISTS (SELECT 1 FROM "public"."sellers" s WHERE s.id = products.seller_id AND s.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "products_insert" ON "public"."products";
CREATE POLICY "products_insert" ON "public"."products" FOR INSERT TO "authenticated"
  WITH CHECK (
    EXISTS (SELECT 1 FROM "public"."sellers" s WHERE s.id = products.seller_id AND s.user_id = auth.uid() AND s.status = 'approved')
  );
DROP POLICY IF EXISTS "products_update" ON "public"."products";
CREATE POLICY "products_update" ON "public"."products" FOR UPDATE TO "authenticated"
  USING (EXISTS (SELECT 1 FROM "public"."sellers" s WHERE s.id = products.seller_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM "public"."sellers" s WHERE s.id = products.seller_id AND s.user_id = auth.uid()));
DROP POLICY IF EXISTS "products_delete" ON "public"."products";
CREATE POLICY "products_delete" ON "public"."products" FOR DELETE TO "authenticated"
  USING (EXISTS (SELECT 1 FROM "public"."sellers" s WHERE s.id = products.seller_id AND s.user_id = auth.uid()));

-- RLS: orders (buyer sees own; seller sees own seller's orders)
ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders_select" ON "public"."orders";
CREATE POLICY "orders_select" ON "public"."orders" FOR SELECT TO "authenticated"
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM "public"."sellers" s WHERE s.id = orders.seller_id AND s.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "orders_insert" ON "public"."orders";
CREATE POLICY "orders_insert" ON "public"."orders" FOR INSERT TO "authenticated"
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "orders_update" ON "public"."orders";
CREATE POLICY "orders_update" ON "public"."orders" FOR UPDATE TO "authenticated"
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM "public"."sellers" s WHERE s.id = orders.seller_id AND s.user_id = auth.uid())
  )
  WITH CHECK (true);

GRANT ALL ON "public"."sellers" TO "authenticated";
GRANT ALL ON "public"."products" TO "authenticated";
GRANT ALL ON "public"."orders" TO "authenticated";
