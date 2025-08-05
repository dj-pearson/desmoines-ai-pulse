import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Coffee,
  Music,
  Gamepad2,
  Palette,
  Heart,
  Camera,
  User,
  Calendar,
  MapPin,
  Settings,
  Save,
  TrendingUp,
} from "lucide-react";

const INTERESTS = [
  {
    id: "food",
    label: "Food & Dining",
    icon: Coffee,
    description: "Restaurants, food festivals, culinary events",
  },
  {
    id: "music",
    label: "Music & Concerts",
    icon: Music,
    description: "Live music, concerts, festivals",
  },
  {
    id: "sports",
    label: "Sports & Recreation",
    icon: Gamepad2,
    description: "Games, athletics, recreational activities",
  },
  {
    id: "arts",
    label: "Arts & Culture",
    icon: Palette,
    description: "Museums, galleries, theater, cultural events",
  },
  {
    id: "nightlife",
    label: "Nightlife & Entertainment",
    icon: Heart,
    description: "Bars, clubs, evening entertainment",
  },
  {
    id: "outdoor",
    label: "Outdoor Activities",
    icon: Camera,
    description: "Parks, nature, outdoor adventures",
  },
  {
    id: "family",
    label: "Family Events",
    icon: User,
    description: "Kid-friendly activities, family outings",
  },
  {
    id: "networking",
    label: "Business & Networking",
    icon: Calendar,
    description: "Professional events, meetups",
  },
];

const LOCATIONS = [
  "Downtown Des Moines",
  "West Des Moines",
  "Ankeny",
  "Urbandale",
  "Clive",
  "Johnston",
  "Altoona",
  "Other",
];

export default function PreferencesManager() {
  const { user } = useAuth();
  const { profile, updateProfile, isLoading } = useProfile();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    interests: [] as string[],
    location: "",
    emailNotifications: true,
    smsNotifications: false,
    eventRecommendations: true,
  });
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({
        interests: profile.interests || [],
        location: profile.location || "",
        emailNotifications:
          profile.communication_preferences?.email_notifications ?? true,
        smsNotifications:
          profile.communication_preferences?.sms_notifications ?? false,
        eventRecommendations:
          profile.communication_preferences?.event_recommendations ?? true,
      });
    }
  }, [profile]);

  const handleInterestToggle = (interestId: string) => {
    setFormData((prev) => ({
      ...prev,
      interests: prev.interests.includes(interestId)
        ? prev.interests.filter((id) => id !== interestId)
        : [...prev.interests, interestId],
    }));
  };

  const handleSave = async () => {
    if (!user) return;

    setIsUpdating(true);
    try {
      await updateProfile({
        interests: formData.interests,
        location: formData.location,
        communication_preferences: {
          email_notifications: formData.emailNotifications,
          sms_notifications: formData.smsNotifications,
          event_recommendations: formData.eventRecommendations,
        },
      });

      toast({
        title: "Preferences Updated!",
        description:
          "Your event recommendations will be updated based on your new preferences.",
      });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Failed to update preferences. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          <div className="grid grid-cols-2 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Settings className="h-6 w-6 text-[#DC143C]" />
          <h2 className="text-2xl font-bold">Personalization Settings</h2>
        </div>
        <p className="text-neutral-600">
          Fine-tune your preferences to get better event recommendations
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Your Interests
          </CardTitle>
          <CardDescription>
            Select topics you're interested in. We'll use these to recommend
            relevant events.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {INTERESTS.map((interest) => {
              const Icon = interest.icon;
              const isSelected = formData.interests.includes(interest.id);

              return (
                <div
                  key={interest.id}
                  className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? "bg-primary/10 border-primary shadow-sm"
                      : "border-border hover:bg-muted/50"
                  }`}
                  onClick={() => handleInterestToggle(interest.id)}
                >
                  <Checkbox
                    checked={isSelected}
                    onChange={() => handleInterestToggle(interest.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="h-4 w-4" />
                      <Label className="font-medium cursor-pointer">
                        {interest.label}
                      </Label>
                    </div>
                    <p className="text-sm text-neutral-500">
                      {interest.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Location Preferences
          </CardTitle>
          <CardDescription>
            We'll prioritize events near your preferred area.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={formData.location}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, location: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select your preferred area" />
            </SelectTrigger>
            <SelectContent>
              {LOCATIONS.map((location) => (
                <SelectItem key={location} value={location}>
                  {location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Communication Preferences</CardTitle>
          <CardDescription>
            Choose how you'd like to receive event updates and recommendations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="emailNotifications"
              checked={formData.emailNotifications}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({
                  ...prev,
                  emailNotifications: !!checked,
                }))
              }
            />
            <Label htmlFor="emailNotifications">
              Email notifications about new events
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="smsNotifications"
              checked={formData.smsNotifications}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({
                  ...prev,
                  smsNotifications: !!checked,
                }))
              }
            />
            <Label htmlFor="smsNotifications">
              SMS notifications for urgent updates
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="eventRecommendations"
              checked={formData.eventRecommendations}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({
                  ...prev,
                  eventRecommendations: !!checked,
                }))
              }
            />
            <Label htmlFor="eventRecommendations">
              Personalized event recommendations
            </Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center gap-4">
        <Button onClick={handleSave} disabled={isUpdating} className="min-w-32">
          <Save className="h-4 w-4 mr-2" />
          {isUpdating ? "Saving..." : "Save Preferences"}
        </Button>
      </div>

      {formData.interests.length > 0 && (
        <Card className="bg-accent/5 border-accent/20">
          <CardContent className="pt-6">
            <div className="text-center">
              <h4 className="font-semibold text-accent mb-2">
                🎯 Your Personalized Experience
              </h4>
              <p className="text-sm text-neutral-600">
                Based on your {formData.interests.length} selected interests,
                we'll recommend events that match your preferences and location.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
