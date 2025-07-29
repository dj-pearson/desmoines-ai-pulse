import React, { useState } from "react";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useDomainHighlights } from "@/hooks/useDomainHighlights";
import { useToast } from "@/hooks/use-toast";

export function DomainHighlightManager() {
  const { domains, isLoading, addDomain, removeDomain } = useDomainHighlights();
  const { toast } = useToast();
  const [newDomain, setNewDomain] = useState("");
  const [description, setDescription] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;

    setIsAdding(true);
    try {
      await addDomain(newDomain, description || undefined);
      setNewDomain("");
      setDescription("");
      toast({
        title: "Domain Added",
        description: `${newDomain} will now be highlighted in the events list.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add domain",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveDomain = async (id: string, domain: string) => {
    try {
      await removeDomain(id);
      toast({
        title: "Domain Removed",
        description: `${domain} is no longer highlighted.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove domain",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Domain Highlights
        </CardTitle>
        <CardDescription>
          Add domains to highlight events that need attention. Events from these domains will be highlighted in the events list for easy identification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add New Domain */}
        <form onSubmit={handleAddDomain} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                type="text"
                placeholder="e.g., catchdesmoines.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                type="text"
                placeholder="e.g., Events need URL updates"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" disabled={isAdding || !newDomain.trim()}>
            <Plus className="h-4 w-4 mr-2" />
            {isAdding ? "Adding..." : "Add Domain"}
          </Button>
        </form>

        {/* Domain List */}
        <div className="space-y-3">
          <h4 className="font-medium">Highlighted Domains ({domains.length})</h4>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading domains...</div>
          ) : domains.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No domains added yet. Add domains above to highlight events that need attention.
            </div>
          ) : (
            <div className="space-y-2">
              {domains.map((domain) => (
                <div
                  key={domain.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{domain.domain}</Badge>
                      {domain.description && (
                        <span className="text-sm text-muted-foreground">
                          {domain.description}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Added {new Date(domain.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveDomain(domain.id, domain.domain)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}