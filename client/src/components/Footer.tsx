import { Facebook, Twitter, Instagram } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-neutral-900 text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h4 className="text-xl font-bold mb-4">Des Moines Insider</h4>
            <p className="text-neutral-400 mb-4">Your comprehensive guide to Des Moines events, restaurants, and attractions. Powered by AI-enhanced content.</p>
            <div className="flex space-x-4">
              <a href="#" className="text-neutral-400 hover:text-white transition-colors">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" className="text-neutral-400 hover:text-white transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-neutral-400 hover:text-white transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>
          
          <div>
            <h5 className="font-semibold mb-4">Events</h5>
            <ul className="space-y-2 text-neutral-400">
              <li><a href="#events" className="hover:text-white transition-colors">Upcoming Events</a></li>
              <li><a href="#events" className="hover:text-white transition-colors">Music & Concerts</a></li>
              <li><a href="#events" className="hover:text-white transition-colors">Food & Drink</a></li>
              <li><a href="#events" className="hover:text-white transition-colors">Family Events</a></li>
            </ul>
          </div>
          
          <div>
            <h5 className="font-semibold mb-4">Discover</h5>
            <ul className="space-y-2 text-neutral-400">
              <li><a href="#restaurants" className="hover:text-white transition-colors">Best Restaurants</a></li>
              <li><a href="#restaurants" className="hover:text-white transition-colors">Top Attractions</a></li>
              <li><a href="#restaurants" className="hover:text-white transition-colors">Best Playgrounds</a></li>
              <li><a href="#restaurants" className="hover:text-white transition-colors">Hidden Gems</a></li>
            </ul>
          </div>
          
          <div>
            <h5 className="font-semibold mb-4">Contact</h5>
            <ul className="space-y-2 text-neutral-400">
              <li><a href="#about" className="hover:text-white transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Submit Event</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-neutral-800 mt-8 pt-8 text-center text-neutral-400">
          <p>&copy; 2024 Des Moines Insider. All rights reserved. Powered by AI-enhanced event discovery.</p>
        </div>
      </div>
    </footer>
  );
}
