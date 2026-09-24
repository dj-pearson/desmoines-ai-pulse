import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { FAQSection } from "@/components/FAQSection";
import SEOHead from '@/components/SEOHead';
import { getCanonicalUrl } from '@/lib/brandConfig';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Car, Building, Bike, Plane, Bus, Navigation, Footprints, Hotel } from "lucide-react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import {
  AIRPORT_TO_DOWNTOWN,
  BCYCLE,
  DART_FARES,
  SKYWALK,
  airportFaqAnswer,
  verificationLine,
} from "@/lib/transitFacts";

/*
 * plan-stay WP3 item 7. This list used to carry rates ("$1/hr, $10 max") and
 * hours ("24/7") with no source; the page itself admitted they were a rough
 * guide. The figures are gone. What stays is where each garage is, with a
 * one-tap directions link from the coordinates, and a pointer to ParkDSM and
 * the posted signs for what it costs today.
 */
interface ParkingGarage {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const PARKING_GARAGES: readonly ParkingGarage[] = [
  { name: 'Capital Square Garage', address: '400 Locust St', lat: 41.5867, lng: -93.625 },
  { name: 'City Parking Ramp', address: '300 SW 5th St', lat: 41.5839, lng: -93.631 },
  { name: 'Civic Center Garage', address: '221 Walnut St', lat: 41.5851, lng: -93.6271 },
  { name: 'Iowa Events Center lots', address: '730 3rd St', lat: 41.5908, lng: -93.6208 },
  { name: 'Court Avenue Garage', address: '309 Court Ave', lat: 41.5844, lng: -93.6213 },
];

function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

const DISTANCE_TABLE = [
  { destination: 'East Village', drive: '3 min', transit: '5 min walk', distance: '0.3 mi' },
  { destination: 'Gray\'s Lake', drive: '5 min', transit: '15 min bike', distance: '2.1 mi' },
  { destination: 'Valley Junction', drive: '10 min', transit: 'DART bus', distance: '5.2 mi' },
  { destination: 'Jordan Creek Mall', drive: '15 min', transit: 'DART bus', distance: '10.5 mi' },
  { destination: 'Adventureland', drive: '20 min', transit: 'N/A', distance: '14.2 mi' },
  { destination: 'Ames (Iowa State)', drive: '35 min', transit: 'N/A', distance: '30 mi' },
  { destination: 'DSM Airport (DSM)', drive: '10 min', transit: 'DART bus', distance: '5.1 mi' },
];

// The airport and skywalk answers are built from the same constants the page
// body renders (plan-stay WP3 item 2), so the two cannot disagree again.
const FAQ_ITEMS = [
  { question: 'Is there Uber in Des Moines?', answer: 'Yes. Both Uber and Lyft operate throughout the Des Moines metro area. Waits are usually shortest downtown and longer in the suburbs; check the app for a live estimate.' },
  { question: 'Where should I park downtown?', answer: 'Downtown Des Moines has multiple parking garages, and the ParkDSM app lets you pay from your phone. Rates and street-parking hours change, so confirm posted signage or the app before you leave the car.' },
  { question: 'Does Des Moines have a subway?', answer: 'No, Des Moines does not have a subway or light rail system. The city is served by DART (Des Moines Area Regional Transit) buses. Check ridedart.com for current routes and schedules.' },
  { question: 'How do I get from the airport to downtown?', answer: airportFaqAnswer() },
  { question: 'What is the Des Moines Skywalk?', answer: `${SKYWALK.summary} ${SKYWALK.hours}` },
];

export default function GettingAround() {
  return (
    <>
      {/* SEO-022. The page's own schema is the FAQPage that FAQSection emits
          from FAQ_ITEMS below - the queries this page wins are questions, and
          FAQPage is the type that matches. SEOHead is here for the canonical,
          which the bare Helmet never supplied. */}
      <SEOHead
        title="Des Moines Parking & Transit"
        description="How to get around Des Moines: downtown parking garages, skywalk system guide, BCycle bike share, DART transit, airport info, and rideshare tips."
        url={getCanonicalUrl('/getting-around')}
        canonicalUrl={getCanonicalUrl('/getting-around')}
        keywords={[
          'Des Moines parking',
          'Des Moines skywalk',
          'DART bus Des Moines',
          'Des Moines airport to downtown',
        ]}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Getting Around', url: '/getting-around' },
        ]}
      />
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8" data-page-body="getting-around">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
              <Navigation className="h-5 w-5" />
              <span className="font-semibold">Visitor Transportation Guide</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Getting Around Des Moines
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Parking, the skywalk, bike share, DART and the airport, with where each figure came from.
            </p>
          </div>

          {/* Parking & ParkDSM */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Car className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Parking &amp; ParkDSM</h2>
            </div>
            <p className="text-muted-foreground mb-4 max-w-prose">
              Download the <strong>ParkDSM</strong> app to pay from your phone. We list
              where the main garages are, not what they charge: rates and hours change,
              so check the app or the sign at the entrance.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {PARKING_GARAGES.map((garage) => (
                <Card key={garage.name}>
                  <CardContent className="p-4">
                    <h3 className="font-semibold">{garage.name}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <SpriteIcon name="map-pin" className="h-3 w-3" /> {garage.address}
                    </p>
                    <Button asChild variant="outline" size="sm" className="min-h-11 mt-3">
                      <a
                        href={directionsUrl(garage.lat, garage.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Directions to ${garage.name}`}
                      >
                        <SpriteIcon name="external-link" className="h-4 w-4 mr-1" /> Directions
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Skywalk System */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Building className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Skywalk System</h2>
            </div>
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground mb-3 max-w-prose">
                  {SKYWALK.summary} It matters most in an Iowa winter.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><strong className="text-foreground">Hours:</strong> {SKYWALK.hours}</li>
                  <li><strong className="text-foreground">Connects:</strong> hotels, parking garages, restaurants, offices, the Iowa Events Center and the Des Moines Civic Center</li>
                  <li><strong className="text-foreground">Getting in:</strong> look for the &ldquo;Skywalk&rdquo; signs at building entrances</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* BCycle Bike Share */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Bike className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">BCycle Bike Share</h2>
            </div>
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground mb-3 max-w-prose">{BCYCLE.summary}</p>
                <p className="text-sm text-muted-foreground mb-4 max-w-prose">{BCYCLE.pricing}</p>
                <Button asChild variant="outline" size="sm" className="min-h-11">
                  <a href={BCYCLE.siteUrl} target="_blank" rel="noopener noreferrer">
                    <SpriteIcon name="external-link" className="h-4 w-4 mr-1" /> BCycle website
                  </a>
                </Button>
              </CardContent>
            </Card>
          </section>

          {/* Rideshare */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Car className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Rideshare</h2>
            </div>
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground">
                  Both <strong>Uber</strong> and <strong>Lyft</strong> operate throughout the Des Moines metro. Waits are usually shortest downtown and longer in the suburbs. Fares move with demand, so check the app for a live quote rather than a printed range.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Airport */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Plane className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Des Moines International Airport (DSM)</h2>
            </div>
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground mb-4 max-w-prose">{AIRPORT_TO_DOWNTOWN.summary}</p>
                <h3 className="font-semibold mb-2">Getting downtown</h3>
                <ul className="text-sm text-muted-foreground space-y-1 max-w-prose">
                  {AIRPORT_TO_DOWNTOWN.options.map((option) => (
                    <li key={option.label}>
                      <strong className="text-foreground">{option.label}:</strong> {option.detail}
                    </li>
                  ))}
                  <li>
                    <strong className="text-foreground">DART bus:</strong> {AIRPORT_TO_DOWNTOWN.bus}
                  </li>
                </ul>
                <p className="text-sm text-muted-foreground mt-3">
                  For airlines and nonstop destinations, see{' '}
                  <a href="https://www.flydsm.com" target="_blank" rel="noopener noreferrer" className="underline">flydsm.com</a>.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Public Transit */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Bus className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Public Transit (DART)</h2>
            </div>
            <Card>
              <CardContent className="p-6">
                {/* WEB-FEAT-023. The D-Line claim that used to lead this
                    section is gone. Checked 2026-09-09: its route page 404s,
                    the DART fares page does not mention it, and DART's current
                    bus-routes page (modified 2026-08-31) contains no "D-Line",
                    "circulator" or "free" at all. We are not sending visitors
                    to a bus we cannot show still runs. */}
                <p className="text-muted-foreground mb-4">
                  DART (Des Moines Area Regional Transit) operates bus routes across the
                  metro, with real-time tracking and mobile fare payment in the MyDART app.
                </p>
                <div data-fact-set={DART_FARES.id}>
                  <ul className="text-sm text-muted-foreground space-y-1 mb-2">
                    {DART_FARES.facts.map((fact) => (
                      <li key={fact.label}>
                        <strong>{fact.label}:</strong> {fact.value}
                        {fact.note ? ` (${fact.note})` : ""}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground mb-4">
                    <a href={DART_FARES.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      {verificationLine(DART_FARES)}
                    </a>
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="min-h-11">
                  <a href="https://www.ridedart.com" target="_blank" rel="noopener noreferrer">
                    <SpriteIcon name="external-link" className="h-4 w-4 mr-1" /> DART website
                  </a>
                </Button>
              </CardContent>
            </Card>
          </section>

          {/* Distance Table */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Footprints className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Distances From Downtown</h2>
            </div>
            <p className="text-muted-foreground mb-4">
              Approximate, from the edge of downtown in normal traffic. Bus times depend on the route and the hour; ridedart.com has the trip planner.
            </p>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 font-semibold">Destination</th>
                        <th className="text-left p-3 font-semibold">Distance</th>
                        <th className="text-left p-3 font-semibold">Drive Time</th>
                        <th className="text-left p-3 font-semibold">Transit/Other</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DISTANCE_TABLE.map((row) => (
                        <tr key={row.destination} className="border-b last:border-0">
                          <td className="p-3 font-medium">{row.destination}</td>
                          <td className="p-3 text-muted-foreground">{row.distance}</td>
                          <td className="p-3 text-muted-foreground">{row.drive}</td>
                          <td className="p-3 text-muted-foreground">{row.transit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* plan-stay WP3 item 9: from "how do I get there" to our own listings. */}
          <section className="mb-12" aria-labelledby="plan-around-heading">
            <div className="flex items-center gap-2 mb-4">
              <Hotel className="h-5 w-5 text-primary" />
              <h2 id="plan-around-heading" className="text-2xl font-bold">Plan around where you&apos;re going</h2>
            </div>
            <ul className="space-y-2 text-muted-foreground max-w-prose">
              <li>
                <Link to="/events/today" className="underline font-medium text-foreground">Parking for tonight&apos;s events</Link>: see what&apos;s on
                tonight, then pick the nearest garage above.
              </li>
              <li>
                <Link to="/stay?near=wells-fargo-arena" className="underline font-medium text-foreground">Hotels near Wells Fargo Arena and the Iowa Events Center</Link>, nearest first.
              </li>
              <li>
                <Link to="/events?q=Iowa%20Events%20Center" className="underline font-medium text-foreground">Events at the Iowa Events Center</Link>
              </li>
              <li>
                <Link to="/events?q=Civic%20Center" className="underline font-medium text-foreground">Events at the Des Moines Civic Center</Link>
              </li>
              <li>
                <Link to="/stay" className="underline font-medium text-foreground">All Des Moines hotels</Link>
              </li>
            </ul>
          </section>

          {/* SEO-003: FAQSection renders these AND emits the single FAQPage
              block, from the same FAQ_ITEMS. This page was a fifth hand-rolled
              copy of that pairing - valid, but a copy, and copies are how the
              other four came to disagree. */}
          <section className="mb-12">
            <FAQSection faqs={FAQ_ITEMS} />
          </section>
        </div>
        <Footer />
      </div>
    </>
  );
}
