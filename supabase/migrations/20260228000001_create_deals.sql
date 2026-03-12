-- Deals, Coupons, and Special Offers (US-043)
-- Dedicated deals section for restaurants, attractions, hotels, and activities

CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  business_name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('restaurant', 'attraction', 'hotel', 'event', 'activity')),
  entity_id UUID,
  deal_type TEXT NOT NULL CHECK (deal_type IN ('percentage', 'dollar_off', 'bogo', 'free_item', 'package')),
  discount_value TEXT,
  code TEXT,
  terms TEXT,
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date TIMESTAMPTZ,
  image_url TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  redemption_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX idx_deals_entity_type ON deals(entity_type);
CREATE INDEX idx_deals_end_date ON deals(end_date) WHERE end_date IS NOT NULL;
CREATE INDEX idx_deals_featured ON deals(is_featured) WHERE is_featured = true;
CREATE INDEX idx_deals_active ON deals(start_date, end_date);

-- RLS
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public read for active deals" ON deals FOR SELECT
    USING (start_date <= now() AND (end_date IS NULL OR end_date >= now()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Business owners and admins can insert deals" ON deals FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage all deals" ON deals FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed sample deals
INSERT INTO deals (title, business_name, entity_type, deal_type, discount_value, terms, start_date, end_date, is_verified, is_featured, description) VALUES
(
  '20% Off Weekend Brunch',
  'Kitchen Collective',
  'restaurant',
  'percentage',
  '20%',
  'Valid Saturday & Sunday before 2 PM. Cannot be combined with other offers.',
  now(),
  now() + interval '30 days',
  true,
  true,
  'Enjoy 20% off your entire brunch bill this month at Kitchen Collective in the East Village.'
),
(
  'Buy 1 Get 1 Free Craft Beer',
  'Confluence Brewing Company',
  'restaurant',
  'bogo',
  'BOGO pint',
  'Valid Tuesday-Thursday. One per customer per visit.',
  now(),
  now() + interval '21 days',
  true,
  false,
  'Buy one pint, get one free at Confluence Brewing on weeknight visits.'
),
(
  '$5 Off Admission',
  'Science Center of Iowa',
  'attraction',
  'dollar_off',
  '$5',
  'Present this offer at the ticket counter. Cannot combine with other discounts.',
  now(),
  now() + interval '60 days',
  true,
  true,
  'Save $5 on general admission to the Science Center of Iowa, including exhibits and planetarium.'
),
(
  'Free Dessert with Entree',
  'Centro',
  'restaurant',
  'free_item',
  'Free dessert',
  'Order any entree and receive a complimentary dessert. Dine-in only.',
  now(),
  now() + interval '14 days',
  true,
  false,
  'Complimentary dessert with any entree purchase at Centro downtown.'
),
(
  'Date Night Package - $99',
  'Hotel Fort Des Moines',
  'hotel',
  'package',
  '$99 package',
  'Includes overnight stay, breakfast for two, and late checkout. Subject to availability.',
  now(),
  now() + interval '45 days',
  true,
  true,
  'Romantic date night package at Hotel Fort Des Moines: overnight stay, breakfast, and late checkout for $99.'
)
ON CONFLICT DO NOTHING;
