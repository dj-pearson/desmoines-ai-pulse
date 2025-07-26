import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-primary">Des Moines Insider</h1>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-8">
            <a href="#events" className="text-gray-700 hover:text-primary transition-colors">
              Events
            </a>
            <a href="#restaurants" className="text-gray-700 hover:text-primary transition-colors">
              Dining
            </a>
            <a href="#attractions" className="text-gray-700 hover:text-primary transition-colors">
              Attractions
            </a>
            <a href="#newsletter" className="text-gray-700 hover:text-primary transition-colors">
              Newsletter
            </a>
          </nav>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden pb-4">
            <nav className="flex flex-col space-y-4">
              <a
                href="#events"
                className="text-gray-700 hover:text-primary transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                Events
              </a>
              <a
                href="#restaurants"
                className="text-gray-700 hover:text-primary transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                Dining
              </a>
              <a
                href="#attractions"
                className="text-gray-700 hover:text-primary transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                Attractions
              </a>
              <a
                href="#newsletter"
                className="text-gray-700 hover:text-primary transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                Newsletter
              </a>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}