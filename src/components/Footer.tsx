import { Heart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-neutral-900 text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <img 
              src="/DMI-Logo2.png" 
              alt="Des Moines Insider" 
              className="h-16 w-auto mb-4"
            />
            <p className="text-neutral-400 mb-4">
              Your AI-powered guide to discovering the best events, dining, and attractions 
              in Des Moines. We curate and enhance local content to help you explore the capital city.
            </p>
            <div className="flex items-center text-sm text-neutral-400">
              <span>Made with</span>
              <Heart className="h-4 w-4 mx-1 text-red-500" />
              <span>for Des Moines</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <a href="#events" className="text-neutral-400 hover:text-white transition-colors">
                  Events
                </a>
              </li>
              <li>
                <a href="#restaurants" className="text-neutral-400 hover:text-white transition-colors">
                  Restaurants
                </a>
              </li>
              <li>
                <a href="#attractions" className="text-neutral-400 hover:text-white transition-colors">
                  Attractions
                </a>
              </li>
              <li>
                <a href="#newsletter" className="text-neutral-400 hover:text-white transition-colors">
                  Newsletter
                </a>
              </li>
            </ul>
          </div>

          {/* About */}
          <div>
            <h4 className="text-lg font-semibold mb-4">About</h4>
            <ul className="space-y-2">
              <li>
                <span className="text-neutral-400">How It Works</span>
              </li>
              <li>
                <span className="text-neutral-400">AI Enhancement</span>
              </li>
              <li>
                <span className="text-neutral-400">Data Sources</span>
              </li>
              <li>
                <span className="text-neutral-400">Contact Us</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-neutral-800 mt-8 pt-8 text-center">
          <p className="text-neutral-400 text-sm">
            © 2024 Des Moines Insider. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}