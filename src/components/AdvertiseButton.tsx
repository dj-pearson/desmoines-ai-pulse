import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function AdvertiseButton() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleAdvertiseClick = () => {
    if (!isAuthenticated) {
      navigate("/auth?redirect=/advertise");
    } else {
      navigate("/advertise");
    }
  };

  return (
    <Button
      onClick={handleAdvertiseClick}
      variant="outline"
      className="bg-gradient-to-r from-primary to-primary-glow text-white border-none hover:opacity-90 transition-opacity cursor-pointer"
    >
      Advertise with Us
    </Button>
  );
}