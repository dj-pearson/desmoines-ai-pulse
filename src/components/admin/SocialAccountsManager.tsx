import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Facebook,
  Instagram,
  Key,
  Linkedin,
  Loader2,
  Plus,
  RotateCw,
  Send,
  Trash2,
  Twitter,
  XCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Platform = "twitter" | "facebook" | "instagram" | "linkedin";

interface SocialAccount {
  id: string;
  platform: Platform;
  handle: string;
  has_access_token: boolean;
  has_refresh_token: boolean;
  token_expires_at: string | null;
  is_active: boolean;
  last_validated_at: string | null;
  last_validation_error: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const PLATFORMS: { value: Platform; label: string; Icon: typeof Twitter }[] = [
  { value: "twitter", label: "X / Twitter", Icon: Twitter },
  { value: "facebook", label: "Facebook", Icon: Facebook },
  { value: "instagram", label: "Instagram", Icon: Instagram },
  { value: "linkedin", label: "LinkedIn", Icon: Linkedin },
];

function validationTone(
  validated_at: string | null,
  error: string | null,
): "fresh" | "stale" | "danger" | "none" {
  if (!validated_at) return "none";
  if (error) return "danger";
  const ms = Date.now() - new Date(validated_at).getTime();
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return "fresh";
  if (hours < 72) return "stale";
  return "danger";
}

function ValidatedBadge({ acc }: { acc: SocialAccount }) {
  const tone = validationTone(acc.last_validated_at, acc.last_validation_error);
  if (tone === "none") {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        Never tested
      </Badge>
    );
  }
  if (tone === "danger") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-red-500 text-red-600"
      >
        <XCircle className="h-3 w-3" />
        Failing
      </Badge>
    );
  }
  if (tone === "stale") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-amber-500 text-amber-600"
      >
        {"Stale (>24h)"}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[10px] gap-1 border-green-500 text-green-600"
    >
      <CheckCircle2 className="h-3 w-3" />
      Fresh
    </Badge>
  );
}

interface AddDialogState {
  open: boolean;
  mode: "create" | "rotate";
  targetId?: string;
  targetPlatform?: Platform;
  targetHandle?: string;
}

const EMPTY_DIALOG: AddDialogState = { open: false, mode: "create" };

export default function SocialAccountsManager() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SocialAccount | null>(null);
  const [dialog, setDialog] = useState<AddDialogState>(EMPTY_DIALOG);

  // Form state
  const [formPlatform, setFormPlatform] = useState<Platform>("twitter");
  const [formHandle, setFormHandle] = useState("");
  const [formAccessToken, setFormAccessToken] = useState("");
  const [formRefreshToken, setFormRefreshToken] = useState("");
  const [formExpiresAt, setFormExpiresAt] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setFormPlatform("twitter");
    setFormHandle("");
    setFormAccessToken("");
    setFormRefreshToken("");
    setFormExpiresAt("");
    setFormNotes("");
  }

  async function loadAccounts() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        accounts: SocialAccount[];
      }>("manage-social-account", { body: { action: "list" } });
      if (error) throw error;
      setAccounts(data?.accounts ?? []);
    } catch (err) {
      handleError(err, {
        component: "SocialAccountsManager",
        action: "loadAccounts",
      });
      toast.error("Failed to load social accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  async function submitForm() {
    if (!formAccessToken.trim()) {
      toast.error("Access token is required");
      return;
    }
    setSubmitting(true);
    try {
      if (dialog.mode === "create") {
        if (!formHandle.trim()) {
          toast.error("Handle is required");
          setSubmitting(false);
          return;
        }
        const { error } = await supabase.functions.invoke(
          "manage-social-account",
          {
            body: {
              action: "create",
              payload: {
                platform: formPlatform,
                handle: formHandle.trim(),
                access_token: formAccessToken.trim(),
                refresh_token: formRefreshToken.trim() || undefined,
                token_expires_at: formExpiresAt || null,
                notes: formNotes.trim() || null,
              },
            },
          },
        );
        if (error) throw error;
        toast.success(`Added ${formPlatform} account ${formHandle}`);
      } else if (dialog.mode === "rotate" && dialog.targetId) {
        const { error } = await supabase.functions.invoke(
          "manage-social-account",
          {
            body: {
              action: "rotate",
              payload: {
                id: dialog.targetId,
                access_token: formAccessToken.trim(),
                refresh_token: formRefreshToken.trim() || undefined,
                token_expires_at: formExpiresAt || null,
              },
            },
          },
        );
        if (error) throw error;
        toast.success("Token rotated");
      }
      resetForm();
      setDialog(EMPTY_DIALOG);
      await loadAccounts();
    } catch (err) {
      handleError(err, {
        component: "SocialAccountsManager",
        action: "submitForm",
      });
      toast.error("Save failed. Check console.");
    } finally {
      setSubmitting(false);
    }
  }

  async function testConnection(account: SocialAccount) {
    setBusyId(account.id);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        error?: string;
      }>("manage-social-account", {
        body: { action: "test", id: account.id },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`${account.platform} · ${account.handle} validated`);
      } else {
        toast.error(`Validation failed: ${data?.error ?? "unknown"}`);
      }
      await loadAccounts();
    } catch (err) {
      handleError(err, {
        component: "SocialAccountsManager",
        action: "testConnection",
      });
      toast.error("Test failed. Check console.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAccount(account: SocialAccount) {
    setBusyId(account.id);
    try {
      const { error } = await supabase.functions.invoke(
        "manage-social-account",
        { body: { action: "delete", id: account.id } },
      );
      if (error) throw error;
      toast.success("Account removed");
      setDeleting(null);
      await loadAccounts();
    } catch (err) {
      handleError(err, {
        component: "SocialAccountsManager",
        action: "deleteAccount",
      });
      toast.error("Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  const grouped = useMemo(() => {
    const byPlatform = new Map<Platform, SocialAccount[]>();
    for (const a of accounts) {
      const list = byPlatform.get(a.platform) ?? [];
      list.push(a);
      byPlatform.set(a.platform, list);
    }
    return byPlatform;
  }, [accounts]);

  function openCreate() {
    resetForm();
    setDialog({ open: true, mode: "create" });
  }

  function openRotate(acc: SocialAccount) {
    resetForm();
    setFormPlatform(acc.platform);
    setFormHandle(acc.handle);
    setDialog({
      open: true,
      mode: "rotate",
      targetId: acc.id,
      targetPlatform: acc.platform,
      targetHandle: acc.handle,
    });
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="h-5 w-5" />
              Connected social accounts
            </CardTitle>
            <CardDescription>
              {accounts.length} account{accounts.length === 1 ? "" : "s"} ·
              tokens encrypted server-side, never returned to this page.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add account
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12 border rounded-md">
            <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No social accounts connected yet.
          </div>
        ) : (
          PLATFORMS.map(({ value, label, Icon }) => {
            const list = grouped.get(value) ?? [];
            if (list.length === 0) return null;
            return (
              <div key={value} className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Icon className="h-4 w-4" />
                  {label}
                </div>
                <div className="rounded-md border divide-y">
                  {list.map((acc) => (
                    <div
                      key={acc.id}
                      className="flex flex-wrap items-center gap-3 p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{acc.handle}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <ValidatedBadge acc={acc} />
                          {!acc.has_access_token && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-amber-500 text-amber-600"
                            >
                              No access token
                            </Badge>
                          )}
                          {acc.token_expires_at && (
                            <span className="text-[10px] text-muted-foreground">
                              Expires{" "}
                              {new Date(acc.token_expires_at).toLocaleDateString()}
                            </span>
                          )}
                          {acc.last_validation_error && (
                            <span
                              className="text-[10px] text-red-600 truncate max-w-[280px]"
                              title={acc.last_validation_error}
                            >
                              {acc.last_validation_error}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === acc.id}
                          onClick={() => testConnection(acc)}
                        >
                          {busyId === acc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <Send className="h-3.5 w-3.5 mr-1" />
                          )}
                          Test
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRotate(acc)}
                          disabled={busyId === acc.id}
                        >
                          <RotateCw className="h-3.5 w-3.5 mr-1" />
                          Rotate
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          onClick={() => setDeleting(acc)}
                          disabled={busyId === acc.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      {/* Add / rotate dialog */}
      <Dialog
        open={dialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(EMPTY_DIALOG);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog.mode === "create"
                ? "Add social account"
                : `Rotate token · ${dialog.targetHandle}`}
            </DialogTitle>
            <DialogDescription>
              {dialog.mode === "create"
                ? "Tokens are encrypted server-side before write. Test the connection after saving to verify."
                : "Paste the new access token. Existing handle and platform are kept."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {dialog.mode === "create" && (
              <>
                <div>
                  <Label>Platform</Label>
                  <Select
                    value={formPlatform}
                    onValueChange={(v: Platform) => setFormPlatform(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="s-handle">Handle</Label>
                  <Input
                    id="s-handle"
                    placeholder="@desmoinesinsider"
                    value={formHandle}
                    onChange={(e) => setFormHandle(e.target.value)}
                  />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="s-token">Access token</Label>
              <Textarea
                id="s-token"
                rows={3}
                className={cn("font-mono text-xs")}
                value={formAccessToken}
                onChange={(e) => setFormAccessToken(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="s-refresh">Refresh token (optional)</Label>
              <Textarea
                id="s-refresh"
                rows={2}
                className="font-mono text-xs"
                value={formRefreshToken}
                onChange={(e) => setFormRefreshToken(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="s-exp">Expires at</Label>
                <Input
                  id="s-exp"
                  type="datetime-local"
                  value={formExpiresAt}
                  onChange={(e) => setFormExpiresAt(e.target.value)}
                />
              </div>
            </div>
            {dialog.mode === "create" && (
              <div>
                <Label htmlFor="s-notes">Notes</Label>
                <Input
                  id="s-notes"
                  placeholder="OAuth app, scopes, who owns the connection…"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialog(EMPTY_DIALOG);
                resetForm();
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={submitForm} disabled={submitting}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {dialog.mode === "create" ? "Add" : "Rotate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove account?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `Permanently delete the ${deleting.platform} account ${deleting.handle}? The encrypted token is wiped.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteAccount(deleting)}
              disabled={busyId !== null}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
