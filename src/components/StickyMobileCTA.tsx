import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  CalendarPlus,
  Phone,
  Navigation,
  Globe,
  Share2,
} from "lucide-react";

interface StickyMobileCTAProps {
  variant: "event" | "restaurant" | "attraction";
  primaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
    icon: "external" | "calendar" | "phone" | "directions" | "website";
    isExternal?: boolean;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
    icon: "share" | "directions" | "website" | "calendar";
    isExternal?: boolean;
  };
}

const iconMap = {
  external: ExternalLink,
  calendar: CalendarPlus,
  phone: Phone,
  directions: Navigation,
  website: Globe,
  share: Share2,
};

export function StickyMobileCTA({
  primaryAction,
  secondaryAction,
}: StickyMobileCTAProps) {
  if (!primaryAction && !secondaryAction) return null;

  const renderButton = (
    action: NonNullable<StickyMobileCTAProps["primaryAction"]>,
    isPrimary: boolean
  ) => {
    const Icon = iconMap[action.icon];
    const buttonContent = (
      <>
        <Icon className="h-4 w-4 mr-2" />
        {action.label}
      </>
    );

    if (action.href) {
      return (
        <a
          href={action.href}
          target={action.isExternal ? "_blank" : undefined}
          rel={action.isExternal ? "noopener noreferrer" : undefined}
          className={isPrimary ? "flex-1" : "flex-1"}
        >
          <Button
            className={
              isPrimary
                ? "w-full bg-[#2D1B69] hover:bg-[#2D1B69]/90 text-white"
                : "w-full"
            }
            variant={isPrimary ? "default" : "outline"}
            size="sm"
          >
            {buttonContent}
          </Button>
        </a>
      );
    }

    return (
      <Button
        className={
          isPrimary
            ? "flex-1 bg-[#2D1B69] hover:bg-[#2D1B69]/90 text-white"
            : "flex-1"
        }
        variant={isPrimary ? "default" : "outline"}
        size="sm"
        onClick={action.onClick}
      >
        {buttonContent}
      </Button>
    );
  };

  return (
    <div
      className="lg:hidden fixed bottom-16 left-0 right-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border px-4 py-3 safe-area-bottom"
      role="toolbar"
      aria-label="Quick actions"
    >
      <div className="flex gap-3 max-w-lg mx-auto">
        {primaryAction && renderButton(primaryAction, true)}
        {secondaryAction && renderButton(secondaryAction, false)}
      </div>
    </div>
  );
}
