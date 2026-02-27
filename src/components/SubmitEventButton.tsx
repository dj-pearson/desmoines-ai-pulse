import { InteractiveButton } from "./ui/interactive-button";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SubmitEventButton() {
  const navigate = useNavigate();

  return (
    <InteractiveButton
      onClick={() => navigate("/submit-event")}
      variant="default"
      size="sm"
      interaction="glow"
    >
      <Plus className="h-4 w-4 mr-2" />
      <span className="hidden sm:inline">Submit Event</span>
      <span className="sm:hidden">Submit</span>
    </InteractiveButton>
  );
}
