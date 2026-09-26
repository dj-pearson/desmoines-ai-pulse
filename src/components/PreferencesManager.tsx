import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { handleError } from "@/lib/errorHandler";
import { logConsent, type ConsentType } from "@/lib/consentLog";
import { INTERESTS } from "@/lib/interests";
import { cn } from "@/lib/utils";

/**
 * The consent keys this file owns in profiles.communication_preferences.
 *
 * sms_notifications is no longer shown or written: no SMS sender exists, so a
 * switch for it controlled nothing. A stored value is left where it is.
 */
export type ConsentKey = "email_notifications" | "event_recommendations";

const CONSENT_TYPE: Record<ConsentKey, ConsentType> = {
  email_notifications: "marketing_email",
  event_recommendations: "personalization_ai",
};

/**
 * ONLY AN EXPLICIT true IS AN OPT-IN (account plan WP5 item 5).
 *
 * This read `?? true`, so every account without the key - every Google and
 * Apple sign-up, which never passes through the sign-up form's unticked boxes -
 * rendered as opted in, and pressing Save for an unrelated interest wrote that
 * opt-in to the row. Sign-up leaves both unticked; so does this.
 */
export function readOptIn(bag: unknown, key: ConsentKey): boolean {
  if (!bag || typeof bag !== "object") return false;
  return (bag as Record<string, unknown>)[key] === true;
}

/**
 * Write changed consent keys (and optionally interests) without disturbing the
 * rest of the shared bag.
 *
 * communication_preferences IS A SHARED BAG. useUserPreferences.ts keeps
 * taste_preferences in it, existing rows still carry ui_preferences (from a
 * since-deleted use-user-preferences.ts hook), and
 * the lifecycle classifier reads `marketing`, `email` and `email_notifications`
 * out of it. A PostgREST update of a JSONB column REPLACES it, so this reads the
 * current bag and merges. A failed read fails the save: treating it as an empty
 * bag is exactly the write that loses the other keys (WEB-LEGAL-012).
 *
 * Only the keys passed in `consent` are written, and each one gets a
 * consent_records row, so the history panel shows every flip with its date.
 */
export function usePreferenceWriter() {
  const { user } = useAuth();
  const { updateProfile } = useProfile();

  return async (
    consent: Partial<Record<ConsentKey, boolean>>,
    extra: { interests?: string[] } = {},
  ): Promise<void> => {
    if (!user) throw new Error("User not authenticated");
    const changedKeys = Object.keys(consent) as ConsentKey[];

    if (changedKeys.length > 0) {
      const { data: current, error: readError } = await supabase
        .from("profiles")
        .select("communication_preferences")
        .eq("user_id", user.id)
        .single();
      if (readError) throw readError;

      const existing = (current?.communication_preferences as Record<string, unknown>) ?? {};
      await updateProfile({
        ...(extra.interests ? { interests: extra.interests } : {}),
        communication_preferences: {
          ...existing,
          ...consent,
        },
      });

      await Promise.all(
        changedKeys.map((key) =>
          logConsent({
            type: CONSENT_TYPE[key],
            granted: consent[key] === true,
            source: "profile_settings",
            metadata: { key },
          }),
        ),
      );
    } else if (extra.interests) {
      await updateProfile({ interests: extra.interests });
    }
  };
}

interface ConsentSwitchProps {
  consentKey: ConsentKey;
  id: string;
  label: string;
  description: string;
}

/**
 * One consent switch that saves as soon as it is flipped. Used by EmailStreams
 * for "Account and activity emails"; the recommendations switch below is the
 * same control.
 */
export function ConsentSwitch({ consentKey, id, label, description }: ConsentSwitchProps) {
  const { profile, isLoading } = useProfile();
  const { toast } = useToast();
  const save = usePreferenceWriter();
  const stored = readOptIn(profile?.communication_preferences, consentKey);
  const [checked, setChecked] = useState(stored);
  const [saving, setSaving] = useState(false);

  useEffect(() => setChecked(stored), [stored]);

  const flip = async (next: boolean) => {
    setChecked(next);
    setSaving(true);
    try {
      await save({ [consentKey]: next });
      toast({ title: next ? "Turned on" : "Turned off", description: label });
    } catch (error) {
      setChecked(!next);
      handleError(error, { component: "ConsentSwitch", action: consentKey });
      toast({
        title: "Couldn't save that",
        description: "Your setting hasn't changed. Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Skeleton className="h-12 w-full" />;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-base font-medium">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={flip} disabled={saving} />
    </div>
  );
}

/**
 * Interests and the personalization consent (account plan WP5 item 5).
 *
 * The location picker ("We'll prioritize events near your preferred area") and
 * the "Your Personalized Experience" card are gone: nothing on the web ranks by
 * profiles.location, so both described a feature that doesn't exist. The
 * account-email switch moved to EmailStreams, next to the other email streams.
 */
export default function PreferencesManager() {
  const { profile, isLoading } = useProfile();
  const { toast } = useToast();
  const save = usePreferenceWriter();

  const storedInterests = useMemo(() => profile?.interests ?? [], [profile?.interests]);
  const storedRecommendations = readOptIn(profile?.communication_preferences, "event_recommendations");

  const [interests, setInterests] = useState<string[]>(storedInterests);
  const [recommendations, setRecommendations] = useState(storedRecommendations);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setInterests(storedInterests);
    setRecommendations(storedRecommendations);
  }, [storedInterests, storedRecommendations]);

  const interestsChanged =
    interests.length !== storedInterests.length || interests.some((id) => !storedInterests.includes(id));
  const recommendationsChanged = recommendations !== storedRecommendations;
  const dirty = interestsChanged || recommendationsChanged;

  const toggleInterest = (id: string, on: boolean) => {
    setInterests((prev) => (on ? [...prev.filter((x) => x !== id), id] : prev.filter((x) => x !== id)));
  };

  const handleSave = async () => {
    setIsUpdating(true);
    try {
      await save(recommendationsChanged ? { event_recommendations: recommendations } : {}, {
        interests: interestsChanged ? interests : undefined,
      });
      toast({ title: "Saved" });
    } catch (error) {
      handleError(error, { component: "PreferencesManager", action: "save" });
      toast({
        title: "Couldn't save your preferences",
        description: "Nothing was changed. Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {INTERESTS.map((interest) => (
            <Skeleton key={interest.id} className="h-12" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Interests and suggestions</CardTitle>
        <CardDescription>The kinds of events you follow, saved to your profile.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset>
          <legend className="sr-only">Interests</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {INTERESTS.map((interest) => {
              const id = `interest-${interest.id}`;
              const selected = interests.includes(interest.id);
              return (
                <label
                  key={interest.id}
                  htmlFor={id}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
                    selected ? "border-primary bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  <Checkbox
                    id={id}
                    checked={selected}
                    onCheckedChange={(state) => toggleInterest(interest.id, state === true)}
                  />
                  <span className="font-medium">{interest.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="event-recommendations" className="text-base font-medium">
              Personalized suggestions
            </Label>
            <p className="text-sm text-muted-foreground">
              Lets us use the events and places you save to suggest others.
            </p>
          </div>
          <Switch
            id="event-recommendations"
            checked={recommendations}
            onCheckedChange={setRecommendations}
          />
        </div>

        <Button onClick={handleSave} disabled={isUpdating || !dirty}>
          {isUpdating ? "Saving..." : "Save Preferences"}
        </Button>
      </CardContent>
    </Card>
  );
}
