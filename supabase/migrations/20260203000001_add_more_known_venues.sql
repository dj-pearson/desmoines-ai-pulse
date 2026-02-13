-- Add additional known venues based on event frequency analysis
-- These venues appear frequently in events but weren't in the initial seed data

INSERT INTO known_venues (name, aliases, address, city, state, zip, latitude, longitude, phone, email, website, venue_type, capacity, description) VALUES

-- HIGH PRIORITY VENUES (10+ events)

-- Funny Bone Comedy Club - 57 events
('Funny Bone Comedy Club',
 ARRAY['Funny Bone', 'Funnybone', 'Funny Bone West Des Moines', 'Des Moines Funny Bone'],
 '560 S Prairie View Dr', 'West Des Moines', 'IA', '50266',
 41.5352, -93.8008,
 '515.270.2100', NULL, 'https://desmoines.funnybone.com',
 'bar', 350,
 'Premier comedy club in West Des Moines featuring national touring comedians and local talent'),

-- Middlebrook Mercantile - 43 events
('Middlebrook Mercantile',
 ARRAY['Middlebrook', 'Middlebrook Farm', 'The Mercantile'],
 '3005 SE Convenience Blvd', 'Grimes', 'IA', '50111',
 41.6558, -93.7619,
 '515.250.1785', NULL, 'https://www.middlebrookmercantile.com',
 'market', NULL,
 'Farm-to-table market and event venue featuring local Iowa products and community events'),

-- Knapp Center (Drake University) - 18 events
('Knapp Center',
 ARRAY['The Knapp Center', 'Drake Knapp Center', 'Knapp Arena'],
 '2601 Forest Ave', 'Des Moines', 'IA', '50311',
 41.6047, -93.6536,
 '515.271.3647', NULL, 'https://godrakebulldogs.com/facilities/knapp-center',
 'arena', 7152,
 'Drake University multi-purpose arena hosting basketball, concerts, and special events'),

-- West Des Moines Public Library - 17 events
('West Des Moines Public Library',
 ARRAY['WDM Library', 'West Des Moines Library', 'WDMPL'],
 '4000 Mills Civic Pkwy', 'West Des Moines', 'IA', '50265',
 41.5503, -93.7647,
 '515.222.3400', NULL, 'https://www.wdmlibrary.org',
 'other', 200,
 'Public library hosting community events, author visits, and educational programming'),

-- Prairie Meadows - 15+ events (multiple variations in data)
('Prairie Meadows Casino & Hotel',
 ARRAY['Prairie Meadows', 'Prairie Meadows Racetrack', 'Prairie Meadows Racetrack and Casino', 'Prairie Meadows Racetrack & Casino', 'Prairie Meadows Casino'],
 '1 Prairie Meadows Dr', 'Altoona', 'IA', '50009',
 41.6453, -93.4767,
 '515.967.1000', NULL, 'https://www.prairiemeadows.com',
 'arena', 2500,
 'Casino, hotel and entertainment complex featuring concerts, horse racing, and gaming'),

-- Jester Park Nature Center - 15 events
('Jester Park Nature Center',
 ARRAY['Jester Park', 'Jester Nature Center', 'Polk County Jester Park'],
 '12130 NW 128th St', 'Granger', 'IA', '50109',
 41.7533, -93.8100,
 '515.323.5300', NULL, 'https://www.polkcountyiowa.gov/conservation/jester-park',
 'park', NULL,
 'Nature center and park offering outdoor education, trails, and family events'),

-- Confluence Brewing Company - 14 events
('Confluence Brewing Company',
 ARRAY['Confluence Brewing', 'Confluence', 'Confluence Brewery'],
 '1235 Thomas Beck Rd', 'Des Moines', 'IA', '50315',
 41.5622, -93.6125,
 '515.285.9005', NULL, 'https://www.confluencebrewing.com',
 'bar', 150,
 'Local craft brewery with taproom hosting live music and community events'),

-- Susan Knapp Amphitheater - 11 events
('Susan Knapp Amphitheater',
 ARRAY['Knapp Amphitheater', 'Susan Knapp'],
 '6075 NW 62nd Ave', 'Johnston', 'IA', '50131',
 41.6633, -93.7300,
 '515.278.2679', NULL, 'https://www.cityofjohnston.com',
 'amphitheater', 1000,
 'Outdoor amphitheater in Johnston hosting summer concerts and community events'),

-- Skate South - 11 events
('Skate South',
 ARRAY['Skate South Des Moines'],
 '6450 Fleur Dr', 'Des Moines', 'IA', '50321',
 41.5289, -93.6303,
 '515.287.0999', NULL, 'https://www.skatesouth.com',
 'entertainment', 400,
 'Roller skating rink hosting open skate sessions, parties, and special events'),

-- Firetrucker Brewery - 11 events
('Firetrucker Brewery',
 ARRAY['Firetrucker', 'Fire Trucker Brewery', 'Firetrucker Brewing'],
 '716 SW 3rd St', 'Ankeny', 'IA', '50023',
 41.7258, -93.6056,
 '515.964.1879', NULL, 'https://firetruckerbrewery.com',
 'bar', 100,
 'Ankeny craft brewery with taproom featuring local beers and community events'),

-- MidAmerican Energy Stage (Iowa State Fair) - 10 events
('MidAmerican Energy Stage',
 ARRAY['MidAmerican Stage', 'Mid American Energy Stage', 'Iowa State Fair MidAmerican Stage'],
 '3000 E Grand Ave', 'Des Moines', 'IA', '50317',
 41.5947, -93.5496,
 '515.262.3111', NULL, 'https://www.iowastatefair.org',
 'amphitheater', 5000,
 'Main concert stage at Iowa State Fairgrounds hosting major performances during the fair'),

-- Des Moines Art Center - 10 events
('Des Moines Art Center',
 ARRAY['Art Center', 'DMAC', 'Des Moines Art Museum'],
 '4700 Grand Ave', 'Des Moines', 'IA', '50312',
 41.5847, -93.6686,
 '515.277.4405', NULL, 'https://www.desmoinesartcenter.org',
 'museum', 300,
 'World-class art museum with free admission featuring contemporary and modern art'),

-- MEDIUM PRIORITY VENUES (5-9 events)

-- Iowa Distilling Company - 9 events
('Iowa Distilling Company',
 ARRAY['Iowa Distilling', 'Iowa Distillery'],
 '4349 Cumming Ave', 'Cumming', 'IA', '50061',
 41.4817, -93.7589,
 '515.981.5199', NULL, 'https://www.iowadistilling.com',
 'bar', 100,
 'Iowa craft distillery offering tours, tastings, and special events'),

-- Paws & Pints - 8 events
('Paws & Pints',
 ARRAY['Paws and Pints', 'Paws & Pints Beaverdale'],
 '2815 Beaver Ave', 'Des Moines', 'IA', '50310',
 41.6097, -93.6667,
 '515.279.7970', NULL, 'https://www.pawsandpintsdm.com',
 'bar', 75,
 'Dog-friendly bar and restaurant in Beaverdale neighborhood'),

-- The Brenton Arboretum - 7 events
('The Brenton Arboretum',
 ARRAY['Brenton Arboretum', 'Brenton'],
 '25141 260th St', 'Dallas Center', 'IA', '50063',
 41.6847, -94.0153,
 '515.992.4211', NULL, 'https://www.thebrentonarboretum.org',
 'garden', NULL,
 'Public arboretum featuring Iowa trees and plants with educational programs'),

-- Des Moines Community Playhouse - 7 events
('Des Moines Community Playhouse',
 ARRAY['Community Playhouse', 'The Playhouse', 'DM Playhouse', 'Des Moines Playhouse'],
 '831 42nd St', 'Des Moines', 'IA', '50312',
 41.5856, -93.6683,
 '515.277.6261', NULL, 'https://www.dmplayhouse.com',
 'theater', 400,
 'Community theater producing plays and musicals since 1919'),

-- Des Moines Biergarten - 7 events
('Des Moines Biergarten',
 ARRAY['Biergarten', 'DM Biergarten', 'Des Moines Biergarten at Water Works Park'],
 '100 Locust St', 'Des Moines', 'IA', '50309',
 41.5556, -93.6458,
 NULL, NULL, 'https://www.dsmbiergarten.com',
 'bar', 500,
 'Outdoor beer garden at Water Works Park with seasonal events'),

-- xBk Live - 6 events
('xBk Live',
 ARRAY['xBk', 'XBK Live', 'XBK'],
 '1159 24th St', 'Des Moines', 'IA', '50311',
 41.5939, -93.6631,
 '515.369.1159', NULL, 'https://xbklive.com',
 'music_hall', 600,
 'Live music venue in Des Moines featuring indie and alternative acts'),

-- The Ingersoll - 6 events
('The Ingersoll',
 ARRAY['Ingersoll Dinner Theater', 'Ingersoll Theater'],
 '3711 Ingersoll Ave', 'Des Moines', 'IA', '50312',
 41.5847, -93.6683,
 '515.274.4686', NULL, 'https://www.ingersolltheater.com',
 'theater', 200,
 'Intimate dinner theater offering comedies, musicals, and special events'),

-- Scottish Rite Consistory - 6 events
('Scottish Rite Consistory',
 ARRAY['Scottish Rite', 'Des Moines Scottish Rite', 'Scottish Rite Temple'],
 '519 Park St', 'Des Moines', 'IA', '50309',
 41.5867, -93.6325,
 '515.244.6448', NULL, 'https://www.iowamason.org/des-moines-scottish-rite-consistory',
 'theater', 1000,
 'Historic venue hosting concerts, shows, and special events'),

-- Living History Farms - 6 events
('Living History Farms',
 ARRAY['Living History', 'LHF'],
 '11121 Hickman Rd', 'Urbandale', 'IA', '50322',
 41.6494, -93.8069,
 '515.278.5286', NULL, 'https://www.lhf.org',
 'museum', NULL,
 'Interactive outdoor museum showcasing 300 years of Iowa history'),

-- Exile Brewing Company - 6 events
('Exile Brewing Company',
 ARRAY['Exile Brewing', 'Exile', 'Exile Brewery'],
 '1514 Walnut St', 'Des Moines', 'IA', '50309',
 41.5856, -93.6322,
 '515.883.2337', NULL, 'https://www.exilebrewing.com',
 'bar', 150,
 'Downtown Des Moines craft brewery with taproom and event space'),

-- Temple Theater - 6 events
('Temple Theater',
 ARRAY['The Temple', 'Temple for Performing Arts', 'Des Moines Symphony - The Temple for Performing Arts'],
 '1011 Locust St', 'Des Moines', 'IA', '50309',
 41.5847, -93.6269,
 '515.246.2300', NULL, 'https://www.desmoinesperformingarts.org',
 'theater', 1200,
 'Historic downtown theater home to Des Moines Symphony and performing arts'),

-- Big Grove Brewery - 6 events
('Big Grove Brewery',
 ARRAY['Big Grove', 'Big Grove Des Moines', 'Big Grove Brewery Des Moines'],
 '555 17th St', 'Des Moines', 'IA', '50309',
 41.5847, -93.6419,
 '515.369.2337', NULL, 'https://www.biggrove.com',
 'bar', 200,
 'Craft brewery and restaurant in downtown Des Moines'),

-- Water Works Park - 5 events
('Water Works Park',
 ARRAY['Waterworks Park', 'Des Moines Water Works Park'],
 '2201 George Flagg Pkwy', 'Des Moines', 'IA', '50321',
 41.5589, -93.6456,
 '515.283.8791', NULL, 'https://www.dsmwaterworks.com',
 'park', NULL,
 'Large urban park with trails, events, and the Lauridsen Amphitheater'),

-- HiFi Brew Lounge - 5 events
('HiFi Brew Lounge',
 ARRAY['HiFi', 'HiFi Lounge', 'Hi-Fi Brew Lounge'],
 '220 E 3rd St', 'Des Moines', 'IA', '50309',
 41.5869, -93.6208,
 '515.288.4334', NULL, NULL,
 'bar', 75,
 'Downtown coffee and beer lounge with live music and events'),

-- Clive Public Library - 5 events
('Clive Public Library',
 ARRAY['Clive Library'],
 '1900 NW 114th St', 'Clive', 'IA', '50325',
 41.6189, -93.7897,
 '515.453.2221', NULL, 'https://www.cityofclive.com/library',
 'other', 100,
 'Public library hosting community events and educational programming'),

-- Anne and Bill Riley Stage (Iowa State Fair) - 5 events
('Anne and Bill Riley Stage',
 ARRAY['Riley Stage', 'Anne Riley Stage', 'Bill Riley Stage'],
 '3000 E Grand Ave', 'Des Moines', 'IA', '50317',
 41.5942, -93.5500,
 '515.262.3111', NULL, 'https://www.iowastatefair.org',
 'amphitheater', 3000,
 'Free entertainment stage at Iowa State Fairgrounds'),

-- Iowa State Fair Grandstand - 5 events
('Iowa State Fair Grandstand',
 ARRAY['Grandstand', 'State Fair Grandstand', 'ISF Grandstand'],
 '3000 E Grand Ave', 'Des Moines', 'IA', '50317',
 41.5936, -93.5478,
 '515.262.3111', NULL, 'https://www.iowastatefair.org',
 'stadium', 12500,
 'Main concert venue at Iowa State Fairgrounds for headliner performances'),

-- Western Gateway Park - 4 events
('Western Gateway Park',
 ARRAY['Western Gateway', 'Gateway Park'],
 '1000 Grand Ave', 'Des Moines', 'IA', '50309',
 41.5867, -93.6342,
 NULL, NULL, 'https://www.dsm.city/departments/parks_and_recreation-background',
 'park', NULL,
 'Downtown park adjacent to Pappajohn Sculpture Park hosting outdoor events'),

-- Varsity Cinema - 4 events
('Varsity Cinema',
 ARRAY['Varsity Theater', 'The Varsity'],
 '1207 25th St', 'Des Moines', 'IA', '50311',
 41.5953, -93.6639,
 '515.277.0404', NULL, 'https://www.varsitydesmoines.com',
 'theater', 300,
 'Historic single-screen cinema showing independent and classic films')

ON CONFLICT (name) DO UPDATE SET
  aliases = EXCLUDED.aliases,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  zip = EXCLUDED.zip,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  website = EXCLUDED.website,
  venue_type = EXCLUDED.venue_type,
  capacity = EXCLUDED.capacity,
  description = EXCLUDED.description;

-- Also add aliases to existing venues that may have variations in event data
UPDATE known_venues SET aliases = ARRAY['Hoyt Sherman', 'HSP', 'Hoyt Sherman Auditorium', 'Hoyt Sherman Theatre']
WHERE name = 'Hoyt Sherman Place';

UPDATE known_venues SET aliases = ARRAY['Civic Center', 'Des Moines Civic Center', 'DMCC', 'Des Moines Civic']
WHERE name = 'Civic Center of Greater Des Moines';

UPDATE known_venues SET aliases = ARRAY['Lauridsen', 'Water Works Amphitheater', 'Waterworks', 'Lauridsen Amphitheater at Water Works Park', 'Lauridsen Amp']
WHERE name = 'Lauridsen Amphitheater';

UPDATE known_venues SET aliases = ARRAY['State Fair', 'Iowa State Fair', 'Fairgrounds', 'ISF', 'Iowa State Fairgrounds']
WHERE name = 'Iowa State Fairgrounds';
