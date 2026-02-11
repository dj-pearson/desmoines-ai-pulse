import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WeekendGuide from "@/components/WeekendGuide";
import SEOHead from "@/components/SEOHead";

export default function WeekendPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead 
        title="This Weekend in Des Moines - AI-Curated Event Guide"
        description="Discover the best events, activities, and experiences happening this weekend in Des Moines. AI-curated guide updated weekly with local recommendations."
        keywords={["Des Moines weekend events", "things to do Des Moines", "weekend activities", "Des Moines events guide"]}
      />
      <Header />
      
      <div>
        <WeekendGuide />
      </div>
      
      <Footer />
    </div>
  );
}
