import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WeekendGuide from "@/components/WeekendGuide";

export default function WeekendPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <WeekendGuide />
      </main>
      
      <Footer />
    </div>
  );
}
