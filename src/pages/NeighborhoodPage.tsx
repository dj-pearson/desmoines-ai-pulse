import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NeighborhoodGuide from "@/components/NeighborhoodGuide";
import LocalSEO from "@/components/LocalSEO";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function NeighborhoodPage() {
  const { neighborhood } = useParams<{ neighborhood: string }>();
  const [neighborhoodData, setNeighborhoodData] = useState<any>(null);
  
  // Mock data - replace with actual API calls
  const events: any[] = []; // Would come from useEvents or API call
  
  useEffect(() => {
    if (neighborhood) {
      // Filter events and data for this specific neighborhood
      const formattedNeighborhood = neighborhood.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      setNeighborhoodData({
        name: formattedNeighborhood,
        events: events.filter(event => 
          event.location?.toLowerCase().includes(formattedNeighborhood.toLowerCase()) ||
          event.venue?.toLowerCase().includes(formattedNeighborhood.toLowerCase())
        ),
        restaurants: [], // Would be fetched from restaurants API
        attractions: []  // Would be fetched from attractions API
      });
    }
  }, [neighborhood, events]);

  if (!neighborhood || !neighborhoodData) {
    return <div>Loading...</div>;
  }

  const neighborhoodName = neighborhoodData.name;
  
  return (
    <div className="min-h-screen bg-background">
      <LocalSEO 
        pageTitle={`Events & Activities in ${neighborhoodName}`}
        pageDescription={`Discover the best events, restaurants, and attractions in ${neighborhoodName}, Des Moines. Find local activities, dining options, and things to do in this Des Moines neighborhood.`}
        neighborhood={neighborhoodName}
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Neighborhoods", url: "/neighborhoods" },
          { name: neighborhoodName, url: `/neighborhoods/${neighborhood}` }
        ]}
      />
      
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Back Navigation */}
        <div className="mb-6">
          <Link to="/neighborhoods">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              All Neighborhoods
            </Button>
          </Link>
        </div>

        {/* Neighborhood Guide Component */}
        <NeighborhoodGuide 
          neighborhood={neighborhoodName}
          events={neighborhoodData.events}
          restaurants={neighborhoodData.restaurants}
          attractions={neighborhoodData.attractions}
        />
      </main>
      
      <Footer />
    </div>
  );
}
