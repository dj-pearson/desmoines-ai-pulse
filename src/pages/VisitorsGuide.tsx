import { useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { getCanonicalUrl } from '@/lib/brandConfig';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Mail, MapPin, Utensils, Calendar, Star, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

export default function VisitorsGuide() {
  const [downloadEmail, setDownloadEmail] = useState('');
  const [downloading, setDownloading] = useState(false);

  const [requestForm, setRequestForm] = useState({
    name: '',
    email: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip: '',
  });
  const [requesting, setRequesting] = useState(false);

  const handleDownload = async () => {
    if (!downloadEmail) {
      toast.error('Please enter your email address');
      return;
    }
    setDownloading(true);
    try {
      await supabase.from('guide_requests').insert({
        request_type: 'download',
        email: downloadEmail,
      } as Record<string, unknown>);
      toast.success('Check your email for the download link!');
      setDownloadEmail('');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleRequestGuide = async () => {
    if (!requestForm.email || !requestForm.name || !requestForm.address_line1 || !requestForm.city || !requestForm.state || !requestForm.zip) {
      toast.error('Please fill in all required fields');
      return;
    }
    setRequesting(true);
    try {
      await supabase.from('guide_requests').insert({
        request_type: 'physical',
        ...requestForm,
      } as Record<string, unknown>);
      toast.success('Your free guide is on its way!');
      setRequestForm({ name: '', email: '', address_line1: '', address_line2: '', city: '', state: '', zip: '' });
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Free Des Moines Visitor Guide — Download or Request | Des Moines Insider</title>
        <meta name="description" content="Get your free Des Moines visitor guide! Download the digital edition instantly or request a free printed copy mailed to your door." />
        <link rel="canonical" href={getCanonicalUrl('/visitors-guide')} />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'TouristInformationCenter',
            name: 'Des Moines Insider Visitor Guide',
            description: 'Comprehensive visitor guide to Des Moines, Iowa — top events, restaurants, attractions, neighborhoods, and insider tips.',
            // Prerendering has no window, and the old ternary emitted url:"" into
            // the static HTML every crawler reads. Same source as the canonical.
            url: getCanonicalUrl('/visitors-guide'),
            address: {
              '@type': 'PostalAddress',
              addressLocality: 'Des Moines',
              addressRegion: 'IA',
              addressCountry: 'US',
            },
          })}
        </script>
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
              <BookOpen className="h-5 w-5" />
              <span className="font-semibold">2026 Edition</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Des Moines Visitor Guide
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Your comprehensive guide to Des Moines — top events, restaurant picks, attraction highlights, neighborhood guides, maps, and insider tips. Free to download or request by mail.
            </p>
          </div>

          {/* What's Inside */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { icon: Calendar, label: 'Events Calendar', desc: 'Top events & festivals' },
              { icon: Utensils, label: 'Restaurant Guide', desc: 'Best dining picks' },
              { icon: Star, label: 'Attractions', desc: 'Must-see destinations' },
              { icon: MapPin, label: 'Neighborhoods', desc: 'Area-by-area guide' },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="p-4 text-center">
                  <item.icon className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <h3 className="font-semibold text-sm">{item.label}</h3>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Download / Request Tabs */}
          <div className="max-w-xl mx-auto">
            <Tabs defaultValue="download" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="download">
                  <Download className="h-4 w-4 mr-1" /> Digital Download
                </TabsTrigger>
                <TabsTrigger value="request">
                  <Mail className="h-4 w-4 mr-1" /> Request Free Copy
                </TabsTrigger>
              </TabsList>

              <TabsContent value="download">
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <h2 className="text-xl font-bold">Download Digital Guide</h2>
                    <p className="text-sm text-muted-foreground">
                      Enter your email and we&apos;ll send you the download link. Instant access to the full guide!
                    </p>
                    <div>
                      <Label htmlFor="download-email">Email Address</Label>
                      <Input
                        id="download-email"
                        type="email"
                        placeholder="you@example.com"
                        value={downloadEmail}
                        onChange={(e) => setDownloadEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </div>
                    <Button className="w-full" onClick={handleDownload} disabled={downloading}>
                      {downloading ? 'Sending...' : 'Download Free Guide'}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      We respect your privacy. See our{' '}
                      <a href="/privacy-policy" className="underline">Privacy Policy</a>.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="request">
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <h2 className="text-xl font-bold">Request Free Printed Guide</h2>
                    <p className="text-sm text-muted-foreground">
                      We&apos;ll mail a beautiful printed copy to your door — completely free!
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <Label htmlFor="req-name">Full Name *</Label>
                        <Input id="req-name" value={requestForm.name} onChange={(e) => setRequestForm(p => ({ ...p, name: e.target.value }))} autoComplete="name" />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="req-email">Email *</Label>
                        <Input id="req-email" type="email" value={requestForm.email} onChange={(e) => setRequestForm(p => ({ ...p, email: e.target.value }))} autoComplete="email" />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="req-addr1">Address Line 1 *</Label>
                        <Input id="req-addr1" value={requestForm.address_line1} onChange={(e) => setRequestForm(p => ({ ...p, address_line1: e.target.value }))} autoComplete="address-line1" />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="req-addr2">Address Line 2</Label>
                        <Input id="req-addr2" value={requestForm.address_line2} onChange={(e) => setRequestForm(p => ({ ...p, address_line2: e.target.value }))} autoComplete="address-line2" />
                      </div>
                      <div>
                        <Label htmlFor="req-city">City *</Label>
                        <Input id="req-city" value={requestForm.city} onChange={(e) => setRequestForm(p => ({ ...p, city: e.target.value }))} autoComplete="address-level2" />
                      </div>
                      <div>
                        <Label htmlFor="req-state">State *</Label>
                        <Input id="req-state" value={requestForm.state} onChange={(e) => setRequestForm(p => ({ ...p, state: e.target.value }))} autoComplete="address-level1" />
                      </div>
                      <div>
                        <Label htmlFor="req-zip">ZIP Code *</Label>
                        <Input id="req-zip" value={requestForm.zip} onChange={(e) => setRequestForm(p => ({ ...p, zip: e.target.value }))} autoComplete="postal-code" />
                      </div>
                    </div>
                    <Button className="w-full" onClick={handleRequestGuide} disabled={requesting}>
                      {requesting ? 'Submitting...' : 'Request Free Guide'}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Allow 2-3 weeks for delivery. See our{' '}
                      <a href="/privacy-policy" className="underline">Privacy Policy</a>.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}
