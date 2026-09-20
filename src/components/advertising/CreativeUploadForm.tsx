import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreativeUploader, PlacementType } from "./CreativeUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ExternalLink, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { createLogger } from '@/lib/logger';
import { notifyAdmins } from "@/hooks/useCampaignNotifications";
import { describeAutoReview } from "@/lib/creativeReviewVerdict";

const log = createLogger('CreativeUploadForm');

/**
 * The campaign statuses a creative may be uploaded from (WEB-ADS-014 AC3).
 *
 * pending_payment is NOT one of them. Payment is what moves a campaign to
 * pending_creative, and only two things are allowed to make that move:
 * stripe-webhook and verify-campaign-payment, both server-side, both after
 * Stripe says the money arrived.
 *
 * This form used to make it itself, updating the campaign row straight to
 * pending_creative whenever it found one still awaiting payment. That let an
 * unpaid advertiser promote their own campaign by uploading a file, and left
 * verify-campaign-payment reconciling a state machine that had already moved
 * without it.
 */
const UPLOADABLE_STATUSES = ["pending_creative", "pending_review", "active"] as const;

/**
 * How long to wait for the auto-review's verdict before saying it is queued
 * (WEB-ADS-006 AC3).
 *
 * The verdict is written by an AFTER INSERT trigger calling
 * campaign-creative-review, so it arrives out of band and usually within a
 * couple of seconds. Six seconds is the ceiling on making somebody watch a
 * spinner for it; past that the honest answer is "queued", which is also the
 * permanently correct answer while the function is undeployed. Nothing here
 * fails if the verdict never comes.
 */
const REVIEW_POLL_ATTEMPTS = 6;
const REVIEW_POLL_INTERVAL_MS = 1000;

/** The row's review columns, or null if it cannot be read. Never throws. */
async function pollAutoReview(creativeId: string) {
  for (let attempt = 0; attempt < REVIEW_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, REVIEW_POLL_INTERVAL_MS));
    const { data, error } = await supabase
      .from('campaign_creatives')
      .select('auto_reviewed, is_approved, auto_review_reasons, rejection_reason')
      .eq('id', creativeId)
      .maybeSingle();
    // Logged rather than swallowed: the upload already succeeded, so this must
    // not surface as a failure, but a read that is failing every time is not
    // the same thing as a review that has not finished yet.
    if (error) {
      log.warn('autoReview', 'Could not read the review verdict', { data: error });
      return null;
    }
    if (data?.auto_reviewed) return data;
  }
  return null;
}

interface CreativeUploadFormProps {
  campaignId: string;
  placementType: PlacementType;
  onSuccess?: () => void;
}

interface CreativeFormData {
  title: string;
  description: string;
  linkUrl: string;
  ctaText: string;
}

export function CreativeUploadForm({
  campaignId,
  placementType,
  onSuccess,
}: CreativeUploadFormProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [imageMetadata, setImageMetadata] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState<CreativeFormData>({
    title: "",
    description: "",
    linkUrl: "",
    ctaText: "Learn More",
  });
  const [errors, setErrors] = useState<Partial<CreativeFormData>>({});
  const [showPreview, setShowPreview] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Partial<CreativeFormData> = {};

    if (!formData.title.trim()) {
      newErrors.title = "Title is required";
    } else if (formData.title.length > 60) {
      newErrors.title = "Title must be 60 characters or less";
    }

    if (!formData.description.trim()) {
      newErrors.description = "Description is required";
    } else if (formData.description.length > 150) {
      newErrors.description = "Description must be 150 characters or less";
    }

    if (!formData.linkUrl.trim()) {
      newErrors.linkUrl = "Destination URL is required";
    } else {
      try {
        const url = new URL(formData.linkUrl);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
          newErrors.linkUrl = "URL must use HTTP or HTTPS protocol";
        }
      } catch {
        newErrors.linkUrl = "Please enter a valid URL";
      }
    }

    if (!formData.ctaText.trim()) {
      newErrors.ctaText = "Call-to-action text is required";
    } else if (formData.ctaText.length > 20) {
      newErrors.ctaText = "CTA must be 20 characters or less";
    }

    if (!uploadedFile) {
      toast({
        variant: "destructive",
        title: "No file selected",
        description: "Please upload an ad creative image first",
      });
      return false;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileUpload = (file: File, metadata: any) => {
    setUploadedFile(file);
    setImageMetadata(metadata);
  };

  /**
   * Uploads to the PRIVATE ad-creatives-review bucket and returns the object
   * path (WEB-LEGAL-011).
   *
   * This used to upload to the public ad-creatives bucket and return
   * getPublicUrl, so a creative was world-readable from the moment of upload --
   * anyone who guessed the path saw unreleased campaign artwork, and a rejected
   * creative stayed readable forever.
   *
   * The object moves to the public bucket at approval, in
   * useAdminCampaigns.approveCreative, which is also where image_url is set.
   * Approved creatives are public by nature; the confidentiality window is only
   * pending and rejected.
   */
  const uploadToStorage = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${campaignId}/${placementType}/${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('ad-creatives-review')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    // No getPublicUrl: the bucket is private, so a public URL would 400. Admin
    // previews sign this path; see AdminCampaignDetail.
    return data.path;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsUploading(true);

    try {
      // Checked BEFORE the file leaves the browser: an upload from an unpaid
      // campaign should not put an object in the review bucket at all.
      const { data: campaignRow, error: statusError } = await supabase
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .single();

      if (statusError) throw statusError;

      const status = campaignRow?.status as string | undefined;
      if (!status || !UPLOADABLE_STATUSES.includes(status as (typeof UPLOADABLE_STATUSES)[number])) {
        toast({
          title: status === 'pending_payment' ? "Payment not received yet" : "This campaign cannot accept creatives",
          description:
            status === 'pending_payment'
              ? "Your creative can be uploaded as soon as the payment clears. You will get an email when it does."
              : `A campaign with status "${status ?? 'unknown'}" is not accepting creative uploads.`,
          variant: "destructive",
        });
        setIsUploading(false);
        return;
      }

      // Upload to the private review bucket. image_url stays null until an
      // admin approves and the object is copied into the public bucket.
      const reviewPath = await uploadToStorage(uploadedFile!);

      // Create creative record. The id comes back so the verdict the AFTER
      // INSERT trigger's review writes onto this row can be read below.
      const { data: created, error: createError } = await supabase
        .from('campaign_creatives')
        .insert({
          campaign_id: campaignId,
          placement_type: placementType,
          title: formData.title,
          description: formData.description,
          image_url: null,
          review_path: reviewPath,
          link_url: formData.linkUrl,
          cta_text: formData.ctaText,
          is_approved: false,
          file_size: uploadedFile!.size,
          file_type: uploadedFile!.type,
          dimensions_width: imageMetadata?.width,
          dimensions_height: imageMetadata?.height,
        })
        .select('id')
        .single();

      if (createError) throw createError;

      // No status change here. See UPLOADABLE_STATUSES above: payment is what
      // advances a campaign, and only the server decides that.

      // Fetch campaign name for notification
      const { data: campaignData } = await supabase
        .from('campaigns')
        .select('name')
        .eq('id', campaignId)
        .single();

      // Notify admins that a creative is ready for review
      notifyAdmins(
        campaignId,
        campaignData?.name || 'Campaign',
        'creative_uploaded',
        { placementType }
      );

      // The seconds-later verdict the upload flow promises. Falls back to
      // "queued" when the review has not answered, which is the honest message
      // and the permanent one while campaign-creative-review is undeployed.
      const verdict = describeAutoReview(created?.id ? await pollAutoReview(created.id) : null);
      toast({
        title: verdict.title,
        description: verdict.description,
        variant: verdict.variant === 'destructive' ? 'destructive' : undefined,
      });

      if (onSuccess) {
        onSuccess();
      } else {
        navigate(`/campaigns/${campaignId}`);
      }
    } catch (error) {
      log.error('upload', 'Error uploading creative', { data: error });
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload creative. Please try again.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* File Uploader */}
      <Card>
        <CardHeader>
          <CardTitle>Step 1: Upload Your Ad Creative</CardTitle>
          <CardDescription>
            Upload an image that meets the specifications for{" "}
            {placementType.replace(/_/g, " ")} placement
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreativeUploader
            campaignId={campaignId}
            placementType={placementType}
            onUploadComplete={handleFileUpload}
            maxFiles={1}
          />
        </CardContent>
      </Card>

      {/* Form Fields */}
      <Card>
        <CardHeader>
          <CardTitle>Step 2: Add Ad Details</CardTitle>
          <CardDescription>
            Provide information about your advertisement
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">
              Ad Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="e.g., Transform Your Business with AI"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              maxLength={60}
              className={errors.title ? "border-destructive" : ""}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{errors.title || "Main headline for your ad"}</span>
              <span>{formData.title.length}/60</span>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="description"
              placeholder="e.g., Discover cutting-edge AI solutions designed to streamline your workflow and boost productivity."
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              maxLength={150}
              rows={3}
              className={errors.description ? "border-destructive" : ""}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{errors.description || "Brief description of your offering"}</span>
              <span>{formData.description.length}/150</span>
            </div>
          </div>

          {/* Destination URL */}
          <div className="space-y-2">
            <Label htmlFor="linkUrl">
              Destination URL <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="linkUrl"
                type="url"
                placeholder="https://example.com/landing-page"
                value={formData.linkUrl}
                onChange={(e) =>
                  setFormData({ ...formData, linkUrl: e.target.value })
                }
                className={errors.linkUrl ? "border-destructive" : ""}
              />
              {formData.linkUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(formData.linkUrl, '_blank')}
                  aria-label="Open link in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {errors.linkUrl || "Where users will be directed when they click your ad"}
            </p>
          </div>

          {/* CTA Text */}
          <div className="space-y-2">
            <Label htmlFor="ctaText">
              Call-to-Action Button Text <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ctaText"
              placeholder="e.g., Learn More, Get Started, Shop Now"
              value={formData.ctaText}
              onChange={(e) =>
                setFormData({ ...formData, ctaText: e.target.value })
              }
              maxLength={20}
              className={errors.ctaText ? "border-destructive" : ""}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{errors.ctaText || "Text that appears on the action button"}</span>
              <span>{formData.ctaText.length}/20</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {uploadedFile && formData.title && formData.description && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Step 3: Preview Your Ad</CardTitle>
                <CardDescription>
                  See how your ad will appear to visitors
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                <Eye className="h-4 w-4 mr-2" />
                {showPreview ? "Hide" : "Show"} Preview
              </Button>
            </div>
          </CardHeader>
          {showPreview && (
            <CardContent>
              <div className="border rounded-lg p-6 bg-gray-50">
                <div className="max-w-4xl mx-auto">
                  {/* Ad Preview */}
                  <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <img
                      src={URL.createObjectURL(uploadedFile)}
                      alt={formData.title}
                      className="w-full h-auto"
                    />
                    <div className="p-4 border-t">
                      <h3 className="font-bold text-lg mb-2">{formData.title}</h3>
                      <p className="text-sm text-gray-600 mb-3">{formData.description}</p>
                      <Button size="sm">{formData.ctaText}</Button>
                    </div>
                  </div>
                  <p className="text-xs text-center text-muted-foreground mt-3">
                    This is a preview. Actual appearance may vary based on placement and device.
                  </p>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Submission Info */}
      <Alert>
        <AlertDescription>
          <strong>What happens next?</strong>
          <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
            <li>Your creative will be submitted for admin review</li>
            <li>Review typically takes 1-2 business days</li>
            <li>You'll receive an email notification when approved</li>
            <li>Your ad will automatically go live on the scheduled start date</li>
          </ol>
        </AlertDescription>
      </Alert>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(`/campaigns/${campaignId}`)}
          disabled={isUploading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isUploading || !uploadedFile}>
          {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isUploading ? "Uploading..." : "Submit for Review"}
        </Button>
      </div>
    </form>
  );
}
