-- Seed the editorial blog queue (`content_suggestions`) with the 20 priority
-- topics surfaced by the May 2026 competitor research pass.
--
-- The research compared desmoinesinsider.com against:
--   * Catch Des Moines (CVB)               — owns broad official tourism queries
--   * downtowndsmusa.com (GDM Partnership) — owns "Downtown Des Moines …"
--   * Des Moines Parent                    — strong on kid/family content
--   * Des Moines Girl                      — strong on lifestyle listicles
--
-- The angle for every row below is one of:
--   1. Hyper-specific, intent-rich local query the official sites don't own
--   2. Dynamic "this weekend" / monthly / seasonal roundup
--   3. AI-assisted content where the AI is part of the story
--   4. Neighborhood / lifestyle segmentation
--   5. Playgrounds, indoor play, kid-first guides our data uniquely supports
--
-- Cross-cutting execution notes (apply to every row, repeated per-row in
-- ai_analysis.execution_notes for downstream generators):
--   * Embed live event/restaurant/playground widgets, not static lists, so
--     freshness and depth signals to Google.
--   * Use Event schema on dated roundups, ItemList on listicles, Place /
--     Restaurant / TouristAttraction where appropriate.
--   * Make posts evergreen at one stable URL and update on a cadence
--     (weekly / monthly / seasonal) rather than spawning new URLs.
--   * Use the "Insider" + AI hook for differentiation in the title and lede.
--
-- Idempotency: re-running this migration is a no-op. The `seed_source`
-- marker in ai_analysis is checked at the top of the DO block.

DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1 FROM content_suggestions
        WHERE ai_analysis->>'seed_source' = 'competitor_research_2026_05_06'
        LIMIT 1
    ) THEN
        RAISE NOTICE '[seed_blog_queue_competitor_research] already applied — skipping';
        RETURN;
    END IF;

    -- Rank 1 / priority 100
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        '21 Actually Fun Things to Do in Des Moines This Weekend (Updated Every Thursday)',
        'Curated weekly shortlist of weekend events, refreshed every Thursday and powered by our events index. Beats manually maintained calendars on completeness and freshness.',
        ARRAY['weekend','events','curated','weekly','des-moines'],
        ARRAY['seo','depth','freshness','differentiation'],
        100,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 1,
            "primary_keyword": "things to do in des moines this weekend",
            "secondary_keywords": [
                "des moines events this weekend",
                "what to do in des moines this weekend",
                "des moines weekend guide"
            ],
            "competitors_targeted": ["catchdesmoines.com", "downtowndsmusa.com"],
            "why_this_can_win": "We aggregate events; we can curate a weekly shortlist faster and more comprehensively than blogs that hand-maintain calendars.",
            "recommended_schema": ["Event", "ItemList"],
            "format": "weekly_roundup",
            "update_cadence": "weekly_thursday",
            "execution_notes": [
                "Single stable URL with the date in the H1; refresh body weekly to build link equity.",
                "Embed the events feed widget so freshness is visible to crawlers.",
                "Add an AI 'wildcard pick' callout to differentiate."
            ]
        }$json$::jsonb
    );

    -- Rank 2 / priority 96
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        'Best Kid-Friendly Restaurants in Des Moines for Stress-Free Family Meals',
        'Structured restaurant guide for parents — filter by kids menu, high chairs, noise level, parking. Our restaurant index can power filters family blogs cannot.',
        ARRAY['restaurants','family','kids','dining'],
        ARRAY['seo','depth','engagement','differentiation'],
        96,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 2,
            "primary_keyword": "kid friendly restaurants des moines",
            "secondary_keywords": [
                "family restaurants des moines",
                "restaurants with kids menu des moines",
                "best places to eat with kids des moines"
            ],
            "competitors_targeted": ["desmoinesparent.com", "catchdesmoines.com"],
            "why_this_can_win": "Des Moines Parent covers experiences but lacks a deep, structured restaurant guide; our index + filters can power this.",
            "recommended_schema": ["ItemList", "Restaurant"],
            "format": "evergreen_listicle",
            "update_cadence": "quarterly_review",
            "execution_notes": [
                "Embed live restaurant cards rather than static names so changes propagate.",
                "Group by amenity (kids menu / play area / quiet vs loud) — that's the unmet intent.",
                "Add 'AI-picked top 3 for picky eaters' for differentiation."
            ]
        }$json$::jsonb
    );

    -- Rank 3 / priority 92
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        '15 Indoor Things to Do in Des Moines on a Rainy Day (for Kids and Adults)',
        'Long-tail evergreen post covering the "indoor / rainy day" intent that official sites don''t segment for. Strong fit with attractions + events data.',
        ARRAY['indoor','rainy-day','attractions','family','date-night'],
        ARRAY['seo','depth','differentiation'],
        92,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 3,
            "primary_keyword": "indoor things to do in des moines",
            "secondary_keywords": [
                "rainy day activities des moines",
                "indoor activities des moines for kids",
                "indoor date ideas des moines"
            ],
            "competitors_targeted": ["catchdesmoines.com", "desmoinesparent.com"],
            "why_this_can_win": "Official sites list attractions but don't segment by 'indoor / rainy day'; strong long-tail local intent.",
            "recommended_schema": ["ItemList", "Place", "TouristAttraction"],
            "format": "evergreen_listicle",
            "update_cadence": "seasonal_review",
            "execution_notes": [
                "Split sections by audience: families / couples / solo — each has its own search intent.",
                "Pull in current weather and surface this post when forecast = rain.",
                "Internal-link to playground and indoor-play hub posts."
            ]
        }$json$::jsonb
    );

    -- Rank 4 / priority 88
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        'The Ultimate Guide to Des Moines Playgrounds by Age, Area, and Season',
        'Group our playground dataset by age band (0-3 / 4-7 / 8-12), neighborhood, and season. Family blogs touch this only lightly.',
        ARRAY['playgrounds','family','free','kids','neighborhoods'],
        ARRAY['seo','depth','differentiation'],
        88,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 4,
            "primary_keyword": "des moines playgrounds",
            "secondary_keywords": [
                "best playgrounds in des moines",
                "playgrounds near me des moines",
                "free things to do with kids des moines"
            ],
            "competitors_targeted": ["desmoinesparent.com"],
            "why_this_can_win": "We have the playground dataset; grouping by age/amenities/season fills a niche family blogs only touch.",
            "recommended_schema": ["ItemList", "Place"],
            "format": "ultimate_guide",
            "update_cadence": "biannual_review",
            "execution_notes": [
                "Cluster pages: one hub + per-neighborhood spokes for internal linking.",
                "Include shade / restroom / parking flags — that's the parent-specific intent.",
                "Embed live map of all playgrounds via the existing map component."
            ]
        }$json$::jsonb
    );

    -- Rank 5 / priority 84
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        '11 Des Moines Date Night Ideas (From Low-Key to Fancy)',
        'Tiered date night guide — low-key, mid, fancy — combining restaurants and events. CVB is generic; we can do curated, tiered.',
        ARRAY['date-night','romantic','restaurants','events'],
        ARRAY['seo','engagement','differentiation'],
        84,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 5,
            "primary_keyword": "date night ideas des moines",
            "secondary_keywords": [
                "romantic restaurants des moines",
                "things to do for couples des moines",
                "date night des moines"
            ],
            "competitors_targeted": ["catchdesmoines.com", "desmoinesgirl.com"],
            "why_this_can_win": "Competitors give generic 'things to do'; we can publish curated, tiered date ideas backed by our restaurant + events data.",
            "recommended_schema": ["ItemList", "Restaurant", "Event"],
            "format": "tiered_listicle",
            "update_cadence": "seasonal_addition",
            "execution_notes": [
                "Tier-bucket the recommendations: under $50 / $50-100 / splurge.",
                "Pair each restaurant with a complementary nearby activity.",
                "Refresh seasonally with current events as the 'unique' tier."
            ]
        }$json$::jsonb
    );

    -- Rank 6 / priority 80
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        'New Restaurants in Des Moines 2026: Openings You Should Actually Try',
        'Continuously updated living list of new openings. Lifestyle blogs do occasional roundups; we can stay fresher with monthly updates.',
        ARRAY['restaurants','new-openings','monthly','dining-news'],
        ARRAY['seo','freshness','differentiation'],
        80,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 6,
            "primary_keyword": "new restaurants in des moines",
            "secondary_keywords": [
                "latest restaurant openings des moines",
                "new bars des moines",
                "restaurant news des moines"
            ],
            "competitors_targeted": ["desmoinesgirl.com", "downtowndsmusa.com"],
            "why_this_can_win": "Lifestyle blogs do occasional roundups; a continuously updated list will be fresher and more complete.",
            "recommended_schema": ["ItemList", "Restaurant"],
            "format": "living_list",
            "update_cadence": "monthly",
            "execution_notes": [
                "One stable URL — '/new-restaurants-des-moines-2026' — with a visible changelog at the bottom.",
                "Track 'opened', 'announced', 'opening soon' as separate sections.",
                "Add 'AI verdict' on each — adds personality and reinforces brand."
            ]
        }$json$::jsonb
    );

    -- Rank 7 / priority 76
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        $t$The Local's Guide to Lunch in Des Moines (By Neighborhood)$t$,
        'Out-compete Des Moines Girl''s lunch guide by structuring city-wide by neighborhood and price, with monthly refreshes.',
        ARRAY['lunch','restaurants','neighborhoods','downtown','west-des-moines'],
        ARRAY['seo','depth','differentiation'],
        76,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 7,
            "primary_keyword": "lunch in des moines",
            "secondary_keywords": [
                "best lunch des moines",
                "downtown des moines lunch spots",
                "west des moines lunch restaurants"
            ],
            "competitors_targeted": ["desmoinesgirl.com", "downtowndsmusa.com"],
            "why_this_can_win": "Des Moines Girl has a lunch guide; we can win by structuring by neighborhood and price and updating more often.",
            "recommended_schema": ["ItemList", "Restaurant"],
            "format": "neighborhood_guide",
            "update_cadence": "quarterly_review",
            "execution_notes": [
                "Sections per neighborhood: Downtown, East Village, Beaverdale, West Des Moines, Ankeny, Waukee.",
                "Add 'under 30 minutes' filter — workday lunch is the dominant intent.",
                "Link each entry to its restaurant page for canonicalisation signals."
            ]
        }$json$::jsonb
    );

    -- Rank 8 / priority 72
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        'Des Moines Events with Free Admission This Month',
        'Curated monthly free-events shortlist. Calendars filter by price; nobody publishes a curated, shareable list.',
        ARRAY['events','free','monthly','family','budget'],
        ARRAY['seo','engagement','freshness'],
        72,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 8,
            "primary_keyword": "free events in des moines",
            "secondary_keywords": [
                "free things to do in des moines",
                "free family events des moines",
                "budget friendly des moines"
            ],
            "competitors_targeted": ["catchdesmoines.com", "downtowndsmusa.com"],
            "why_this_can_win": "Official calendars include price filters but nobody publishes a curated, shareable 'free events' article — high CTR for families and students.",
            "recommended_schema": ["Event", "ItemList"],
            "format": "monthly_roundup",
            "update_cadence": "monthly",
            "execution_notes": [
                "One stable URL — '/free-events-des-moines' — month name in the H1, refresh content monthly.",
                "Auto-pull from events feed where price = 0 / null.",
                "Tag entries 'family', 'kids OK', 'date-friendly' for skim scanning."
            ]
        }$json$::jsonb
    );

    -- Rank 9 / priority 68
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        '25 Free (or Almost Free) Things to Do in Des Moines Year-Round',
        'Evergreen value-focused listicle competing with CVB but leaning into locals'' picks instead of generic attractions.',
        ARRAY['free','budget','family','evergreen','attractions'],
        ARRAY['seo','depth','engagement'],
        68,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 9,
            "primary_keyword": "free things to do in des moines",
            "secondary_keywords": [
                "cheap things to do des moines",
                "budget friendly activities des moines",
                "free family activities des moines"
            ],
            "competitors_targeted": ["catchdesmoines.com"],
            "why_this_can_win": "Evergreen listicle competing with CVB but leaning into locals' picks and value framing instead of generic attractions.",
            "recommended_schema": ["ItemList", "Place"],
            "format": "evergreen_listicle",
            "update_cadence": "biannual_review",
            "execution_notes": [
                "Mix free attractions, free events, and free-with-library-pass perks.",
                "Add an 'AI suggested itinerary using only free items' sidebar.",
                "Internal-link to '/free-events-des-moines' for monthly freshness."
            ]
        }$json$::jsonb
    );

    -- Rank 10 / priority 64
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        'Dog-Friendly Patios and Breweries in Des Moines',
        'Niche listicle hitting an intent CVB doesn''t maintain as a single page.',
        ARRAY['dog-friendly','patios','breweries','restaurants'],
        ARRAY['seo','differentiation'],
        64,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 10,
            "primary_keyword": "dog friendly patios des moines",
            "secondary_keywords": [
                "dog friendly restaurants des moines",
                "pet friendly patios des moines",
                "breweries you can bring your dog des moines"
            ],
            "competitors_targeted": ["catchdesmoines.com", "downtowndsmusa.com"],
            "why_this_can_win": "CVB lists breweries and restaurants, but 'dog friendly' is a narrower intent they don't maintain as a single page.",
            "recommended_schema": ["ItemList", "Restaurant"],
            "format": "niche_listicle",
            "update_cadence": "annual_review",
            "execution_notes": [
                "Verify dog-friendly status via website / phone before listing — owners care about accuracy here.",
                "Tag water-bowl / dog-menu / shaded-patio per entry.",
                "Cross-link to dog parks for adjacency."
            ]
        }$json$::jsonb
    );

    -- Rank 11 / priority 60
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        'Best Des Moines Brunch Spots for Every Vibe (Trendy, Classic, Family-Friendly)',
        'Vibe-segmented brunch guide. Downtown DSM lists generically; we can be opinionated and city-wide.',
        ARRAY['brunch','restaurants','vibes','weekend'],
        ARRAY['seo','engagement','differentiation'],
        60,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 11,
            "primary_keyword": "brunch des moines",
            "secondary_keywords": [
                "best brunch des moines",
                "sunday brunch des moines",
                "bottomless brunch des moines"
            ],
            "competitors_targeted": ["downtowndsmusa.com", "desmoinesgirl.com"],
            "why_this_can_win": "Downtown DSM lists generically; we can publish a more opinionated, vibe-driven, city-wide guide.",
            "recommended_schema": ["ItemList", "Restaurant"],
            "format": "vibe_segmented_listicle",
            "update_cadence": "semiannual_review",
            "execution_notes": [
                "Sections by vibe: Trendy / Classic / Family / Bottomless / Hidden Gem.",
                "Add wait-time and reservation difficulty — that's the underserved practical intent.",
                "Refresh after Mother's Day each year."
            ]
        }$json$::jsonb
    );

    -- Rank 12 / priority 56
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        $t$Winter in Des Moines: Cozy Things to Do When It's Too Cold to Be Outside$t$,
        'Seasonal guide leveraging indoor attractions, winter festivals, holiday events.',
        ARRAY['winter','seasonal','indoor','holiday','christmas'],
        ARRAY['seo','depth','freshness'],
        56,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 12,
            "primary_keyword": "winter things to do in des moines",
            "secondary_keywords": [
                "winter activities des moines",
                "indoor winter activities des moines",
                "christmas events des moines"
            ],
            "competitors_targeted": ["catchdesmoines.com", "desmoinesparent.com"],
            "why_this_can_win": "Strong fit with our events + attractions data; covers a season official sites under-segment.",
            "recommended_schema": ["ItemList", "Event"],
            "format": "seasonal_guide",
            "update_cadence": "annual_republish_november",
            "execution_notes": [
                "One stable URL with year-agnostic slug; refresh body each November.",
                "Sub-section: Holiday lights drives, ice skating, indoor playgrounds, cozy restaurants.",
                "Internal-link from rainy-day post in winter months."
            ]
        }$json$::jsonb
    );

    -- Rank 13 / priority 52
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        'The Ultimate Guide to Des Moines Festivals and Annual Events (With Insider Tips)',
        'Logistics + insider tips that official festival listings skip — parking notes, family hacks, best entry times.',
        ARRAY['festivals','annual-events','insider-tips','summer'],
        ARRAY['seo','depth','differentiation'],
        52,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 13,
            "primary_keyword": "des moines festivals",
            "secondary_keywords": [
                "des moines annual events",
                "des moines summer festivals",
                "des moines food festivals"
            ],
            "competitors_targeted": ["catchdesmoines.com", "downtowndsmusa.com"],
            "why_this_can_win": "Catch Des Moines owns festival listings; we can layer 'insider' logistics tips, parking notes, and family hacks they skip.",
            "recommended_schema": ["Event", "ItemList"],
            "format": "ultimate_guide",
            "update_cadence": "annual_with_monthly_hub_updates",
            "execution_notes": [
                "Hub page links to per-festival posts (parent + children architecture).",
                "Each child post answers: dates, parking, where to eat near it, kid-friendliness, accessibility.",
                "Pull live event entries onto the hub for freshness."
            ]
        }$json$::jsonb
    );

    -- Rank 14 / priority 48
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        'East Village, Ingersoll, and Drake: Micro-Neighborhood Food Tours in Des Moines',
        'Structured one-day food tour guides per neighborhood, with maps generated by our app.',
        ARRAY['neighborhoods','food-tour','east-village','ingersoll','drake','des-moines-food'],
        ARRAY['seo','depth','differentiation'],
        48,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 14,
            "primary_keyword": "des moines food tour",
            "secondary_keywords": [
                "east village restaurants des moines",
                "ingersoll restaurants des moines",
                "drake neighborhood restaurants"
            ],
            "competitors_targeted": ["downtowndsmusa.com", "desmoinesgirl.com"],
            "why_this_can_win": "Competitors mention these areas; we can turn them into structured one-day food tours with maps via our app.",
            "recommended_schema": ["ItemList", "Restaurant", "Place"],
            "format": "neighborhood_food_tour",
            "update_cadence": "semiannual_review",
            "execution_notes": [
                "One hub post linking to one post per neighborhood.",
                "Each post is a sequenced 4-5 stop tour: brunch / coffee / lunch / drinks / dessert.",
                "Embed an interactive map widget pulling from our restaurant geodata."
            ]
        }$json$::jsonb
    );

    -- Rank 15 / priority 44
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        '24 Hours in Des Moines: An AI-Planned Perfect Day (We Tested It)',
        'Differentiated AI-planned itinerary that reinforces brand and still targets classic itinerary keywords.',
        ARRAY['itinerary','ai-planned','24-hours','visitor','weekend'],
        ARRAY['seo','engagement','differentiation'],
        44,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 15,
            "primary_keyword": "24 hours in des moines",
            "secondary_keywords": [
                "one day in des moines",
                "des moines itinerary 1 day",
                "weekend in des moines"
            ],
            "competitors_targeted": ["catchdesmoines.com"],
            "why_this_can_win": "AI-planned hook reinforces brand and still targets classic itinerary queries Catch Des Moines owns generically.",
            "recommended_schema": ["TouristAttraction", "ItemList"],
            "format": "ai_itinerary",
            "update_cadence": "annual_refresh",
            "execution_notes": [
                "Show the AI prompt + response excerpts as part of the narrative — the meta-story is the differentiator.",
                "Add a 'rate this itinerary' callout and use ratings to refine the next year's version.",
                "Spawn variants: 24h with kids, 24h foodie, 24h budget."
            ]
        }$json$::jsonb
    );

    -- Rank 16 / priority 40
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        'Where to Eat Near Major Des Moines Attractions (Iowa Cubs, Wells Fargo Arena, Zoo, etc.)',
        'Proximity-based guide solving a real problem — official sites list attractions and restaurants separately.',
        ARRAY['restaurants','attractions','wells-fargo-arena','iowa-cubs','blank-park-zoo','proximity'],
        ARRAY['seo','depth','differentiation'],
        40,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 16,
            "primary_keyword": "restaurants near wells fargo arena des moines",
            "secondary_keywords": [
                "where to eat near iowa cubs stadium",
                "restaurants near blank park zoo",
                "food near des moines events"
            ],
            "competitors_targeted": ["catchdesmoines.com", "downtowndsmusa.com"],
            "why_this_can_win": "Official sites list attractions and restaurants separately; a proximity-based pairing solves a real visitor problem.",
            "recommended_schema": ["ItemList", "Restaurant", "Place"],
            "format": "proximity_guide",
            "update_cadence": "semiannual_review",
            "execution_notes": [
                "One post per attraction with 5-10 nearby restaurants by walk time / drive time.",
                "Hub post links them all; great internal linking.",
                "Use our geodata to compute distances rather than hand-curating."
            ]
        }$json$::jsonb
    );

    -- Rank 17 / priority 36
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        'Best Des Moines Coffee Shops to Work From (Wi-Fi, Outlets, Parking)',
        'Remote-work / study intent that lifestyle blogs rarely optimize for. Strong local search demand.',
        ARRAY['coffee','remote-work','study-spots','wifi'],
        ARRAY['seo','depth','differentiation'],
        36,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 17,
            "primary_keyword": "coffee shops des moines",
            "secondary_keywords": [
                "best coffee des moines",
                "coffee shops to work from des moines",
                "study spots des moines"
            ],
            "competitors_targeted": ["desmoinesgirl.com"],
            "why_this_can_win": "Lifestyle blogs list coffee shops but rarely optimise for remote-work / study intent.",
            "recommended_schema": ["ItemList", "CafeOrCoffeeShop"],
            "format": "workspace_listicle",
            "update_cadence": "annual_review",
            "execution_notes": [
                "Score each on Wi-Fi reliability, outlet density, noise level, parking, hours.",
                "Add a 'best for video calls' callout — niche but valuable.",
                "Include a 'we tested every Wi-Fi connection' angle for content depth."
            ]
        }$json$::jsonb
    );

    -- Rank 18 / priority 32
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        $t$Rainy-Day Play: Indoor Playgrounds and Kids' Activity Centers Around Des Moines$t$,
        'Bridge between our playground dataset and family intent. Parent sites mention some but rarely centralized.',
        ARRAY['indoor-playgrounds','kids','family','rainy-day','toddlers'],
        ARRAY['seo','depth','engagement'],
        32,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 18,
            "primary_keyword": "indoor playground des moines",
            "secondary_keywords": [
                "indoor play areas des moines",
                "indoor playground west des moines",
                "indoor activities for toddlers des moines"
            ],
            "competitors_targeted": ["desmoinesparent.com"],
            "why_this_can_win": "Bridges our playground dataset and family intent — parent sites rarely centralise this.",
            "recommended_schema": ["ItemList", "Place"],
            "format": "family_listicle",
            "update_cadence": "biannual_review",
            "execution_notes": [
                "Tag each by age band (0-3 / 4-7 / 8+) and price (free / paid / membership).",
                "Cross-link with 'rainy day things to do' (rank 3) — same intent, different breadth.",
                "Note birthday-party availability — high-intent secondary query."
            ]
        }$json$::jsonb
    );

    -- Rank 19 / priority 28
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        $t$The Des Moines Insider's Guide to Restaurant Week (How to Actually Maximize It)$t$,
        'Tactical "how to hack it" guide riding Restaurant Week demand with insider context.',
        ARRAY['restaurant-week','tips','tactical','dining-deals'],
        ARRAY['seo','engagement','differentiation'],
        28,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 19,
            "primary_keyword": "des moines restaurant week",
            "secondary_keywords": [
                "restaurant week des moines tips",
                "best restaurant week deals des moines",
                "where to eat restaurant week des moines"
            ],
            "competitors_targeted": ["catchdesmoines.com", "downtowndsmusa.com"],
            "why_this_can_win": "Official orgs promote Restaurant Week; our 'how to hack it' angle adds insider context they don't.",
            "recommended_schema": ["ItemList", "Event"],
            "format": "tactical_guide",
            "update_cadence": "annual_pre_restaurant_week",
            "execution_notes": [
                "Calculate menu cost-per-dollar to surface best deals — that's the unique angle.",
                "Reservation strategy section: which spots book up fastest, when to book.",
                "Refresh annually two weeks before Restaurant Week begins."
            ]
        }$json$::jsonb
    );

    -- Rank 20 / priority 24
    INSERT INTO content_suggestions (
        suggestion_type, suggested_title, suggested_description,
        suggested_tags, improvement_areas, priority_score, status, ai_analysis
    ) VALUES (
        'gap_fill',
        'Live Music in Des Moines: Best Venues, Weekly Series, and How to Find Shows',
        'Unified live-music orientation guide for newcomers and locals — calendars list shows but no orientation.',
        ARRAY['live-music','concerts','venues','orientation','nightlife'],
        ARRAY['seo','depth','differentiation'],
        24,
        'pending',
        $json${
            "seed_source": "competitor_research_2026_05_06",
            "rank": 20,
            "primary_keyword": "live music des moines",
            "secondary_keywords": [
                "concerts in des moines",
                "music venues des moines",
                "des moines shows this week"
            ],
            "competitors_targeted": ["catchdesmoines.com", "downtowndsmusa.com"],
            "why_this_can_win": "Calendars list concerts but don't give a unified live-music orientation guide for newcomers and locals.",
            "recommended_schema": ["ItemList", "MusicVenue", "Event"],
            "format": "orientation_guide",
            "update_cadence": "evergreen_with_weekly_shows_section",
            "execution_notes": [
                "Sections: Major venues / mid-size / dive bars with regular series / open mic nights.",
                "Embed live 'shows this week' from our events feed for freshness.",
                "One stable URL with weekly auto-refreshed shows section."
            ]
        }$json$::jsonb
    );

    RAISE NOTICE '[seed_blog_queue_competitor_research] seeded 20 rows';
END
$migration$;
