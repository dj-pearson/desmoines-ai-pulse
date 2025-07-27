import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { RestaurantOpenings } from "@/components/RestaurantOpenings";

export default function Restaurants() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Des Moines Restaurants
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Discover the latest restaurant openings, established favorites, and hidden gems 
            throughout the Des Moines metro area.
          </p>
        </div>

        <RestaurantOpenings />
      </main>

      <Footer />
    </div>
  );
}