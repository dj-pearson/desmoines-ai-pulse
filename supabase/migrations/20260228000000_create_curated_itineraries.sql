-- Curated Editorial Itineraries (US-042)
-- Pre-built themed itineraries with printable checklists for visitors

CREATE TABLE IF NOT EXISTS curated_itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  duration TEXT NOT NULL CHECK (duration IN ('half-day', 'full-day', 'weekend', '3-day')),
  theme TEXT NOT NULL CHECK (theme IN ('romance', 'family', 'adventure', 'food-drink', 'arts-culture', 'sports', 'general')),
  cover_image TEXT,
  stops JSONB NOT NULL DEFAULT '[]'::jsonb,
  seo_title TEXT,
  seo_description TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_curated_itineraries_theme ON curated_itineraries(theme);
CREATE INDEX idx_curated_itineraries_duration ON curated_itineraries(duration);
CREATE INDEX idx_curated_itineraries_published ON curated_itineraries(is_published) WHERE is_published = true;

-- RLS
ALTER TABLE curated_itineraries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public read for published itineraries"
    ON curated_itineraries FOR SELECT USING (is_published = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage itineraries"
    ON curated_itineraries FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Auto-update updated_at
DROP TRIGGER IF EXISTS update_curated_itineraries_updated_at ON curated_itineraries;
CREATE TRIGGER update_curated_itineraries_updated_at
  BEFORE UPDATE ON curated_itineraries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed data: 6 curated itineraries
INSERT INTO curated_itineraries (title, slug, description, duration, theme, is_published, stops, seo_title, seo_description) VALUES
(
  'Quintessential Weekend Getaway',
  'weekend-getaway',
  'The perfect 2-day itinerary to experience the best of Des Moines — from the Pappajohn Sculpture Park to the East Village food scene.',
  'weekend',
  'general',
  true,
  '[
    {"order":1,"entity_type":"attraction","name":"Pappajohn Sculpture Park","description":"Start your morning with a stroll through this world-class outdoor sculpture garden featuring 30+ works.","time_suggestion":"9:00 AM","tips":"Free admission. Best lighting for photos before 10 AM."},
    {"order":2,"entity_type":"restaurant","name":"Scenic Route Bakery","description":"Grab a legendary cinnamon roll and coffee at this East Village staple.","time_suggestion":"10:30 AM","tips":"Get there early — cinnamon rolls sell out by noon on weekends."},
    {"order":3,"entity_type":"attraction","name":"Des Moines Art Center","description":"Explore three distinct buildings by Eliel Saarinen, I.M. Pei, and Richard Meier.","time_suggestion":"12:00 PM","tips":"Free admission. The Pei wing has an excellent contemporary collection."},
    {"order":4,"entity_type":"restaurant","name":"Centro","description":"Italian fine dining in the heart of downtown for dinner.","time_suggestion":"6:30 PM","tips":"Reservations recommended, especially Friday and Saturday."},
    {"order":5,"entity_type":"attraction","name":"Court Avenue District","description":"Explore the nightlife scene along Court Avenue.","time_suggestion":"8:30 PM","tips":"Start at El Bait Shop for one of the largest craft beer selections in the Midwest."},
    {"order":6,"entity_type":"attraction","name":"Downtown Farmers Market","description":"Saturday morning: browse 300+ vendors at the largest farmers market in the Midwest (May–October).","time_suggestion":"8:00 AM","tips":"Arrive early for parking. Bring a reusable bag."},
    {"order":7,"entity_type":"attraction","name":"Science Center of Iowa","description":"Interactive exhibits for all ages, plus an IMAX theater.","time_suggestion":"11:00 AM","tips":"Check the planetarium show schedule online before visiting."},
    {"order":8,"entity_type":"restaurant","name":"Zombie Burger + Drink Lab","description":"End the weekend with inventive burgers and milkshakes.","time_suggestion":"1:00 PM","tips":"Try the Walking Ched (fried mac & cheese bun) — it is worth the hype."}
  ]'::jsonb,
  'Des Moines Weekend Getaway Itinerary — 2-Day Plan',
  'Plan the perfect weekend in Des Moines with our curated 2-day itinerary featuring top attractions, restaurants, and insider tips.'
),
(
  'Perfect Date Day',
  'date-day',
  'A romantic day exploring Des Moines with your special someone — art, cocktails, and a sunset stroll along the river.',
  'full-day',
  'romance',
  true,
  '[
    {"order":1,"entity_type":"restaurant","name":"Kitchen Collective","description":"Start with brunch at this chef-driven East Village spot.","time_suggestion":"10:00 AM","tips":"Share the seasonal bruschetta board."},
    {"order":2,"entity_type":"attraction","name":"Greater Des Moines Botanical Garden","description":"Wander through lush conservatory gardens and outdoor spaces.","time_suggestion":"12:00 PM","tips":"The seasonal exhibits change quarterly — check what is on display."},
    {"order":3,"entity_type":"attraction","name":"East Village Shopping","description":"Browse boutiques and galleries in the colorful East Village district.","time_suggestion":"2:00 PM","tips":"Don't miss Raygun for Iowa-themed gifts."},
    {"order":4,"entity_type":"restaurant","name":"Hello, Marjorie","description":"Pre-dinner craft cocktails at this acclaimed bar.","time_suggestion":"5:00 PM","tips":"Try the seasonal cocktail menu — always creative."},
    {"order":5,"entity_type":"attraction","name":"Gray''s Lake Park","description":"Sunset walk around the lake on the illuminated bridge.","time_suggestion":"7:00 PM","tips":"The pedestrian bridge lights up at dusk — gorgeous for photos."},
    {"order":6,"entity_type":"restaurant","name":"Harbinger","description":"End with a memorable farm-to-table tasting menu dinner.","time_suggestion":"8:00 PM","tips":"Reservations essential. The tasting menu changes weekly."}
  ]'::jsonb,
  'Romantic Date Day in Des Moines — Curated Itinerary',
  'Plan the perfect date day in Des Moines with brunch, gardens, cocktails, and fine dining. Curated by locals.'
),
(
  'Family Fun Day',
  'family-fun',
  'A full day of kid-friendly adventures that parents will love too — science, animals, and giant ice cream sundaes.',
  'full-day',
  'family',
  true,
  '[
    {"order":1,"entity_type":"attraction","name":"Science Center of Iowa","description":"Interactive exhibits, a planetarium, and an IMAX theater — kids will not want to leave.","time_suggestion":"9:30 AM","tips":"Start with the Star Theater show, then explore exhibits."},
    {"order":2,"entity_type":"restaurant","name":"Fong''s Pizza","description":"Lunch at the famous crab rangoon pizza spot.","time_suggestion":"12:00 PM","tips":"Yes, crab rangoon pizza is a real thing and kids love it."},
    {"order":3,"entity_type":"attraction","name":"Blank Park Zoo","description":"See 100+ species including giraffes, penguins, and red pandas.","time_suggestion":"1:30 PM","tips":"The Discovery Center has hands-on activities for younger kids."},
    {"order":4,"entity_type":"attraction","name":"Ewing Park Playground","description":"Let the kids burn off energy at this popular playground.","time_suggestion":"4:00 PM","tips":"Shaded areas for parents to relax while kids play."},
    {"order":5,"entity_type":"restaurant","name":"Bauder Pharmacy","description":"End the day with old-fashioned ice cream sodas and sundaes.","time_suggestion":"5:30 PM","tips":"Operating since 1927 — a Des Moines institution."}
  ]'::jsonb,
  'Family Fun Day in Des Moines — Kid-Friendly Itinerary',
  'Plan a perfect family day in Des Moines with science, zoo, playgrounds, and ice cream. Fun for all ages.'
),
(
  'Craft Beer Trail',
  'craft-beer-trail',
  'Hit the best breweries in Des Moines in one epic day — from IPAs to stouts, this trail has it all.',
  'full-day',
  'food-drink',
  true,
  '[
    {"order":1,"entity_type":"restaurant","name":"Confluence Brewing Company","description":"Start the trail at Des Moines'' original craft brewery.","time_suggestion":"12:00 PM","tips":"Try the Des Moines IPA — their flagship. Food trucks on weekends."},
    {"order":2,"entity_type":"restaurant","name":"Exile Brewing Company","description":"Award-winning beers in a spacious downtown taproom.","time_suggestion":"2:00 PM","tips":"The Ruthie is a local favorite Belgian Golden Strong."},
    {"order":3,"entity_type":"restaurant","name":"Peace Tree Brewing","description":"Knoxville-based brewery with a growing Des Moines following.","time_suggestion":"3:30 PM","tips":"Blonde Fatale is their best seller for a reason."},
    {"order":4,"entity_type":"restaurant","name":"Firetrucker Brewery","description":"Firehouse-themed brewery with creative seasonal taps.","time_suggestion":"5:00 PM","tips":"Check their rotating seasonal list — always something new."},
    {"order":5,"entity_type":"restaurant","name":"Brightside Aleworks","description":"Cozy taproom with excellent sours and hazies.","time_suggestion":"6:30 PM","tips":"Great patio in summer. The sour program is outstanding."},
    {"order":6,"entity_type":"restaurant","name":"El Bait Shop","description":"End the trail at the legendary craft beer bar with 260+ taps.","time_suggestion":"8:00 PM","tips":"One of the largest craft beer selections in the country."}
  ]'::jsonb,
  'Des Moines Craft Beer Trail — Brewery Hop Itinerary',
  'Explore the best breweries in Des Moines with our curated craft beer trail. 6 stops, all-day adventure.'
),
(
  'Downtown Art Walk',
  'art-walk',
  'Discover Des Moines'' thriving art scene from world-class museums to street murals and gallery districts.',
  'half-day',
  'arts-culture',
  true,
  '[
    {"order":1,"entity_type":"attraction","name":"Des Moines Art Center","description":"Three architecturally stunning buildings housing a world-class collection.","time_suggestion":"10:00 AM","tips":"Free admission. Start in the Pei wing for contemporary art."},
    {"order":2,"entity_type":"attraction","name":"Pappajohn Sculpture Park","description":"28 sculptures by renowned artists including Ai Weiwei, Barry Flanagan, and Jaume Plensa.","time_suggestion":"11:30 AM","tips":"Download the free audio tour app for artist commentary."},
    {"order":3,"entity_type":"attraction","name":"East Village Murals","description":"Self-guided mural walk through the colorful East Village neighborhood.","time_suggestion":"1:00 PM","tips":"Look for murals on E Grand Ave and E Locust St."},
    {"order":4,"entity_type":"attraction","name":"Mainframe Studios","description":"The largest artist studio building in the US — 90+ studios in a converted warehouse.","time_suggestion":"2:30 PM","tips":"Open studio events happen monthly — check their calendar."},
    {"order":5,"entity_type":"restaurant","name":"Lua Brewing","description":"Wind down with craft beer in a gallery-like taproom.","time_suggestion":"4:00 PM","tips":"They host rotating art exhibits alongside their beer releases."}
  ]'::jsonb,
  'Downtown Des Moines Art Walk — Culture Itinerary',
  'Explore Des Moines art scene with our curated walking tour: museums, sculpture parks, murals, and studios.'
),
(
  'Foodie Tour',
  'foodie-tour',
  'Eat your way through Des Moines — from crab rangoon pizza to James Beard-nominated restaurants.',
  'full-day',
  'food-drink',
  true,
  '[
    {"order":1,"entity_type":"restaurant","name":"Scenic Route Bakery","description":"Start with the legendary cinnamon roll and a pour-over coffee.","time_suggestion":"8:30 AM","tips":"Cash and card accepted. Seating is limited — grab and stroll."},
    {"order":2,"entity_type":"restaurant","name":"Fong''s Pizza","description":"Mid-morning snack: the famous crab rangoon pizza.","time_suggestion":"11:00 AM","tips":"Located in a former Chinese restaurant — the decor is part of the experience."},
    {"order":3,"entity_type":"restaurant","name":"Tasty Tacos","description":"A Des Moines institution since 1961 — crispy shell tacos with secret flour shell.","time_suggestion":"1:00 PM","tips":"Order the Tasty Taco with everything. The flour shell is the secret weapon."},
    {"order":4,"entity_type":"attraction","name":"Downtown Farmers Market","description":"Browse artisan food vendors if visiting on Saturday (May–October).","time_suggestion":"2:30 PM","tips":"Try the fresh tamales and local honey."},
    {"order":5,"entity_type":"restaurant","name":"Hello, Marjorie","description":"Pre-dinner craft cocktails at this acclaimed cocktail bar.","time_suggestion":"5:30 PM","tips":"Ask for the seasonal menu — bartenders love to create custom drinks."},
    {"order":6,"entity_type":"restaurant","name":"Harbinger","description":"End the tour at Des Moines'' most acclaimed restaurant — James Beard-nominated farm-to-table.","time_suggestion":"7:00 PM","tips":"Book weeks in advance. The tasting menu is a must."}
  ]'::jsonb,
  'Des Moines Foodie Tour — Best Restaurants Itinerary',
  'Eat your way through Des Moines with our curated food tour from crab rangoon pizza to James Beard restaurants.'
)
ON CONFLICT (slug) DO NOTHING;
