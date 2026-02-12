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

const log = createLogger('CreativeUploadForm');

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

  const uploadToStorage = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${campaignId}/${placementType}/${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('ad-creatives')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('ad-creatives')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsUploading(true);

    try {
      // Upload file to storage
      const imageUrl = await uploadToStorage(uploadedFile!);

      // Create creative record
      const { error: createError } = await supabase
        .from('campaign_creatives')
        .insert({
          campaign_id: campaignId,
          placement_type: placementType,
          title: formData.title,
          description: formData.description,
          image_url: imageUrl,
          link_url: formData.linkUrl,
          cta_text: formData.ctaText,
          is_approved: false,
          file_size: uploadedFile!.size,
          file_type: uploadedFile!.type,
          dimensions_width: imageMetadata?.width,
          dimensions_height: imageMetadata?.height,
        });

      if (createError) throw createError;

      // Update campaign status to pending_creative if it's in draft
      const { error: updateError } = await supabase
        .from('campaigns')
        .update({ status: 'pending_creative' })
        .eq('id', campaignId)
        .eq('status', 'pending_payment');

      if (updateError) throw updateError;

      toast({
        title: "Creative uploaded successfully!",
        description: "Your ad creative has been submitted for review. You'll be notified when it's approved.",
      });

      if (onSuccess) {
        onSuccess();
      } else {
        navigate(`/campaigns/${campaignId}`);
      }
    } catch (error) {
      log.error('Error uploading creative', { action: 'handleSubmit', metadata: { error } });
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
