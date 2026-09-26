/**
 * Event Promotion Planner - share buttons.
 *
 * The referral box that used to sit here promised "both you and your
 * referral get 20% off featured event listings". Nothing grants that: no
 * coupon, no Stripe promotion code, no check at checkout (plan WP6). It is
 * gone, along with ReferralTracker, which rendered hardcoded zeros for
 * shares, sign-ups and "$0 earned". The code still rides on the share link as
 * ?ref so a future reward has something to count.
 */

import { useState } from 'react';
import { Share2, Twitter, Facebook, Linkedin, Link2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface SocialShareProps {
  referralCode?: string;
  onShare?: (platform: string) => void;
}

export function SocialShare({ referralCode, onShare }: SocialShareProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = referralCode
    ? `${window.location.origin}/tools/event-promotion-planner?ref=${referralCode}`
    : `${window.location.origin}/tools/event-promotion-planner`;

  const shareText = "Planning an event? This free timeline generator is 🔥 Get your custom 8-week promotion plan!";

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      onShare?.('copy');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const handleShare = (platform: string, url: string) => {
    window.open(url, '_blank', 'width=600,height=400');
    onShare?.(platform);
  };

  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          Share This Tool
        </CardTitle>
        <CardDescription>
          Send the planner to someone else who is running an event
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Share Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Button
            variant="outline"
            onClick={() => handleShare('twitter', shareLinks.twitter)}
            className="flex items-center gap-2"
          >
            <Twitter className="h-4 w-4" />
            Twitter
          </Button>
          <Button
            variant="outline"
            onClick={() => handleShare('facebook', shareLinks.facebook)}
            className="flex items-center gap-2"
          >
            <Facebook className="h-4 w-4" />
            Facebook
          </Button>
          <Button
            variant="outline"
            onClick={() => handleShare('linkedin', shareLinks.linkedin)}
            className="flex items-center gap-2"
          >
            <Linkedin className="h-4 w-4" />
            LinkedIn
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Copy Link
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Share This Tool</DialogTitle>
                <DialogDescription>
                  Copy the link below to share with others
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2">
                <Input value={shareUrl} readOnly className="flex-1" />
                <Button onClick={handleCopyLink}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Pre-populated Share Messages */}
        <div className="border-t pt-4">
          <h4 className="font-semibold text-sm mb-3">Ready-to-use messages:</h4>
          <div className="space-y-2">
            <ShareMessage
              text="Just found this amazing free tool that creates custom event promotion timelines! 🎉"
              onCopy={(text) => {
                navigator.clipboard.writeText(`${text} ${shareUrl}`);
                toast.success('Message copied!');
                onShare?.('message');
              }}
            />
            <ShareMessage
              text="Event organizers: Stop guessing when to promote! This tool tells you exactly what to do week by week 📅"
              onCopy={(text) => {
                navigator.clipboard.writeText(`${text} ${shareUrl}`);
                toast.success('Message copied!');
                onShare?.('message');
              }}
            />
            <ShareMessage
              text="Running an event in Des Moines? This free promotion planner is a game-changer! 🚀"
              onCopy={(text) => {
                navigator.clipboard.writeText(`${text} ${shareUrl}`);
                toast.success('Message copied!');
                onShare?.('message');
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ShareMessageProps {
  text: string;
  onCopy: (text: string) => void;
}

function ShareMessage({ text, onCopy }: ShareMessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-start gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
      <p className="text-xs flex-1 text-gray-700">{text}</p>
      <Button variant="ghost" size="sm" onClick={handleCopy} className="h-6 px-2">
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}
