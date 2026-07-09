import { useState } from "react";
import { BookOpen, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useKbArticles,
  useUpsertKbArticle,
  useDeleteKbArticle,
  useKbSearch,
  type KbArticle,
  type KbPassage,
} from "@/hooks/useSupportKb";
import { handleError } from "@/lib/errorHandler";
import { toast } from "sonner";

const EMPTY: Partial<KbArticle> = { title: "", content: "", source: "", category: "" };

export default function SupportKbManager() {
  const { data: articles, isLoading, isError } = useKbArticles();
  const upsert = useUpsertKbArticle();
  const del = useDeleteKbArticle();
  const search = useKbSearch();

  const [editing, setEditing] = useState<Partial<KbArticle> | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KbPassage[] | null>(null);

  async function onSave() {
    if (!editing?.title?.trim() || !editing?.content?.trim()) {
      toast.error("Title and content are required.");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: editing.id,
        title: editing.title!,
        content: editing.content!,
        source: editing.source ?? null,
        category: editing.category ?? null,
        is_active: editing.is_active ?? true,
      });
      toast.success(editing.id ? "Article updated and re-embedded." : "Article added and embedded.");
      setEditing(null);
    } catch (e) {
      handleError(e, { component: "SupportKbManager", action: "save" });
      toast.error("Failed to save article.");
    }
  }

  async function onDelete(id: string) {
    try {
      await del.mutateAsync(id);
      toast.success("Article deleted.");
    } catch (e) {
      handleError(e, { component: "SupportKbManager", action: "delete" });
      toast.error("Failed to delete article.");
    }
  }

  async function onSearch() {
    if (!query.trim()) return;
    try {
      const passages = await search.mutateAsync(query.trim());
      setResults(passages);
    } catch (e) {
      handleError(e, { component: "SupportKbManager", action: "search" });
      toast.error("Retrieval failed.");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" aria-hidden="true" /> Support knowledge base
              </CardTitle>
              <CardDescription>Grounds the AI first-responder. Edits re-embed automatically.</CardDescription>
            </div>
            <Button className="min-h-[44px]" onClick={() => setEditing({ ...EMPTY })}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add article
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Retrieval tester */}
          <div className="mb-4 flex flex-wrap gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Test retrieval — e.g. 'how do I cancel?'"
              className="max-w-md"
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
            />
            <Button variant="outline" className="min-h-[44px]" onClick={onSearch} disabled={search.isPending}>
              {search.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Retrieve
            </Button>
          </div>

          {results && (
            <div className="mb-4 space-y-2 rounded-md border bg-muted/30 p-3">
              <p className="text-sm font-medium">Top passages ({results.length})</p>
              {results.length === 0 && <p className="text-sm text-muted-foreground">No passages above threshold.</p>}
              {results.map((r) => (
                <div key={r.id} className="rounded border bg-background p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.title}</span>
                    <Badge variant="outline">{Math.round(r.similarity * 100)}%</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{r.content}</p>
                  {r.source && <p className="mt-1 text-xs text-muted-foreground">Source: {r.source}</p>}
                </div>
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : isError ? (
            <p className="text-sm text-muted-foreground">Couldn't load KB articles.</p>
          ) : !articles || articles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No KB articles yet. Add one to ground the support agent.</p>
          ) : (
            <div className="space-y-2">
              {articles.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.title}</span>
                      {a.category && <Badge variant="secondary">{a.category}</Badge>}
                      {!a.is_active && <Badge variant="outline">inactive</Badge>}
                      {a.needs_embedding && <Badge variant="outline">embedding…</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.content}</p>
                    {a.source && <p className="mt-1 text-xs text-muted-foreground">Source: {a.source}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(a)}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => onDelete(a.id)} disabled={del.isPending}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit article" : "Add article"}</DialogTitle>
            <DialogDescription>Saving re-embeds the article so it's immediately retrievable.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="kb-title">Title</Label>
                <Input id="kb-title" value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="kb-category">Category</Label>
                  <Input id="kb-category" value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="billing, account…" />
                </div>
                <div>
                  <Label htmlFor="kb-source">Source</Label>
                  <Input id="kb-source" value={editing.source ?? ""} onChange={(e) => setEditing({ ...editing, source: e.target.value })} placeholder="FAQ, policy…" />
                </div>
              </div>
              <div>
                <Label htmlFor="kb-content">Content</Label>
                <Textarea id="kb-content" rows={8} value={editing.content ?? ""} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={onSave} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
