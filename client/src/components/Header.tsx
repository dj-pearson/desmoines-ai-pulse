import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-primary">Des Moines Insider</h1>
          </div>
          
          <nav className="hidden md:flex space-x-8">
            <a href="#events" className="text-neutral-500 hover:text-primary transition-colors">Events</a>
            <a href="#restaurants" className="text-neutral-500 hover:text-primary transition-colors">Restaurants</a>
            <a href="#attractions" className="text-neutral-500 hover:text-primary transition-colors">Attractions</a>
            <a href="#about" className="text-neutral-500 hover:text-primary transition-colors">About</a>
          </nav>

          <Button 
            variant="ghost" 
            size="sm"
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
        
        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="md:hidden pb-4">
            <nav className="flex flex-col space-y-2">
              <a href="#events" className="text-neutral-500 hover:text-primary transition-colors py-2">Events</a>
              <a href="#restaurants" className="text-neutral-500 hover:text-primary transition-colors py-2">Restaurants</a>
              <a href="#attractions" className="text-neutral-500 hover:text-primary transition-colors py-2">Attractions</a>
              <a href="#about" className="text-neutral-500 hover:text-primary transition-colors py-2">About</a>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
