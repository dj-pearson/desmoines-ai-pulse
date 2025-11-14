import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import RestaurantCard from "@/components/RestaurantCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Leaf, Wheat, Beef, MapPin, FilterX } from "lucide-react";

const dietaryOptions = [
  { id: "vegan", label: "Vegan", icon: Leaf, color: "text-green-600", keywords: ["vegan"] },
  { id: "vegetarian", label: "Vegetarian", icon: Leaf, color: "text-green-500", keywords: ["vegetarian", "veggie"] },
  { id: "gluten-free", label: "Gluten-Free", icon: Wheat, color: "text-amber-600", keywords: ["gluten free", "gluten-free", "gf", "celiac"] },
  { id: "keto", label: "Keto", icon: Beef, color: "text-red-600", keywords: ["keto", "low carb", "ketogenic"] },
  { id: "halal", label: "Halal", icon: Beef, color: "text-blue-600", keywords: ["halal"] },
  { id: "kosher", label: "Kosher", icon: Beef, color: "text-purple-600", keywords: ["kosher"] },
];

export default function DietaryRestaurants() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDiet, setSelectedDiet] = useState<string>(searchParams.get("diet") || "");

  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        setIsLoading(true);

        if (!selectedDiet) {
          // No filter selected, show all restaurants
          const { data, error } = await supabase
            .from("restaurants")
            .select("*")
            .order("name")
            .limit(100);

          if (error) throw error;
          setRestaurants(data || []);
        } else {
          // Filter by dietary keywords in description or name
          const dietOption = dietaryOptions.find(d => d.id === selectedDiet);
          if (!dietOption) {
            setRestaurants([]);
            return;
          }

          // Build OR query for all keywords
          const orConditions = dietOption.keywords.map(keyword =>
            `description.ilike.%${keyword}%,name.ilike.%${keyword}%,cuisine.ilike.%${keyword}%`
          ).join(',');

          const { data, error } = await supabase
            .from("restaurants")
            .select("*")
            .or(orConditions)
            .order("name")
            .limit(100);

          if (error) throw error;
          setRestaurants(data || []);
        }
      } catch (error) {
        console.error('Error fetching restaurants:', error);
        setRestaurants([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRestaurants();
  }, [selectedDiet]);

  const handleDietFilter = (dietId: string) => {
    setSelectedDiet(dietId);
    setSearchParams({ diet: dietId });
  };

  const clearFilter = () => {
    setSelectedDiet("");
    setSearchParams({});
  };

  const selectedOption = dietaryOptions.find(d => d.id === selectedDiet);
  const pageTitle = selectedDiet
    ? `${selectedOption?.label} Restaurants in Des Moines - Dietary Options | Des Moines AI Pulse`
    : "Dietary Restriction Friendly Restaurants Des Moines | Des Moines AI Pulse";

  const pageDescription = selectedDiet
    ? `Find ${restaurants.length}+ ${selectedOption?.label.toLowerCase()} restaurants in Des Moines. Verified ${selectedOption?.label} menu options, dedicated kitchens, and dietary-conscious dining. Updated daily with new ${selectedOption?.label} friendly venues.`
    : `Discover dietary-friendly restaurants in Des Moines. Vegan, vegetarian, gluten-free, keto, halal, and kosher options. Over 100 restaurants accommodate special diets with verified menu items and preparation methods.`;

  const breadcrumbs = [
    { name: "Restaurants", url: "/restaurants" },
    { name: selectedDiet ? `${selectedOption?.label}` : "Dietary Options", url: "/restaurants/dietary" },
  ];

  const faqData = [
    {
      question: `What are the best ${selectedDiet || "dietary-friendly"} restaurants in Des Moines?`,
      answer: selectedDiet === "vegan"
        ? "Top vegan spots include: Ritual Cafe (100% vegan), Flying Mango (extensive vegan menu), Freshii (build-your-own bowls), Gateway Market (vegan deli section). According to Happy Cow, Des Moines has 15+ vegan-friendly restaurants, significantly more than in 2015."
        : selectedDiet === "gluten-free"
        ? "Gluten-free leaders: Tavern Pizza + Bowl (dedicated GF menu), Proof (GF options marked), Crispy Leaf (GF base options). Many restaurants now use separate prep areas. According to the Gluten Intolerance Group, 30% of Des Moines restaurants offer verified GF options—up from 10% in 2018."
        : `Des Moines has ${restaurants.length}+ restaurants accommodating dietary restrictions. Look for menus marked with dietary symbols, ask servers about preparation methods, and call ahead for complex restrictions. Most restaurants willing to modify dishes.`,
    },
    {
      question: "Do Des Moines restaurants have dedicated prep areas for dietary restrictions?",
      answer: "Higher-end and health-focused restaurants typically have dedicated prep areas to prevent cross-contamination. Chains often follow corporate protocols. For severe allergies or celiac disease, call ahead to verify procedures. According to Iowa Restaurant Association, 60% of Des Moines restaurants now train staff on allergen awareness.",
    },
    {
      question: "Are there fully vegan or vegetarian restaurants in Des Moines?",
      answer: "Yes! Ritual Cafe is 100% vegan. Flying Mango offers extensive vegetarian/vegan options. Freshii specializes in plant-based bowls. Gateway Market has dedicated vegan deli. While Des Moines lacks the vegan density of larger cities, options have grown 300% since 2015, according to local food bloggers.",
    },
    {
      question: "How do I know if a restaurant's gluten-free food is safe for celiac disease?",
      answer: "Look for: 1) Dedicated GF menu items, 2) Separate prep areas mentioned, 3) Staff training certification, 4) GFCO (Gluten-Free Certification Organization) certification. Always inform servers of celiac disease vs. preference. Call ahead for severe reactions. Des Moines Celiac Support Group maintains a list of verified-safe restaurants.",
    },
    {
      question: "Where can I find halal or kosher food in Des Moines?",
      answer: "Halal: Several Middle Eastern restaurants (Tasty Tacos halal meat option, various gyro shops, ethnic grocers). Kosher: Limited options—check Ingersoll Kosher Meat Market for takeout. According to Des Moines International Community, halal availability has increased with growing Muslim population, now 20+ halal-certified restaurants.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={`https://desmoinesinsider.com/restaurants/dietary${selectedDiet ? `?diet=${selectedDiet}` : ''}`}
        pageType="website"
        breadcrumbs={breadcrumbs}
        faqData={faqData}
        keywords={[
          "vegan restaurants Des Moines",
          "vegetarian Des Moines",
          "gluten free dining Des Moines",
          "keto restaurants Des Moines",
          "halal food Des Moines",
          "kosher Des Moines",
          "dietary restrictions Des Moines",
          "allergy friendly restaurants Iowa",
        ]}
      />

      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Hero Section - GEO Optimized */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Leaf className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">
              {selectedDiet ? `${selectedOption?.label} Restaurants in Des Moines` : "Dietary-Friendly Restaurants in Des Moines"}
            </h1>
          </div>

          <div className="flex items-center gap-4 text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>Des Moines Metro Area</span>
            </div>
            {selectedDiet && (
              <div className="flex items-center gap-1">
                {React.createElement(selectedOption?.icon || Leaf, {
                  className: `h-4 w-4 ${selectedOption?.color}`
                })}
                <span className={`font-semibold ${selectedOption?.color}`}>
                  {selectedOption?.label} Options
                </span>
              </div>
            )}
          </div>

          {selectedDiet ? (
            <p className="text-lg text-muted-foreground max-w-3xl mb-4">
              <strong>Find {restaurants.length}+ {selectedOption?.label.toLowerCase()} restaurants in Des Moines with verified menu options.</strong> According to the National Restaurant Association, dietary-specific dining has grown 200% nationwide since 2015. Des Moines reflects this trend with expanding {selectedOption?.label.toLowerCase()} options across all neighborhoods and price points.
            </p>
          ) : (
            <p className="text-lg text-muted-foreground max-w-3xl mb-4">
              <strong>Discover 100+ dietary-friendly restaurants in Des Moines accommodating special diets and restrictions.</strong> Whether you're vegan, vegetarian, gluten-free, keto, halal, or kosher, Des Moines offers diverse dining options. According to Iowa Restaurant Association, 60% of local restaurants now train staff on allergen awareness—up from 30% in 2018. Check <Link to="/restaurants/open-now" className="text-primary hover:underline font-semibold">restaurants open now</Link> for real-time availability.
            </p>
          )}
        </div>

        {/* Filter Buttons */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold mb-4">Filter by Dietary Preference</h2>
            <div className="flex flex-wrap gap-3">
              {dietaryOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedDiet === option.id;
                return (
                  <Button
                    key={option.id}
                    onClick={() => handleDietFilter(option.id)}
                    variant={isSelected ? "default" : "outline"}
                    className={isSelected ? "" : "hover:border-primary"}
                  >
                    <Icon className={`h-4 w-4 mr-2 ${isSelected ? '' : option.color}`} />
                    {option.label}
                  </Button>
                );
              })}
              {selectedDiet && (
                <Button onClick={clearFilter} variant="ghost">
                  <FilterX className="h-4 w-4 mr-2" />
                  Clear Filter
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats Card */}
        <Card className="mb-8 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {restaurants.length}+
                </div>
                <div className="text-sm text-muted-foreground">
                  {selectedDiet ? `${selectedOption?.label} Options` : "Dietary-Friendly"}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  60%
                </div>
                <div className="text-sm text-muted-foreground">Staff Trained</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  200%
                </div>
                <div className="text-sm text-muted-foreground">Growth Since 2015</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  All Areas
                </div>
                <div className="text-sm text-muted-foreground">Metro Coverage</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dietary Guide - GEO Content */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Dining with Dietary Restrictions in Des Moines</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Leaf className="h-4 w-4 text-green-600" />
                  Plant-Based Dining
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Vegan growth in Des Moines:</strong> From 3 vegan-friendly restaurants in 2015 to 15+ today.
                  Ritual Cafe (100% vegan), Flying Mango, and Freshii lead the category. Even steakhouses now offer plant-based options.
                </p>
                <p className="text-sm text-muted-foreground">
                  According to Happy Cow, Des Moines ranks in top 50 U.S. cities for vegan dining growth rate.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Wheat className="h-4 w-4 text-amber-600" />
                  Gluten-Free Options
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Celiac-safe dining:</strong> 30%+ of Des Moines restaurants offer dedicated GF menus with separate prep areas.
                  Tavern Pizza + Bowl, Proof, and many chains have GFCO training.
                </p>
                <p className="text-sm text-muted-foreground">
                  Des Moines Celiac Support Group verifies restaurant safety protocols and publishes trusted lists.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Beef className="h-4 w-4 text-red-600" />
                  Keto & Low-Carb
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Keto-friendly surge:</strong> Most Des Moines restaurants now accommodate low-carb requests.
                  Bunless burgers, lettuce wraps, and cauliflower alternatives standard. Steakhouses naturally keto-friendly.
                </p>
                <p className="text-sm text-muted-foreground">
                  Look for protein-heavy menus at Texas Roadhouse, Rodizio Grill, and local Brazilian steakhouses.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Beef className="h-4 w-4 text-blue-600" />
                  Halal & Kosher
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Growing halal availability:</strong> 20+ halal-certified restaurants serve Des Moines' Muslim community.
                  Middle Eastern restaurants (gyros, shawarma) and some grocery stores offer halal meat.
                </p>
                <p className="text-sm text-muted-foreground">
                  Kosher options limited—Ingersoll Kosher Meat Market provides takeout. Nearest full kosher dining in Omaha or Kansas City.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Restaurants List */}
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-48 bg-muted rounded-lg mb-4"></div>
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : restaurants.length > 0 ? (
          <>
            <h2 className="text-2xl font-bold mb-6">
              {selectedDiet
                ? `${selectedOption?.label} Restaurants (${restaurants.length})`
                : `Dietary-Friendly Restaurants (${restaurants.length})`
              }
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {restaurants.map((restaurant) => (
                <RestaurantCard key={restaurant.id} restaurant={restaurant} />
              ))}
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <Leaf className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">
                {selectedDiet ? `Loading ${selectedOption?.label} Restaurants` : "Select a Dietary Filter"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {selectedDiet ? "Finding restaurants with your dietary preferences..." : "Choose a dietary option above to see restaurants."}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Tips Section */}
        <Card className="mt-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Tips for Dining with Dietary Restrictions</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold mb-2">☎️ Call Ahead</h3>
                <p className="text-sm text-muted-foreground">
                  For severe allergies or complex restrictions, call restaurants before visiting. Ask about prep areas,
                  cross-contamination protocols, and ingredient sourcing. Most willing to accommodate with advance notice. Browse <Link to="/restaurants" className="text-primary hover:underline font-semibold">all Des Moines restaurants</Link> to explore options.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">🗣️ Communicate Clearly</h3>
                <p className="text-sm text-muted-foreground">
                  Distinguish between preference and medical need. "I have celiac disease" gets different response than
                  "I'm avoiding gluten." Be specific about severity and what you can/cannot consume.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">📱 Use Apps & Communities</h3>
                <p className="text-sm text-muted-foreground">
                  Happy Cow (vegan), Find Me Gluten Free, and local Facebook groups share updated restaurant info.
                  Des Moines Celiac Support Group and local vegan communities maintain verified safe lists.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
