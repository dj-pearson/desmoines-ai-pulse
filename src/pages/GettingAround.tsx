import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { FAQSection } from "@/components/FAQSection";
import SEOHead from '@/components/SEOHead';
import { getCanonicalUrl } from '@/lib/brandConfig';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Car, Building, Bike, Plane, Bus, Navigation, Footprints } from "lucide-react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

const PARKING_GARAGES = [
  { name: 'Capital Square Garage', address: '400 Locust St', rate: '$1/hr, $10 max', hours: '24/7', lat: 41.5867, lng: -93.6250 },
  { name: 'City Parking Ramp', address: '300 SW 5th St', rate: '$1/hr, $8 max', hours: '24/7', lat: 41.5839, lng: -93.6310 },
  { name: 'Civic Center Garage', address: '221 Walnut St', rate: '$2/hr, $12 max', hours: '6am–12am', lat: 41.5851, lng: -93.6271 },
  { name: 'Wells Fargo Arena Lots', address: '730 3rd St', rate: '$5–$15 event', hours: 'Event days', lat: 41.5908, lng: -93.6208 },
  { name: 'Court Avenue Garage', address: '309 Court Ave', rate: '$1/hr, $8 max', hours: '24/7', lat: 41.5844, lng: -93.6213 },
];

const DISTANCE_TABLE = [
  { destination: 'East Village', drive: '3 min', transit: '5 min walk', distance: '0.3 mi' },
  { destination: 'Gray\'s Lake', drive: '5 min', transit: '15 min bike', distance: '2.1 mi' },
  { destination: 'Valley Junction', drive: '10 min', transit: '25 min DART', distance: '5.2 mi' },
  { destination: 'Jordan Creek Mall', drive: '15 min', transit: '30 min DART', distance: '10.5 mi' },
  { destination: 'Adventureland', drive: '20 min', transit: 'N/A', distance: '14.2 mi' },
  { destination: 'Ames (Iowa State)', drive: '35 min', transit: 'N/A', distance: '30 mi' },
  { destination: 'DSM Airport (DSM)', drive: '10 min', transit: '20 min DART', distance: '5.1 mi' },
];

const FAQ_ITEMS = [
  { question: 'Is there Uber in Des Moines?', answer: 'Yes! Both Uber and Lyft operate throughout the Des Moines metro area. Average wait times are 3-8 minutes downtown, slightly longer in suburbs.' },
  { question: 'Where should I park downtown?', answer: 'Downtown Des Moines has multiple parking garages averaging $1/hour. The ParkDSM app lets you pay from your phone. Street parking is free after 9pm and on weekends.' },
  { question: 'Does Des Moines have a subway?', answer: 'No, Des Moines does not have a subway or light rail system. The city is served by DART (Des Moines Area Regional Transit) buses and the free DART D-Line downtown circulator.' },
  { question: 'How do I get from the airport to downtown?', answer: 'The Des Moines International Airport (DSM) is only 5 miles from downtown — about 10 minutes by car. Options: Uber/Lyft ($12-18), taxi, DART Route 8, or hotel shuttles.' },
  { question: 'What is the Des Moines Skywalk?', answer: 'The Des Moines Skywalk is a 4+ mile system of enclosed, climate-controlled walkways connecting buildings throughout downtown. It is free to use and open during business hours — essential during Iowa winters!' },
];

export default function GettingAround() {
  return (
    <>
      {/* SEO-022. The page's own schema is the FAQPage that FAQSection emits
          from FAQ_ITEMS below — the queries this page wins are questions, and
          FAQPage is the type that matches. SEOHead is here for the canonical,
          which the bare Helmet never supplied. */}
      <SEOHead
        title="Getting Around Des Moines — Parking, Skywalk, Transit Guide"
        description="How to get around Des Moines: downtown parking map, skywalk system guide, BCycle bike share, DART transit, airport info, and rideshare tips."
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
        <div className="container mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-4 py-2 rounded-full mb-4">
              <Navigation className="h-5 w-5" />
              <span className="font-semibold">Visitor Transportation Guide</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Getting Around Des Moines
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to navigate Des Moines — parking, the famous skywalk system, bike share, transit, and more.
            </p>
          </div>

          {/* Parking & ParkDSM */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Car className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Parking &amp; ParkDSM</h2>
            </div>
            <p className="text-muted-foreground mb-4">
              Downtown parking averages $1/hour. Download the <strong>ParkDSM</strong> app to pay from your phone. Street parking is <strong>free after 9pm and on weekends</strong>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {PARKING_GARAGES.map((garage) => (
                <Card key={garage.name}>
                  <CardContent className="p-4">
                    <h3 className="font-semibold">{garage.name}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <SpriteIcon name="map-pin" className="h-3 w-3" /> {garage.address}
                    </p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Badge variant="outline">{garage.rate}</Badge>
                      <Badge variant="secondary">{garage.hours}</Badge>
                    </div>
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
            <Card className="border-blue-500/20">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    <p className="text-muted-foreground mb-3">
                      The Des Moines Skywalk is a <strong>4+ mile network of enclosed, climate-controlled walkways</strong> connecting over 40 buildings throughout downtown. It&apos;s free to use and <strong>essential during Iowa winters</strong> when temperatures can drop below zero.
                    </p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2"><span className="text-primary font-bold">Hours:</span> Generally 6am–9pm weekdays, varies on weekends</li>
                      <li className="flex items-start gap-2"><span className="text-primary font-bold">Cost:</span> Free — open to the public</li>
                      <li className="flex items-start gap-2"><span className="text-primary font-bold">Connects:</span> Hotels, parking garages, restaurants, offices, Iowa Events Center, Des Moines Civic Center</li>
                      <li className="flex items-start gap-2"><span className="text-primary font-bold">Pro Tip:</span> Look for blue &ldquo;Skywalk&rdquo; signs at building entrances to access the system from street level</li>
                    </ul>
                  </div>
                </div>
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
                <p className="text-muted-foreground mb-3">
                  Des Moines BCycle offers bike share stations throughout downtown and surrounding neighborhoods. Grab a bike for quick trips or leisurely rides along the trail system.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground mb-4">
                  <li><strong>Single Ride:</strong> $1 to unlock + $0.20/min</li>
                  <li><strong>Day Pass:</strong> $15 for unlimited 60-minute rides</li>
                  <li><strong>Monthly:</strong> $20/month for unlimited 60-minute rides</li>
                  <li><strong>Stations:</strong> 20+ stations from downtown to Gray&apos;s Lake to the East Village</li>
                </ul>
                <a href="https://desmoines.bcycle.com" target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <SpriteIcon name="external-link" className="h-4 w-4 mr-1" /> BCycle Website
                  </Button>
                </a>
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
                  Both <strong>Uber</strong> and <strong>Lyft</strong> operate throughout the Des Moines metro. Average wait times are 3-8 minutes downtown. Typical fares: Airport to downtown ~$12-18, downtown to Valley Junction ~$10-15, downtown to Jordan Creek ~$15-22.
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
                <p className="text-muted-foreground mb-4">
                  DSM is a convenient, easy-to-navigate airport located just <strong>5 miles from downtown</strong> (10 minute drive).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold mb-2">Airlines Serving DSM</h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>Allegiant Air</li>
                      <li>American Airlines</li>
                      <li>Delta Air Lines</li>
                      <li>Frontier Airlines</li>
                      <li>Southwest Airlines (hub cities)</li>
                      <li>United Airlines</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Ground Transportation</h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li><strong>Uber/Lyft:</strong> Pick up at arrivals curb ($12-18 to downtown)</li>
                      <li><strong>Taxi:</strong> Available at taxi stand ($18-22 to downtown)</li>
                      <li><strong>DART Route 8:</strong> Bus to downtown ($1.75, ~20 min)</li>
                      <li><strong>Hotel Shuttles:</strong> Many downtown hotels offer complimentary airport shuttle</li>
                      <li><strong>Rental Cars:</strong> All major companies in the terminal</li>
                    </ul>
                  </div>
                </div>
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
                <p className="text-muted-foreground mb-4">
                  DART (Des Moines Area Regional Transit) operates bus routes throughout the metro. The <strong>D-Line</strong> is a free downtown circulator running every 10-15 minutes.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 mb-4">
                  <li><strong>Base Fare:</strong> $1.75 (exact change or DART Card)</li>
                  <li><strong>Day Pass:</strong> $4.00</li>
                  <li><strong>D-Line (Downtown):</strong> FREE — runs every 10-15 min on weekdays</li>
                  <li><strong>DART App:</strong> Real-time bus tracking and mobile fare payment</li>
                </ul>
                <a href="https://www.ridedart.com" target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <SpriteIcon name="external-link" className="h-4 w-4 mr-1" /> DART Website
                  </Button>
                </a>
              </CardContent>
            </Card>
          </section>

          {/* Distance Table */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Footprints className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Distances From Downtown</h2>
            </div>
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
