import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome to Events Hub</h1>
        <p className="text-xl text-muted-foreground mb-8">Discover and join amazing events in your community</p>
        <Link to="/events">
          <Button variant="hero" size="lg">
            Explore Events
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default Index;
