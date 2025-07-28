import { Button } from "./ui/button";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function SubmitEventButton() {
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
  };

  return (
    <Button
      onClick={handleSubmitEvent}
      className="bg-primary hover:bg-primary/90 text-primary-foreground"
      size="sm"
    >
      <Plus className="h-4 w-4 mr-2" />
      <span className="hidden sm:inline">Submit Event</span>
      <span className="sm:hidden">Submit</span>
    </Button>
  );
}
