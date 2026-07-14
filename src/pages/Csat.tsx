import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Star, Loader2, CheckCircle2 } from "lucide-react";
import Header from "@/components/Header";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";

export default function Csat() {
  const [params] = useSearchParams();
  const ticketId = params.get("ticket");
  const initialScore = Number(params.get("score")) || 0;

  const [score, setScore] = useState(initialScore);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [reEscalated, setReEscalated] = useState(false);

  async function submit(withScore: number) {
    if (!ticketId || withScore < 1 || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("support/support-csat-submit", {
        body: { ticketId, score: withScore, comment: comment.trim() || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReEscalated(!!data?.reEscalated);
      setDone(true);
    } catch (e) {
      handleError(e, { component: "Csat", action: "submit" });
    } finally {
      setSubmitting(false);
    }
  }

  // One-click links (…&score=N) submit immediately.
  useEffect(() => {
    if (ticketId && initialScore >= 1 && initialScore <= 5) submit(initialScore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <SEOHead title="Rate your support experience - Des Moines Insider" description="Tell us how we did." />
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-12">
          <Card className="mx-auto max-w-md">
            <CardHeader>
              <CardTitle>How did we do?</CardTitle>
              <CardDescription>Rate your recent support experience.</CardDescription>
            </CardHeader>
            <CardContent>
              {!ticketId ? (
                <p className="text-sm text-muted-foreground">This rating link is missing its ticket reference.</p>
              ) : done ? (
                <div className="space-y-2 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" aria-hidden="true" />
                  <p className="font-medium">Thanks for your feedback!</p>
                  {reEscalated && (
                    <p className="text-sm text-muted-foreground">We're sorry we missed the mark — a team member will follow up.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-center gap-1" role="radiogroup" aria-label="Rating out of 5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={score === n}
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                        className="min-h-[44px] min-w-[44px] p-1"
                        onClick={() => setScore(n)}
                      >
                        <Star className={cn("h-8 w-8", n <= score ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Anything else you'd like to share? (optional)"
                    rows={3}
                  />
                  <Button className="w-full min-h-[44px]" disabled={score < 1 || submitting} onClick={() => submit(score)}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit rating
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
