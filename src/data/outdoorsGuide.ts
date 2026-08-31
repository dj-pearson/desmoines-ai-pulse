/**
 * Editorial content for /outdoors (SEO-024).
 *
 * WHY THIS IS STATIC AND NOT A TABLE. Two reasons, both measured on this repo.
 *
 * 1. SEO-027 found that a detail page's canonical sometimes misses the capture
 *    because it waits on a data fetch, and the strict prerender gate then
 *    correctly refuses the page. Every word below is in the bundle, so the
 *    guide renders identically on the first paint of a prerender and cannot
 *    lose a race it does not enter.
 * 2. `trails` holds 8 rows and none of them are the three state and county
 *    parks the keyword data actually rewards (Ledges, Big Creek, Jester Park).
 *    Those are parks, not trails, and bending them into a trail row to get
 *    editorial copy onto the page would have been the wrong shape.
 *
 * WHAT DECIDED THE CONTENT. docs/seo/keyword-research/keyword-opportunities.csv,
 * Outdoors cluster, 19 rows, all 19 returning volume. Each section below names
 * the rows it answers in `searchTerms`. The buckets are Keyword Planner
 * order-of-magnitude buckets from an account with no ad spend, so they order
 * the work and no traffic forecast comes off them.
 *
 * Nothing here restates a figure this repo cannot support. Where central Iowa
 * genuinely does not have the thing somebody searched for - waterfalls being
 * the honest example - the answer says so rather than padding.
 */

export interface OutdoorsLogistics {
  /** Driving distance and time from downtown Des Moines. */
  fromDowntown: string;
  parking: string;
  trailhead: string;
  /** "dog parks des moines" (500/mo) and the leash question every park page dodges. */
  dogs: string;
  /** "what is open in winter" - the question the CVB does not answer. */
  winter: string;
  cost: string;
}

export interface OutdoorsDestination {
  /** Anchor id, also the deep-link target from the summary table. */
  id: string;
  name: string;
  /** schema.org type for this place. */
  schemaType: "Park" | "TouristAttraction";
  /** Short label under the heading: "State park", "Rail trail". */
  kind: string;
  /** One line that answers "should I go". */
  headline: string;
  body: string[];
  logistics: OutdoorsLogistics;
  address: { street?: string; city: string; state: string; zip?: string };
  geo: { latitude: number; longitude: number };
  /** Our own page for this place, when there is one. */
  internalPath?: string;
  officialUrl: string;
  /** The keyword-opportunities.csv rows this section is written against. */
  searchTerms: string[];
}

export const OUTDOORS_DESTINATIONS: OutdoorsDestination[] = [
  {
    id: "grays-lake-park",
    name: "Gray's Lake Park",
    schemaType: "Park",
    kind: "City park, 2 miles from downtown",
    headline:
      "The 1.9-mile loop with the lit bridge, and the easiest outdoor hour in Des Moines.",
    body: [
      "Gray's Lake is the park most people mean when they say they went for a walk in Des Moines. The Kruidenier Trail runs 1.9 miles around the water on flat asphalt, wide enough that runners, strollers and bikes pass each other without anyone stepping off. The Meredith Trail bridge cuts across the middle of the lake and is lit after dark, which is why the loop stays busy on winter evenings when every other trail in the metro is empty.",
      "The skyline sits directly across the water on the north side, so this is also where the city photographs itself. Come at sunset on a clear evening and you will be sharing the bridge. Come at 7am and you will have it.",
      "In summer the boathouse rents kayaks, paddleboards and pedal boats, and there is a swimming beach on the east shore. The park connects straight into the Bill Riley Trail, so a lap around the lake can turn into a ride to Water Works Park or downtown without crossing a road.",
    ],
    logistics: {
      fromDowntown: "2 miles, about 6 minutes down Fleur Drive.",
      parking:
        "Free lots on both sides. The main lot at 2101 Fleur Drive fills first on summer evenings; the Raccoon River Drive side almost never does.",
      trailhead:
        "Start at the Fleur Drive lot for the shortest walk to the bridge, or at the boathouse if you want rentals.",
      dogs: "Leashed dogs are welcome on the loop. There is no off-leash area inside the park, so the nearest fenced run is a short drive away.",
      winter:
        "Open and worth it. The loop is cleared through winter and the bridge lights run year round, which makes this one of the few places in the metro to walk after dark in January.",
      cost: "Free. Rentals are seasonal and paid.",
    },
    address: {
      street: "2101 Fleur Dr",
      city: "Des Moines",
      state: "IA",
      zip: "50321",
    },
    geo: { latitude: 41.5673, longitude: -93.6333 },
    internalPath: "/outdoors/grays-lake-trail",
    officialUrl: "https://www.dsm.city/departments/parks_and_recreation/parks/grays_lake_park.php",
    searchTerms: ["grays lake park des moines", "best bike trails des moines"],
  },
  {
    id: "ledges-state-park",
    name: "Ledges State Park",
    schemaType: "Park",
    kind: "State park near Madrid, Boone County",
    headline:
      "Sandstone canyon walls, a creek you drive through, and the only real hiking within an hour.",
    body: [
      "Ledges is where central Iowa stops being flat. Pease Creek has cut a narrow canyon through sandstone bluffs that rise about 100 feet, and Canyon Road runs along the bottom of it, crossing the creek at a series of low fords. Driving through the water is half the reason people come, and the fords are exactly why the road closes whenever the creek is up.",
      "The trail system is roughly four miles of loops, and it is genuinely hilly. Stone steps built by the Civilian Conservation Corps climb the canyon walls to overlooks above the Des Moines River. If somebody has told you there is no hiking near Des Moines, this is the park that proves them wrong.",
      "Go on a weekday if you can. On an October Saturday the canyon parking is full by mid-morning and the road becomes a queue.",
    ],
    logistics: {
      fromDowntown:
        "About 35 miles, 40 minutes northwest via I-35 and Iowa 17 through Madrid.",
      parking:
        "Several free lots along Canyon Road plus the upper day-use area. The upper lots stay open when the canyon does not.",
      trailhead:
        "Canyon Road for the creek crossings and the CCC steps; the upper campground area for the ridge trails and the river overlooks.",
      dogs: "Leashed dogs are allowed on Iowa state park trails. The stone steps are steep and wet in places, so a short leash matters here more than on the paved trails.",
      winter:
        "Canyon Road closes for the season, but the park and the upper trails stay open. Bare sandstone and ice do not mix, so treat the steps as a spring-through-fall route.",
      cost: "Free. Iowa charges no entrance fee at state parks.",
    },
    address: {
      street: "1519 250th St",
      city: "Madrid",
      state: "IA",
      zip: "50156",
    },
    geo: { latitude: 41.9964, longitude: -93.8836 },
    officialUrl: "https://www.iowadnr.gov/Places-to-Go/State-Parks/Iowa-State-Parks/Ledges-State-Park",
    searchTerms: [
      "ledges state park",
      "state parks near des moines",
      "best hiking near des moines",
      "waterfalls near des moines",
    ],
  },
  {
    id: "high-trestle-trail",
    name: "High Trestle Trail",
    schemaType: "TouristAttraction",
    kind: "25-mile paved rail trail, Ankeny to Woodward",
    headline:
      "The bridge is the destination. Ride it at dusk and stay for the lights.",
    body: [
      "The High Trestle Trail Bridge stands 13 stories above the Des Moines River valley between Madrid and Woodward, half a mile long, framed by 41 steel ribs that twist as you ride through them. The effect is a mine shaft, which is deliberate: the valley below was coal country. After dark the frames are lit blue and the bridge becomes the single most photographed structure in central Iowa.",
      "The trail itself is 25 miles of flat asphalt through Ankeny, Sheldahl, Slater, Madrid and Woodward. Most people never ride all of it. The overwhelming majority of traffic is an out-and-back to the bridge from one of the two nearest trailheads.",
      "Both approaches work. From Woodward it is about 2.5 miles to the bridge; from Madrid it is roughly 1.5. Madrid is the shorter walk if you are bringing people who do not want to ride.",
    ],
    logistics: {
      fromDowntown:
        "Woodward trailhead is about 32 miles and 40 minutes northwest. The Madrid trailhead is closer to 28 miles and 35 minutes.",
      parking:
        "Free lots at the Woodward, Madrid, Slater, Sheldahl and Ankeny trailheads. Woodward and Madrid are the ones that fill, and on a warm Saturday evening they fill completely.",
      trailhead:
        "Madrid for the shortest walk to the bridge, Woodward for the trailhead with the most parking and the shortest wait for food afterwards.",
      dogs: "Leashed dogs are fine on the trail and on the bridge. The deck is open steel grating in places and dogs often dislike it, so expect to carry a small one across.",
      winter:
        "Open, not plowed. The lights run year round and a still, cold night is the clearest view of them you will get all year. Walk it rather than ride it.",
      cost: "Free. Bike rentals near the Woodward and Madrid trailheads are seasonal and worth calling ahead about.",
    },
    address: {
      street: "5th St and Broad St",
      city: "Woodward",
      state: "IA",
      zip: "50276",
    },
    geo: { latitude: 41.8583, longitude: -93.9222 },
    internalPath: "/outdoors/high-trestle-trail",
    officialUrl: "https://www.hightrestletrail.org/",
    searchTerms: [
      "high trestle trail parking",
      "high trestle trail bike rental",
      "best bike trails des moines",
    ],
  },
  {
    id: "raccoon-river-valley-trail",
    name: "Raccoon River Valley Trail",
    schemaType: "TouristAttraction",
    kind: "89-mile paved rail trail, Dallas and Greene counties",
    headline:
      "A paved loop long enough to plan a weekend around, with a town every few miles.",
    body: [
      "The Raccoon River Valley Trail is the longest paved trail in the metro's reach, and its shape is what makes it unusual: a large loop through Dallas and Greene counties with spurs, so you can ride a circuit and come back to your car without repeating a mile. Waukee, Adel, Dallas Center, Minburn, Perry, Jefferson, Panora and Yale all sit on it.",
      "The towns are the point. Adel has a courthouse square you can reach without touching a road, Minburn and Dawson have trailside stops, and Perry has the Hotel Pattee if you want to split the loop over two days. Riders who complain about Iowa being boring have usually not ridden a trail that goes somewhere.",
      "Note the trail pass. The Raccoon River Valley Trail is one of the few in the state that charges: riders 18 and over need a pass, sold daily or annually at trailhead kiosks and local bike shops. It is a small amount and it is enforced.",
    ],
    logistics: {
      fromDowntown:
        "The Waukee trailhead is about 17 miles and 25 minutes west on I-235 and University Avenue.",
      parking:
        "Free lots at every town on the loop. Waukee and Adel are the busiest; Minburn and Dawson are empty most weekends.",
      trailhead:
        "Waukee for the shortest drive, Adel if you want a 12-mile out-and-back that ends at a square with lunch on it.",
      dogs: "Leashed dogs are allowed. There is no shade on long stretches of the open sections, so summer afternoons are hard on paws and pavement runs hot.",
      winter:
        "Open and not plowed. The surface underneath is good, so a dry cold spell makes for fast, empty riding.",
      cost: "Trail pass required for riders 18 and over, sold at trailhead kiosks. Walking and running are free.",
    },
    address: { city: "Waukee", state: "IA", zip: "50263" },
    geo: { latitude: 41.6027, longitude: -93.8858 },
    internalPath: "/outdoors/raccoon-river-valley-trail",
    officialUrl: "https://www.raccoonrivervalleytrail.org/",
    searchTerms: ["raccoon river valley trail", "best bike trails des moines"],
  },
  {
    id: "neal-smith-trail",
    name: "Neal Smith Trail",
    schemaType: "TouristAttraction",
    kind: "26-mile paved trail, Des Moines to Big Creek",
    headline:
      "The one that gets you out of the city without a car. Downtown to a state park lake.",
    body: [
      "The Neal Smith Trail runs 26 paved miles from the north side of Des Moines up the river corridor, around Saylorville Lake, and into Big Creek State Park. It is the trail that turns a city ride into a destination ride, and it is the reason a lot of people in the metro own a road bike at all.",
      "The middle section along Saylorville is the good part: water on one side, timber on the other, and the Saylorville dam and visitor center roughly halfway. Riding north the climbs are gentle but they are there, which surprises people who expect Iowa to be level.",
      "At the top end it drops you into Big Creek, so an out-and-back can end with a swim, a fishing hour or lunch at the beach before you turn around.",
    ],
    logistics: {
      fromDowntown:
        "The Birdland Park trailhead is about 4 miles and 10 minutes north of downtown.",
      parking:
        "Free at Birdland Park, at several Saylorville access points and at Big Creek. Big Creek's beach lot is the one that fills.",
      trailhead:
        "Birdland Park if you want the full run north. The Saylorville visitor center lot if you want the lake section without the city miles.",
      dogs: "Leashed dogs are welcome. Big Creek at the north end has water access, which is worth knowing on an August ride.",
      winter:
        "Open, not plowed, and exposed along the lake. Wind off Saylorville is the deciding factor most winter days.",
      cost: "Free.",
    },
    address: { city: "Des Moines", state: "IA", zip: "50317" },
    geo: { latitude: 41.6267, longitude: -93.5544 },
    internalPath: "/outdoors/neal-smith-trail",
    officialUrl: "https://www.polkcountyiowa.gov/conservation/parks-trails/",
    searchTerms: ["neal smith trail des moines", "best bike trails des moines"],
  },
  {
    id: "great-western-trail",
    name: "Great Western Trail",
    schemaType: "TouristAttraction",
    kind: "17-mile rail trail, Des Moines to Martensdale",
    headline: "Quiet farmland riding, and the least crowded trail on this list.",
    body: [
      "The Great Western runs 17 miles south out of Des Moines through Cumming and Orilla to Martensdale, following an old rail bed through Warren County. It sees a fraction of the traffic the High Trestle and the Raccoon River Valley get, which is precisely its appeal: on a weekday you can ride for an hour and see four people.",
      "The scenery is rolling farmland, restored prairie and timber, and it changes hard with the season. Wildflowers through late spring and early summer, and a good stretch of color in the first half of October.",
      "Cumming, about five miles down from the north end, is the traditional turnaround. Most riders go out that far, stop, and come back, which makes a comfortable 10 miles.",
    ],
    logistics: {
      fromDowntown:
        "The north trailhead off Park Avenue is about 5 miles and 12 minutes south. The Martensdale end is roughly 20 miles and 25 minutes.",
      parking: "Free lots at the north trailhead, Cumming and Martensdale.",
      trailhead:
        "Park Avenue for the city end, Cumming if you want to shorten the ride and still have somewhere to stop.",
      dogs: "Leashed dogs are allowed and this is the easiest trail on the list to bring one on, because the traffic is light and the surface is forgiving.",
      winter: "Open, not plowed, and very quiet. Expect to break your own track after snow.",
      cost: "Free.",
    },
    address: { city: "Martensdale", state: "IA", zip: "50160" },
    geo: { latitude: 41.3836, longitude: -93.7419 },
    internalPath: "/outdoors/great-western-trail",
    officialUrl: "https://www.wcciowa.com/",
    searchTerms: ["great western trail des moines", "best bike trails des moines"],
  },
  {
    id: "big-creek-state-park",
    name: "Big Creek State Park",
    schemaType: "Park",
    kind: "State park at Polk City, on Saylorville",
    headline: "An 866-acre lake with a beach, boat ramps and the metro's best easy fishing.",
    body: [
      "Big Creek is the lake people in Des Moines drive to when they want water without driving to the Ozarks. The lake covers about 866 acres, there is a sand beach with a swimming area, and boat ramps at both ends. No-wake rules on much of it keep the water calm, which is why it is the standard answer for anyone learning to kayak or paddleboard.",
      "Fishing is the other draw. Bluegill, crappie, largemouth bass, walleye and muskie are all in there, and the jetties and shoreline access mean you do not need a boat to catch anything. Iowa requires a fishing license for anglers 16 and over.",
      "The Neal Smith Trail comes into the park from the south, so Big Creek doubles as the turnaround for the metro's longest ride.",
    ],
    logistics: {
      fromDowntown:
        "About 20 miles and 30 minutes north via I-35 and Iowa 415 through Polk City.",
      parking: "Free lots at the beach, the marina and both boat ramps. The beach lot fills on hot Saturdays.",
      trailhead:
        "The beach lot for swimming and the trail; the north ramp for fishing away from the crowd.",
      dogs: "Leashed dogs are allowed in the park and on the trail, but not on the designated swimming beach.",
      winter:
        "Open year round and this is the season locals use it for. Ice fishing when the ice is safe, and cross-country skiing when there is enough snow. Check DNR conditions rather than guessing at ice.",
      cost: "Free. A fishing license is required for anglers 16 and over.",
    },
    address: {
      street: "8794 NW 125th Ave",
      city: "Polk City",
      state: "IA",
      zip: "50226",
    },
    geo: { latitude: 41.7877, longitude: -93.7393 },
    officialUrl: "https://www.iowadnr.gov/Places-to-Go/State-Parks/Iowa-State-Parks/Big-Creek-State-Park",
    searchTerms: [
      "big creek state park",
      "state parks near des moines",
      "fishing near des moines",
      "kayaking des moines",
    ],
  },
  {
    id: "jester-park",
    name: "Jester Park",
    schemaType: "Park",
    kind: "Polk County park at Granger, on Saylorville",
    headline: "Bison and elk, a nature center, a natural playscape and 1,600 acres of shoreline.",
    body: [
      "Jester Park is the largest park Polk County runs, spread along the west side of Saylorville Lake, and it does more things at once than anywhere else on this list. There is a bison and elk enclosure you can drive past, a nature center with programs most weekends, an equestrian center, a golf course, campgrounds, shelters and miles of shoreline.",
      "For families it is the natural playscape that decides it: logs, water, sand and boulders instead of molded plastic, built for children who would rather build something than climb a ladder. It is the single best reason to make the drive with kids under ten.",
      "The park is big enough that you should pick one thing. Trying to do the bison, the nature center, the playscape and the shoreline in an afternoon is how people end up leaving annoyed.",
    ],
    logistics: {
      fromDowntown:
        "About 22 miles and 30 minutes northwest via I-35/80 and NW 121st Street.",
      parking:
        "Free lots throughout, one at each area. The playscape lot is the one that fills on a good Saturday.",
      trailhead:
        "Park at the nature center for the interpretive trails, at the playscape for families, or at the boat ramp for shoreline access.",
      dogs: "Leashed dogs are welcome across most of the park and there is an off-leash area. Dogs are not allowed in the bison and elk enclosure area or the nature center.",
      winter:
        "Open year round. The shoreline is exposed and the trails are not cleared, but the bison are easier to see once the leaves are down.",
      cost: "Free. Camping, equestrian and golf are paid.",
    },
    address: {
      street: "12130 NW 128th St",
      city: "Granger",
      state: "IA",
      zip: "50109",
    },
    geo: { latitude: 41.7822, longitude: -93.7906 },
    officialUrl: "https://www.polkcountyiowa.gov/conservation/parks-trails/jester-park/",
    searchTerms: ["jester park", "dog parks des moines", "campgrounds near des moines"],
  },
];

/**
 * The rest of the Outdoors cluster: rows in keyword-opportunities.csv that ask
 * an activity question rather than name a place. Each of these was a query
 * somebody actually ran, and the answer is written to be true rather than
 * complete - "waterfalls near des moines" gets told there are barely any,
 * because that is the fact and a padded answer would be worse than none.
 */
export interface OutdoorsTopic {
  id: string;
  heading: string;
  body: string[];
  searchTerms: string[];
  /** Internal pages that genuinely answer part of this topic. */
  links?: Array<{ label: string; to: string }>;
}

export const OUTDOORS_TOPICS: OutdoorsTopic[] = [
  {
    id: "dog-parks",
    heading: "Dog parks and where dogs can actually go",
    body: [
      "Leashed dogs are allowed on every trail on this page and in every park listed. Off leash is the part people get wrong: in Des Moines and in the county parks, off leash is legal only inside a fenced or posted off-leash area, and a ranger will enforce it at Saylorville and Big Creek.",
      "The metro's best-known runs are the fenced area at Raccoon River Park in West Des Moines, which has its own pond and a separate small-dog side, the off-leash area at Ewing Park on the south side of Des Moines, and the off-leash area at Jester Park. All three are free.",
      "For a walk rather than a run, Gray's Lake and the Clive Greenbelt are the two most forgiving: flat, shaded in stretches, and short enough that an older dog can finish.",
    ],
    searchTerms: ["dog parks des moines"],
    links: [
      { label: "Gray's Lake Trail", to: "/outdoors/grays-lake-trail" },
      { label: "Clive Greenbelt Trail", to: "/outdoors/clive-greenbelt-trail" },
    ],
  },
  {
    id: "disc-golf",
    heading: "Disc golf",
    body: [
      "Central Iowa is well supplied with free courses and almost none of them charge. Ewing Park on the south side of Des Moines is the course most locals name first, wooded and long enough to punish a bad drive. Jester Park has a course set in open county parkland, which plays completely differently in wind.",
      "Suburban courses are generally shorter and flatter, which makes them the right place to start if you have never thrown a driver. Bring more discs than you think you need in spring, when the creeks are up.",
    ],
    searchTerms: ["disc golf des moines"],
    links: [{ label: "Jester Park area guide", to: "/outdoors#jester-park" }],
  },
  {
    id: "paddling",
    heading: "Kayaking, paddleboarding and the rivers",
    body: [
      "Three kinds of water, and they suit different days. Flat water: Gray's Lake rents kayaks, paddleboards and pedal boats in season and is the easiest first paddle in the city. Big Creek is the larger version, calm enough for beginners once you stay out of the boat lanes.",
      "Moving water: the Raccoon and the Des Moines rivers both run through the metro and both are paddled regularly, with access points and a series of dam removals and rebuilds along the downtown stretch aimed at making the river runnable rather than dangerous. Read the current conditions before putting in. River levels here move fast after rain and the hazard is real.",
      "Rentals are seasonal everywhere. Nothing on this list rents in March.",
    ],
    searchTerms: ["kayaking des moines"],
    links: [
      { label: "Gray's Lake Trail", to: "/outdoors/grays-lake-trail" },
      { label: "Things to do in Des Moines", to: "/things-to-do" },
    ],
  },
  {
    id: "fishing",
    heading: "Fishing near Des Moines",
    body: [
      "Big Creek is the default answer and deserves it: bluegill, crappie, largemouth bass, walleye and muskie, with enough shoreline and jetty access that a boat is optional. Saylorville Lake next door is the bigger water and fishes better from a boat.",
      "Inside the city, Easter Lake on the south side has been dredged and restocked and is now a genuinely good panfish lake, and Gray's Lake takes shore anglers who want twenty minutes rather than a day.",
      "Iowa requires a fishing license for anglers 16 and over. Buy it before you go; the DNR sells online and at most bait shops.",
    ],
    searchTerms: ["fishing near des moines"],
  },
  {
    id: "camping",
    heading: "Campgrounds near Des Moines",
    body: [
      "Four options cover almost every trip. Ledges State Park has a campground at the top of the canyon and is the one to book if you want hiking out of the tent door. Jester Park has campsites on the Saylorville shoreline plus cabins. The Corps of Engineers campgrounds around Saylorville, including Acorn Valley, Prairie Flower and Cherry Glen, are the biggest and the closest to the water. Walnut Woods State Park in West Des Moines is the one you can reach in fifteen minutes.",
      "Book state park sites through the Iowa DNR reservation system and Corps sites through recreation.gov. Summer weekends at Saylorville go months ahead; a Tuesday in September you can walk in.",
    ],
    searchTerms: ["campgrounds near des moines"],
  },
  {
    id: "waterfalls",
    heading: "Waterfalls near Des Moines, honestly",
    body: [
      "Central Iowa does not have waterfalls, and every list that says otherwise is padding. What is here is small: seasonal cascades along Pease Creek at Ledges after heavy rain, and the spillway below the Saylorville dam, which is engineering rather than scenery but is genuinely loud in a wet spring.",
      "The nearest waterfalls worth a drive are in northeast Iowa, two and a half to three hours away, and they are a weekend rather than an afternoon. If you have an afternoon, Ledges is the closest thing to canyon scenery you will find.",
    ],
    searchTerms: ["waterfalls near des moines"],
    links: [{ label: "Ledges State Park", to: "/outdoors#ledges-state-park" }],
  },
  {
    id: "scenic-drives",
    heading: "Scenic drives",
    body: [
      "Three, in order of how far you have to commit. The Covered Bridges Scenic Byway loops through Madison County about 45 minutes southwest and takes half a day with stops, including Winterset. The Des Moines River corridor north through Madrid, Ledges and Boone pairs a drive with the best hiking on this page. And the Loess Hills National Scenic Byway on the western edge of the state, roughly two hours out, is the only landscape in Iowa that looks like nowhere else in the Midwest.",
      "October is the obvious month for all three and every one of them is busier for it.",
    ],
    searchTerms: ["scenic drives near des moines"],
  },
  {
    id: "state-parks",
    heading: "State parks near Des Moines",
    body: [
      "Within an hour: Ledges near Madrid for canyon hiking, Big Creek at Polk City for the lake, Walnut Woods in West Des Moines for river bottom timber fifteen minutes from downtown, and Lake Ahquabi south of Indianola for a quiet lake with a good loop trail. Push to ninety minutes and Elk Rock on Lake Red Rock and Springbrook near Guthrie Center open up.",
      "Iowa charges no entrance fee at any of them. Camping and shelters are the only paid parts.",
    ],
    searchTerms: ["state parks near des moines"],
  },
  {
    id: "winter",
    heading: "What is open in winter",
    body: [
      "Most outdoor writing about Des Moines quietly stops in October, which is unhelpful in a city that has winter for five months. The short version: everything on this page stays open, almost none of it is plowed, and two things are actively better cold.",
      "Gray's Lake is cleared and lit, so it is the reliable winter walk. The High Trestle bridge lights are at their sharpest on a still, clear January night with nobody else on the deck. Big Creek gets ice fishing and, in a good snow year, cross-country skiing. Ledges closes Canyon Road for the season and the sandstone steps ice over, so save it for spring.",
      "Trail surfaces underneath are good, which means a dry cold spell gives you fast, empty miles on the Raccoon River Valley and the Great Western.",
    ],
    searchTerms: ["best hiking near des moines", "best bike trails des moines"],
  },
];

/**
 * FAQPage content. Deliberately NOT a restatement of the sections above:
 * FAQSection renders answers only when a visitor opens one, so this text ships
 * to crawlers in JSON-LD and to nobody else. The visible answers to these
 * questions live in the destination and topic copy.
 */
export const OUTDOORS_FAQS = [
  {
    question: "Where do you park for the High Trestle Trail bridge?",
    answer:
      "The two closest free trailhead lots are Madrid, about 1.5 miles from the bridge, and Woodward, about 2.5 miles. Madrid is the shorter walk and Woodward has more parking and more places to eat afterwards. Both fill on warm weekend evenings, when the bridge lights draw a crowd. There are additional free lots at Slater, Sheldahl and Ankeny if you want to ride further.",
  },
  {
    question: "What is the best hiking near Des Moines?",
    answer:
      "Ledges State Park near Madrid, about 40 minutes northwest, is the only place within an hour with real elevation: a sandstone canyon roughly 100 feet deep, about four miles of loop trails, and stone steps built by the Civilian Conservation Corps. Closer in, the Sycamore Trail at Pleasant Hill is 3.5 miles of wooded ravines and creek crossings, and Walnut Woods State Park in West Des Moines is river bottom timber fifteen minutes from downtown.",
  },
  {
    question: "Are dogs allowed on Des Moines trails?",
    answer:
      "Yes, on a leash, on every trail and in every park listed here. Off-leash is only legal inside a fenced or posted off-leash area. The main free off-leash areas in the metro are at Raccoon River Park in West Des Moines, Ewing Park in Des Moines and Jester Park at Granger. Dogs are not allowed on the designated swimming beach at Big Creek State Park.",
  },
  {
    question: "How far is Ledges State Park from Des Moines?",
    answer:
      "About 35 miles and 40 minutes northwest of downtown Des Moines, via I-35 and Iowa 17 through Madrid. There is no entrance fee. Canyon Road, the road that crosses Pease Creek at a series of low fords, closes when the creek is high and again for the winter season, but the upper trails and the day-use area stay open.",
  },
  {
    question: "Which trails near Des Moines are open in winter?",
    answer:
      "All of them are open and almost none are plowed. Gray's Lake is the exception: its 1.9-mile loop is cleared and the Meredith Trail bridge is lit year round, which makes it the reliable winter walk in the city. Big Creek State Park adds ice fishing and cross-country skiing in a good snow year. Ledges closes Canyon Road for the season and its sandstone steps ice over, so it is best saved for spring through fall.",
  },
  {
    question: "Do you need a pass to ride the Raccoon River Valley Trail?",
    answer:
      "Yes. Riders 18 and over need a trail pass, sold daily or annually at trailhead kiosks and local bike shops along the route. Walking and running are free. It is one of the few Iowa trails that charges, and it is enforced. The trail is an 89-mile paved loop through Waukee, Adel, Dallas Center, Minburn, Perry, Jefferson, Panora and Yale.",
  },
  {
    question: "What state parks are near Des Moines?",
    answer:
      "Within an hour of downtown: Ledges State Park near Madrid for canyon hiking, Big Creek State Park at Polk City for an 866-acre lake with a beach and boat ramps, Walnut Woods State Park in West Des Moines for river bottom timber, and Lake Ahquabi south of Indianola. At ninety minutes, Elk Rock on Lake Red Rock and Springbrook near Guthrie Center. Iowa charges no entrance fee at any state park.",
  },
  {
    question: "Where can you go kayaking around Des Moines?",
    answer:
      "Gray's Lake rents kayaks, paddleboards and pedal boats in season and is the easiest flat-water paddle in the city. Big Creek State Park is the larger calm-water option, with boat ramps at both ends. The Raccoon and Des Moines rivers are both paddled through the metro, with public access points along each; check current river levels before putting in, because they rise fast after rain. All rentals are seasonal.",
  },
  {
    question: "Are there waterfalls near Des Moines?",
    answer:
      "Not really, and lists that claim otherwise are padding. Central Iowa has seasonal cascades along Pease Creek at Ledges State Park after heavy rain, and the spillway below the Saylorville dam. The nearest waterfalls worth a dedicated trip are in northeast Iowa, two and a half to three hours away.",
  },
  {
    question: "Where can you camp near Des Moines?",
    answer:
      "Ledges State Park has a campground above the canyon, Jester Park has shoreline campsites and cabins on Saylorville, and the Corps of Engineers runs the largest campgrounds around Saylorville Lake, including Acorn Valley, Prairie Flower and Cherry Glen. Walnut Woods State Park in West Des Moines is the closest to downtown at about fifteen minutes. Book state park sites through the Iowa DNR and Corps sites through recreation.gov; summer weekends fill months ahead.",
  },
];
