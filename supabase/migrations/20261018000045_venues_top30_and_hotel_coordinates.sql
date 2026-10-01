-- SEO-045: venue rows for the top 30 venues by upcoming events, and the
-- coordinates every "hotels near <venue>" distance needs.
--
-- WHAT PRODUCTION LOOKED LIKE (probed 2026-10-01).
--   * venues held 9 seeded rows. The places the 2026-10-01 events table names
--     most (Flix Brewhouse, Funny Bone, Knapp Center, Principal Park, the
--     Fairgrounds, ...) had no page.
--   * hotels: 63 active rows and NOT ONE latitude. Every "Hotels near X" card
--     shipped by SEO-013 rendered nothing, because nearby() skips a row with
--     no coordinates. The module's whole value was a proximity join with an
--     empty side.
--   * The seeded venue coordinates, and the known_venues ones, are not
--     geocodes. Against OpenStreetMap: Val Air Ballroom was 2.3 mi off in
--     known_venues and 1.2 mi off in venues; Vibrant Music Hall's seed address
--     (1680 SE Dahlia Dr) is not where the hall is (2938 SE Grand Prairie
--     Pkwy); Wells Fargo Arena was seeded at 730 3rd St, which is the EMC Expo
--     Center, not the arena at 233 Center St. A one-decimal straight-line
--     distance is meaningless on a pin that is a mile wrong.
--
-- WHERE EVERY NUMBER HERE COMES FROM. OpenStreetMap via Nominatim, queried
-- 2026-10-01. A coordinate was taken only when the OSM object is the named
-- venue or hotel, or the exact street address with a matching house number in
-- the right town. Anything that resolved to a street centroid was refused and
-- stays NULL: four hotels (comfort-inn-ames, hampton-inn-suites-waukee,
-- home2-suites-altoona, tru-by-hilton-grimes) and Middlebrook Mercantile,
-- which has no OSM object and no stored address anybody verified. The OSM
-- object id is kept beside each hotel row below so a reviewer can check it.
-- Coordinates (c) OpenStreetMap contributors, ODbL.
--
-- WHAT IS NOT HERE. No capacity, no parking, no access notes, no generated
-- description (SEO-018: those are the fields a visitor acts on). Addresses come
-- from OSM's house number and street, or from known_venues/events where OSM
-- has the object but no house number. A venue with neither keeps a NULL
-- address and its page says only the city.
--
-- ADDITIVE ONLY (CLAUDE.md, Backward Compatibility). No column, constraint or
-- policy changes. New venue rows are INSERT ... ON CONFLICT DO NOTHING; every
-- UPDATE is guarded on the seeded value (or on NULL), so a row an admin has
-- already corrected is never overwritten.

-- 1. New venue rows ----------------------------------------------------------

INSERT INTO public.venues (name, slug, address, venue_type, website, latitude, longitude) VALUES
  ('Flix Brewhouse', 'flix-brewhouse', '3800 Merle Hay Rd, Des Moines, IA 50310', NULL, NULL, 41.6313874, -93.7017792),
  ('Funny Bone Comedy Club', 'funny-bone-comedy-club', '560 S Prairie View Dr, West Des Moines, IA 50266', 'club', 'https://desmoines.funnybone.com', 41.5616706, -93.7844225),
  ('Knapp Center', 'knapp-center', '2525 Forest Ave, Des Moines, IA 50311', 'arena', 'https://godrakebulldogs.com/facilities/knapp-center', 41.6047781, -93.6522633),
  ('Hilton Coliseum', 'hilton-coliseum', '1705 Center Dr, Ames, IA 50011', 'arena', NULL, 42.0210001, -93.6347686),
  ('Mediacom Stadium', 'mediacom-stadium', NULL, 'outdoor', NULL, 41.6047949, -93.6505817),
  ('The Ingersoll', 'the-ingersoll', '3711 Ingersoll Ave, Des Moines, IA 50312', 'theater', 'https://www.ingersolltheater.com', 41.5866376, -93.6674153),
  ('Des Moines Community Playhouse', 'des-moines-community-playhouse', '831 42nd St, Des Moines, IA 50312', 'theater', 'https://www.dmplayhouse.com', 41.5927717, -93.6738760),
  ('MidAmerican Energy Company RecPlex', 'midamerican-energy-company-recplex', NULL, NULL, NULL, 41.5394901, -93.7994765),
  ('Living History Farms', 'living-history-farms', '11121 Hickman Rd, Urbandale, IA 50322', 'outdoor', 'https://www.lhf.org', 41.6233320, -93.7849694),
  ('Drake Stadium', 'drake-stadium', '2719 Forest Ave, Des Moines, IA 50311', 'outdoor', NULL, 41.6049816, -93.6550518),
  ('Water Works Park', 'water-works-park', '2201 George Flagg Pkwy, Des Moines, IA 50321', 'outdoor', 'https://www.dsmwaterworks.com', 41.5689149, -93.6607467),
  ('Stephens Auditorium', 'stephens-auditorium', '1900 Center Dr, Ames, IA 50011', 'theater', 'https://www.center.iastate.edu', 42.0201988, -93.6380182),
  ('Prairie Meadows Casino & Hotel', 'prairie-meadows', '1 Prairie Meadows Dr, Altoona, IA 50009', NULL, 'https://www.prairiemeadows.com', 41.6550811, -93.4896999),
  ('Center Grove Orchard', 'center-grove-orchard', '32835 610th Ave, Cambridge, IA 50046', 'outdoor', 'https://www.centergroveorchard.com', 41.8802450, -93.4843330),
  ('Jack Trice Stadium', 'jack-trice-stadium', '1732 Jack Trice Way, Ames, IA 50011', 'outdoor', NULL, 42.0140049, -93.6357593),
  ('Greater Des Moines Botanical Garden', 'greater-des-moines-botanical-garden', '909 Robert D Ray Dr, Des Moines, IA 50309', NULL, 'https://www.dmbotanicalgarden.com', 41.5967526, -93.6139687),
  ('EMC Expo Center', 'emc-expo-center', '730 3rd St, Des Moines, IA 50309', 'civic', 'https://www.iowaeventscenter.com', 41.5917724, -93.6224828),
  ('Iowa Events Center', 'iowa-events-center', NULL, 'civic', 'https://www.iowaeventscenter.com', 41.5928046, -93.6223730),
  ('Principal Park', 'principal-park', '1 Line Dr, Des Moines, IA 50309', 'outdoor', 'https://www.milb.com/iowa', 41.5802173, -93.6166144),
  ('Iowa State Fairgrounds', 'iowa-state-fairgrounds', '3000 E Grand Ave, Des Moines, IA 50317', 'outdoor', 'https://www.iowastatefair.org', 41.5954105, -93.5464497),
  ('Jordan Creek Town Center', 'jordan-creek-town-center', '130 S Jordan Creek Pkwy, West Des Moines, IA 50266', NULL, NULL, 41.5666968, -93.8049587),
  ('Science Center of Iowa', 'science-center-of-iowa', '401 W Martin Luther King Jr Pkwy, Des Moines, IA 50309', NULL, 'https://www.sciowa.org', 41.5827401, -93.6208481)
ON CONFLICT (slug) DO NOTHING;

-- 2. The nine seeded rows: geocoded pins, and the two wrong addresses --------
--
-- Each UPDATE matches the seed's exact coordinates, so an admin edit since
-- 20260228000002 wins.

UPDATE public.venues AS v SET latitude = g.lat, longitude = g.lng, updated_at = now()
FROM (VALUES
  ('hoyt-sherman-place',      41.5832, -93.6467, 41.5889555, -93.6381497),
  ('woolys',                  41.5892, -93.6098, 41.5899048, -93.6108781),
  ('xbk',                     41.5877, -93.6555, 41.5997929, -93.6492950),
  ('leftys-live-music',       41.5932, -93.6613, 41.6006032, -93.6486170),
  ('val-air-ballroom',        41.5724, -93.7288, 41.5853367, -93.7064721),
  ('des-moines-civic-center', 41.5851, -93.6271, 41.5871908, -93.6204880),
  ('simon-estes-amphitheater',41.5865, -93.6230, 41.5880721, -93.6167504),
  ('vibrant-music-hall',      41.5780, -93.8620, 41.5803102, -93.8567176),
  ('wells-fargo-arena',       41.5908, -93.6208, 41.5925082, -93.6210723)
) AS g(slug, seed_lat, seed_lng, lat, lng)
WHERE v.slug = g.slug AND v.latitude = g.seed_lat AND v.longitude = g.seed_lng;

UPDATE public.venues SET address = '2938 SE Grand Prairie Pkwy, Waukee, IA 50263', updated_at = now()
WHERE slug = 'vibrant-music-hall' AND address = '1680 SE Dahlia Dr, Waukee, IA 50263';

UPDATE public.venues SET address = '233 Center St, Des Moines, IA 50309', updated_at = now()
WHERE slug = 'wells-fargo-arena' AND address = '730 3rd St, Des Moines, IA 50309';

-- The xBk seed line put 1159 24th St "in the Historic East Village". It is in
-- the Drake neighbourhood, two miles west (SEO-018 notes asked for an owner
-- check). A wrong line is worse than none; the page renders without it.
UPDATE public.venues SET description = NULL, updated_at = now()
WHERE slug = 'xbk' AND description LIKE '%Historic East Village%';

-- Official sites for the seeded rows, copied from known_venues where the
-- seed left website NULL.
UPDATE public.venues AS v SET website = k.website, updated_at = now()
FROM public.known_venues AS k
WHERE v.website IS NULL
  AND k.website IS NOT NULL AND k.website <> ''
  AND (v.slug, k.name) IN (
    ('hoyt-sherman-place', 'Hoyt Sherman Place'),
    ('woolys', 'Wooly''s'),
    ('xbk', 'xBk Live'),
    ('val-air-ballroom', 'Val Air Ballroom'),
    ('des-moines-civic-center', 'Civic Center of Greater Des Moines'),
    ('vibrant-music-hall', 'Vibrant Music Hall'),
    ('wells-fargo-arena', 'Wells Fargo Arena')
  );

-- 3. Hotel coordinates -------------------------------------------------------
--
-- Only rows still NULL on both. The fourth column is the OSM object the pair
-- came from, for review; it is not stored.

UPDATE public.hotels AS h SET latitude = g.lat, longitude = g.lng
FROM (VALUES
  ('ac-hotel-des-moines-east-village', 41.5902193, -93.6125011, 'way/849366438'),
  ('aloft-waukee', 41.5814925, -93.8562176, 'way/1457057915'),
  ('baymont-des-moines-airport', 41.5272545, -93.7010509, 'way/944010140'),
  ('best-western-plus-altoona', 41.6529328, -93.5039190, 'way/85307168'),
  ('best-western-plus-clive', 41.6033634, -93.7795795, 'way/74823603'),
  ('best-western-premier-ankeny', 41.7050402, -93.5738356, 'way/1546475640'),
  ('comfort-inn-west-des-moines', 41.5951151, -93.8081635, 'way/1153937250'),
  ('comfort-suites-altoona', 41.6586441, -93.5113170, 'way/16017580'),
  ('courtyard-ames', 42.0066062, -93.6130660, 'way/586958865'),
  ('courtyard-west-des-moines-jordan-creek', 41.5641093, -93.7991870, 'way/114746842'),
  ('des-lux-hotel', 41.5860675, -93.6277097, 'way/69347158'),
  ('des-moines-marriott-downtown', 41.5870692, -93.6267542, 'way/102238699'),
  ('drury-inn-west-des-moines', 41.5599125, -93.7821370, 'way/88696989'),
  ('element-west-des-moines', 41.5618116, -93.7856762, 'way/561384755'),
  ('embassy-suites-des-moines-downtown', 41.5881614, -93.6154737, 'way/46145106'),
  ('fairfield-inn-altoona', 41.6533937, -93.5153652, 'way/556587186'),
  ('fairfield-inn-des-moines-airport', 41.5219958, -93.6461948, 'way/112675753'),
  ('fairfield-inn-des-moines-west', 41.5904202, -93.8070366, 'way/90747444'),
  ('hampton-inn-altoona', 41.6646475, -93.4674102, 'way/702945465'),
  ('hampton-inn-ames', 42.0078056, -93.5843853, 'way/845893024'),
  ('hampton-inn-ankeny', 41.6815816, -93.5736880, 'way/45718444'),
  ('hampton-inn-suites-des-moines-downtown', 41.5837169, -93.6175456, 'way/253559601'),
  ('hampton-inn-west-des-moines-jordan-creek', 41.5585025, -93.7938053, 'way/467825035'),
  ('hampton-inn-des-moines-airport', 41.5386781, -93.6440431, 'way/98182380'),
  ('hilton-des-moines-downtown', 41.5910966, -93.6239295, 'way/618387633'),
  ('hilton-garden-inn-des-moines-airport', 41.5225116, -93.6466861, 'relation/18858603'),
  ('hilton-garden-inn-west-des-moines', 41.5679919, -93.7973766, 'way/252003005'),
  ('holiday-inn-urbandale', 41.6489511, -93.6996112, 'way/61226060'),
  ('holiday-inn-des-moines-airport', 41.5291724, -93.6448369, 'way/16009561'),
  ('holiday-inn-express-altoona', 41.6649397, -93.4655591, 'way/702945466'),
  ('holiday-inn-express-urbandale', 41.6500971, -93.7399129, 'way/135363836'),
  ('holiday-inn-express-west-des-moines', 41.5695693, -93.8093944, 'way/59677573'),
  ('holiday-inn-express-ames', 42.0344625, -93.5793772, 'way/16025043'),
  ('home2-suites-ames', 42.0081735, -93.6124592, 'way/16039857'),
  ('homewood-suites-des-moines-airport', 41.5186990, -93.6458131, 'way/1225167980'),
  ('homewood-suites-urbandale', 41.6504925, -93.7426494, 'node/13992243601'),
  ('homewood-suites-west-des-moines', 41.5583473, -93.7945409, 'way/467822319'),
  ('hotel-fort-des-moines', 41.5844294, -93.6297405, 'way/102702526'),
  ('hotel-renovo-urbandale', 41.6161899, -93.7734385, 'relation/10657477'),
  ('hyatt-place-altoona', 41.6540524, -93.5147211, 'way/923829066'),
  ('hyatt-place-des-moines-downtown', 41.5874293, -93.6255648, 'way/102238700'),
  ('hyatt-place-west-des-moines', 41.5664388, -93.7973836, 'way/561642170'),
  ('la-quinta-altoona', 41.6609890, -93.4849121, 'way/955584876'),
  ('la-quinta-clive', 41.6024436, -93.7799720, 'way/53280989'),
  ('prairie-meadows-casino-hotel', 41.6550811, -93.4896999, 'way/47010542'),
  ('quality-inn-altoona', 41.6585986, -93.4945012, 'way/85299283'),
  ('quality-inn-des-moines-airport', 41.5371869, -93.6444688, 'way/150361165'),
  ('renaissance-savery-hotel', 41.5875042, -93.6231056, 'way/106786689'),
  ('residence-inn-des-moines-downtown', 41.5840472, -93.6181049, 'way/253559600'),
  ('residence-inn-west-des-moines-jordan-creek', 41.5664504, -93.8022299, 'way/88616379'),
  ('sleep-inn-west-des-moines', 41.5575008, -93.7747585, 'way/963534801'),
  ('springhill-suites-des-moines-west', 41.5876190, -93.8099952, 'way/192656637'),
  ('staybridge-suites-des-moines-downtown', 41.5888406, -93.6144094, 'way/849366497'),
  ('staybridge-suites-west-des-moines', 41.5945761, -93.8038354, 'way/74454891'),
  ('stoney-creek-johnston', 41.6570207, -93.7325176, 'way/82659770'),
  ('surety-hotel', 41.5852105, -93.6248992, 'way/103614004'),
  ('towneplace-suites-johnston', 41.6533050, -93.7397022, 'way/195489250'),
  ('towneplace-suites-west-des-moines', 41.5679442, -93.8004212, 'way/849615215'),
  ('west-des-moines-marriott', 41.5888838, -93.8102601, 'way/192654026')
) AS g(slug, lat, lng, osm_object)
WHERE h.slug = g.slug AND h.latitude IS NULL AND h.longitude IS NULL;
