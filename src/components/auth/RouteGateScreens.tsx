import { useNavigate } from "react-router-dom";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * The two full-screen states ProtectedRoute and RoutePermissionGate share.
 * Split out so the permission gate can live in its own lazy chunk without
 * either file importing the other (WEB-PERF-062).
 */
export function VerifyingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <Spinner size="xl" className="mx-auto" />
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

/** Shown when a signed-in user lacks the role or permission a route needs. */
export function AccessDeniedPage({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border rounded-lg p-6 text-center">
        <div className="mb-4">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-6">{message}</p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
          <Button onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </div>
    </div>
  );
}
