import { useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Calendar, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function SubmitEventButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSubmitEvent = () => {
    if (!user) {
      // User not logged in, redirect to auth page
      toast.info("Please sign in to submit an event");
      navigate("/auth?redirect=dashboard&tab=submit-event");
    } else {
      // User logged in, go to their dashboard
      navigate("/dashboard?tab=submit-event");
    }
    setIsOpen(false);
  };

  return (
    <>
      {/* Mobile/Desktop Submit Button */}
      <Button
        onClick={handleSubmitEvent}
        className="bg-primary hover:bg-primary/90 text-primary-foreground"
        size="sm"
      >
        <Plus className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Submit Event</span>
        <span className="sm:hidden">Submit</span>
      </Button>

      {/* Alternative Dialog Version for landing page */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="bg-card border-2 border-primary/20 hover:border-primary/40 hover:bg-primary/5"
          >
            <Calendar className="h-4 w-4 mr-2" />
            Submit Your Event
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Submit Your Event
            </DialogTitle>
            <DialogDescription>
              Share your event with the Des Moines community! It's free and easy.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <h4 className="font-semibold mb-2">What you get:</h4>
              <ul className="space-y-1">
                <li>• Free event listing</li>
                <li>• Reach thousands of local people</li>
                <li>• Dashboard to manage your events</li>
                <li>• Quick approval process (within 48 hours)</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSubmitEvent} className="flex-1">
                {user ? "Go to Dashboard" : "Sign In to Submit"}
              </Button>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
