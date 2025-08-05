import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Share2,
  Facebook,
  Twitter,
  Mail,
  MessageSquare,
  Link2,
  Copy,
} from "lucide-react";

interface ShareDialogProps {
  title: string;
  description: string;
  url: string;
  trigger?: React.ReactNode;
  className?: string;
}

export default function ShareDialog({
  title,
  description,
  url,
  trigger,
  className,
}: ShareDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const encodedTitle = encodeURIComponent(title);
  const encodedDescription = encodeURIComponent(description);
  const encodedUrl = encodeURIComponent(url);

  const shareOptions = [
    {
      name: "Facebook",
      icon: Facebook,
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedTitle}`,
      color: "bg-blue-600 hover:bg-blue-700",
    },
    {
      name: "Twitter",
      icon: Twitter,
      url: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
      color: "bg-black hover:bg-gray-800",
    },
    {
      name: "Email",
      icon: Mail,
      url: `mailto:?subject=${encodedTitle}&body=${encodedDescription}%0A%0A${encodedUrl}`,
      color: "bg-green-600 hover:bg-green-700",
    },
    {
      name: "SMS",
      icon: MessageSquare,
      url: `sms:?body=${encodedTitle}%20${encodedUrl}`,
      color: "bg-purple-600 hover:bg-purple-700",
    },
  ];

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard!");
      setIsOpen(false);
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url,
        });
        setIsOpen(false);
      } catch (error) {
        // User cancelled sharing or error occurred
        console.log("Native share cancelled or failed:", error);
      }
    }
  };

  const handleShareClick = (shareUrl: string) => {
    window.open(shareUrl, "_blank", "width=600,height=400");
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className={className}>
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Event</DialogTitle>
          <DialogDescription>
            Share this event with your friends and family
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Social Media Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {shareOptions.map((option) => (
              <Button
                key={option.name}
                onClick={() => handleShareClick(option.url)}
                className={`flex items-center justify-center text-white ${option.color}`}
                size="sm"
              >
                <option.icon className="h-4 w-4 mr-2" />
                {option.name}
              </Button>
            ))}
          </div>

          {/* Native Share (if available) */}
          {navigator.share && (
            <Button
              onClick={handleNativeShare}
              variant="outline"
              className="w-full"
              size="sm"
            >
              <Share2 className="h-4 w-4 mr-2" />
              More Options
            </Button>
          )}

          {/* Copy Link Section */}
          <div className="space-y-2">
            <Label htmlFor="share-url">Share Link</Label>
            <div className="flex gap-2">
              <Input
                id="share-url"
                value={url}
                readOnly
                className="flex-1"
              />
              <Button
                onClick={copyToClipboard}
                variant="outline"
                size="sm"
                className="flex-shrink-0"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}