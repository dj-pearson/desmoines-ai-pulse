import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { RestaurantOpenings } from "@/components/RestaurantOpenings";

export default function Restaurants() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto mobile-padding py-6 md:py-8 safe-area-top">
        {/* Mobile-First Header Section */}
        <div className="text-center mb-8 md:mb-12">
          <h1 className="text-mobile-hero md:text-4xl font-bold text-foreground mb-3 md:mb-4">
            Des Moines Restaurants
          </h1>
          <p className="text-mobile-body md:text-xl text-muted-foreground max-w-3xl mx-auto px-2">
            Discover the latest restaurant openings, established favorites, and hidden gems 
            throughout the Des Moines metro area.
          </p>
        </div>

        {/* Mobile-Optimized Content */}
        <RestaurantOpenings />
      </main>

      <Footer />
    </div>
  );
}