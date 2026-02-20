import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Edit,
  Trash2,
  MapPin,
  Phone,
  Globe,
  Search,
  Building2,
  Users,
  CheckCircle2,
  XCircle,
  Navigation,
  RefreshCw,
  Calendar,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  useKnownVenues,
  useCreateVenue,
  useUpdateVenue,
  useDeleteVenue,
  useVenueStats,
  useVenueMatcher,
  KnownVenue,
  VenueFormData,
} from "@/hooks/useKnownVenues";
import { createLogger } from '@/lib/logger';

const log = createLogger('VenuesManager');

const VENUE_TYPES = [
  { value: "music_hall", label: "Music Hall" },
  { value: "arena", label: "Arena" },
  { value: "theater", label: "Theater" },
  { value: "stadium", label: "Stadium" },
  { value: "amphitheater", label: "Amphitheater" },
  { value: "convention_center", label: "Convention Center" },
  { value: "bar", label: "Bar/Club" },
  { value: "restaurant", label: "Restaurant" },
  { value: "park", label: "Park" },
  { value: "museum", label: "Museum" },
  { value: "garden", label: "Garden" },
  { value: "zoo", label: "Zoo" },
  { value: "fairgrounds", label: "Fairgrounds" },
  { value: "market", label: "Market" },
  { value: "other", label: "Other" },
];

interface VenueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venue?: KnownVenue | null;
  onSave: (data: VenueFormData) => void;
  isLoading: boolean;
}

function VenueDialog({
  open,
  onOpenChange,
  venue,
  onSave,
  isLoading,
}: VenueDialogProps) {
  const [formData, setFormData] = useState<VenueFormData>({
    name: venue?.name || "",
    aliases: venue?.aliases || [],
    address: venue?.address || "",
    city: venue?.city || "Des Moines",
    state: venue?.state || "IA",
    zip: venue?.zip || "",
    latitude: venue?.latitude || undefined,
    longitude: venue?.longitude || undefined,
    phone: venue?.phone || "",
    email: venue?.email || "",
    website: venue?.website || "",
    venue_type: venue?.venue_type || "",
    capacity: venue?.capacity || undefined,
    description: venue?.description || "",
    is_active: venue?.is_active ?? true,
  });

  const [aliasInput, setAliasInput] = useState("");

  React.useEffect(() => {
    if (venue) {
      setFormData({
        name: venue.name,
        aliases: venue.aliases || [],
        address: venue.address || "",
        city: venue.city || "Des Moines",
        state: venue.state || "IA",
        zip: venue.zip || "",
        latitude: venue.latitude || undefined,
        longitude: venue.longitude || undefined,
        phone: venue.phone || "",
        email: venue.email || "",
        website: venue.website || "",
        venue_type: venue.venue_type || "",
        capacity: venue.capacity || undefined,
        description: venue.description || "",
        is_active: venue.is_active ?? true,
      });
    } else {
      setFormData({
        name: "",
        aliases: [],
        address: "",
        city: "Des Moines",
        state: "IA",
        zip: "",
        latitude: undefined,
        longitude: undefined,
        phone: "",
        email: "",
        website: "",
        venue_type: "",
        capacity: undefined,
        description: "",
        is_active: true,
      });
    }
    setAliasInput("");
  }, [venue, open]);

  const handleAddAlias = () => {
    if (aliasInput.trim() && !formData.aliases?.includes(aliasInput.trim())) {
      setFormData({
        ...formData,
        aliases: [...(formData.aliases || []), aliasInput.trim()],
      });
      setAliasInput("");
    }
  };

  const handleRemoveAlias = (alias: string) => {
    setFormData({
      ...formData,
      aliases: formData.aliases?.filter((a) => a !== alias) || [],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {venue ? "Edit Venue" : "Add New Venue"}
          </DialogTitle>
          <DialogDescription>
            {venue
              ? "Update the venue information below."
              : "Add a new known venue for automatic event data population."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="name">Venue Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Vibrant Music Hall"
                required
              />
            </div>

            <div className="col-span-2">
              <Label>Aliases (for matching)</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  placeholder="Add alias (e.g., VMH, Vibrant)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddAlias();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddAlias} variant="outline">
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.aliases?.map((alias) => (
                  <Badge
                    key={alias}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => handleRemoveAlias(alias)}
                  >
                    {alias} ×
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="venue_type">Venue Type</Label>
              <Select
                value={formData.venue_type || ""}
                onValueChange={(value) =>
                  setFormData({ ...formData, venue_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {VENUE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                type="number"
                value={formData.capacity || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    capacity: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                placeholder="2500"
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Address
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  value={formData.address || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  placeholder="2938 Grand Prairie Pkwy"
                />
              </div>
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, city: e.target.value })
                  }
                  placeholder="Des Moines"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={formData.state || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, state: e.target.value })
                    }
                    placeholder="IA"
                  />
                </div>
                <div>
                  <Label htmlFor="zip">ZIP</Label>
                  <Input
                    id="zip"
                    value={formData.zip || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, zip: e.target.value })
                    }
                    placeholder="50263"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Coordinates */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
              <Navigation className="h-4 w-4" /> Coordinates (for maps)
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="latitude">Latitude</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  value={formData.latitude || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      latitude: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="41.5917"
                />
              </div>
              <div>
                <Label htmlFor="longitude">Longitude</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  value={formData.longitude || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      longitude: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="-93.8869"
                />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
              <Phone className="h-4 w-4" /> Contact Information
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="515.895.4980"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="info@venue.com"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={formData.website || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, website: e.target.value })
                  }
                  placeholder="https://www.venue.com"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Brief description of the venue..."
              rows={3}
            />
          </div>

          {/* Active Status */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
              className="rounded border-gray-300"
            />
            <Label htmlFor="is_active">Active (available for matching)</Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !formData.name}>
              {isLoading ? "Saving..." : venue ? "Update Venue" : "Create Venue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Types for backfill preview
interface EventToBackfill {
  id: string;
  title: string;
  venue: string;
  currentLocation: string | null;
  currentLatitude: number | null;
  currentLongitude: number | null;
  matchedVenue: KnownVenue;
  fieldsToUpdate: string[];
  selected: boolean;
}

interface BackfillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venues: KnownVenue[];
}

function BackfillDialog({ open, onOpenChange, venues }: BackfillDialogProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [eventsToBackfill, setEventsToBackfill] = useState<EventToBackfill[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const { findVenue, getAutoFillData } = useVenueMatcher();

  const selectedCount = eventsToBackfill.filter((e) => e.selected).length;

  const scanForMatchingEvents = async () => {
    setIsScanning(true);
    try {
      // Fetch all events
      const { data: events, error } = await supabase
        .from("events")
        .select("id, title, venue, location, latitude, longitude")
        .not("venue", "is", null)
        .order("date", { ascending: false });

      if (error) throw error;

      const matches: EventToBackfill[] = [];

      for (const event of events || []) {
        if (!event.venue) continue;

        const matchedVenue = findVenue(event.venue);
        if (!matchedVenue) continue;

        const autoFillData = getAutoFillData(matchedVenue);
        const fieldsToUpdate: string[] = [];

        // Check which fields need updating (only empty or incomplete fields)
        if (!event.location && autoFillData.location) {
          fieldsToUpdate.push("location");
        } else if (event.location && autoFillData.location) {
          // Check if current location is incomplete (e.g., just city name)
          const currentLoc = event.location.toLowerCase();
          const venueLoc = autoFillData.location.toLowerCase();
          if (
            currentLoc.length < venueLoc.length &&
            venueLoc.includes(currentLoc.split(",")[0])
          ) {
            fieldsToUpdate.push("location");
          }
        }

        if (!event.latitude && autoFillData.latitude) {
          fieldsToUpdate.push("latitude");
        }
        if (!event.longitude && autoFillData.longitude) {
          fieldsToUpdate.push("longitude");
        }

        // Only include events that have fields to update
        if (fieldsToUpdate.length > 0) {
          matches.push({
            id: event.id,
            title: event.title,
            venue: event.venue,
            currentLocation: event.location,
            currentLatitude: event.latitude,
            currentLongitude: event.longitude,
            matchedVenue,
            fieldsToUpdate,
            selected: true,
          });
        }
      }

      setEventsToBackfill(matches);
      setHasScanned(true);

      if (matches.length === 0) {
        toast.info("No events found that need backfilling");
      } else {
        toast.success(`Found ${matches.length} events to update`);
      }
    } catch (error) {
      log.error('scan', 'Scan error', { data: error });
      toast.error("Failed to scan events: " + (error as Error).message);
    } finally {
      setIsScanning(false);
    }
  };

  const toggleEventSelection = (eventId: string) => {
    setEventsToBackfill((prev) =>
      prev.map((e) =>
        e.id === eventId ? { ...e, selected: !e.selected } : e
      )
    );
  };

  const toggleAll = (selected: boolean) => {
    setEventsToBackfill((prev) => prev.map((e) => ({ ...e, selected })));
  };

  const applyBackfill = async () => {
    const selectedEvents = eventsToBackfill.filter((e) => e.selected);
    if (selectedEvents.length === 0) {
      toast.error("No events selected");
      return;
    }

    setIsApplying(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const event of selectedEvents) {
        const autoFillData = getAutoFillData(event.matchedVenue);
        const updateData: Record<string, any> = {};

        if (event.fieldsToUpdate.includes("location") && autoFillData.location) {
          updateData.location = autoFillData.location;
        }
        if (event.fieldsToUpdate.includes("latitude") && autoFillData.latitude) {
          updateData.latitude = autoFillData.latitude;
        }
        if (event.fieldsToUpdate.includes("longitude") && autoFillData.longitude) {
          updateData.longitude = autoFillData.longitude;
        }

        if (Object.keys(updateData).length > 0) {
          const { error } = await supabase
            .from("events")
            .update(updateData)
            .eq("id", event.id);

          if (error) {
            log.error('backfill', `Failed to update event ${event.id}`, { data: error });
            errorCount++;
          } else {
            successCount++;
          }
        }
      }

      if (successCount > 0) {
        toast.success(`Updated ${successCount} events successfully`);
      }
      if (errorCount > 0) {
        toast.error(`Failed to update ${errorCount} events`);
      }

      // Remove successfully updated events from the list
      setEventsToBackfill((prev) =>
        prev.filter((e) => !e.selected || errorCount > 0)
      );

      if (errorCount === 0) {
        onOpenChange(false);
      }
    } catch (error) {
      log.error('backfill', 'Backfill error', { data: error });
      toast.error("Backfill failed: " + (error as Error).message);
    } finally {
      setIsApplying(false);
    }
  };

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setEventsToBackfill([]);
      setHasScanned(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Backfill Events from Known Venues
          </DialogTitle>
          <DialogDescription>
            Scan existing events to find matches with known venues and update
            their location data (address, coordinates).
          </DialogDescription>
        </DialogHeader>

        {!hasScanned ? (
          <div className="py-8 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              Click scan to find events that match your {venues.length} known
              venues and need location updates.
            </p>
            <Button onClick={scanForMatchingEvents} disabled={isScanning}>
              {isScanning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Scan Events
                </>
              )}
            </Button>
          </div>
        ) : eventsToBackfill.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <p className="text-muted-foreground">
              All events are up to date! No backfill needed.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-4">
                <Checkbox
                  checked={selectedCount === eventsToBackfill.length}
                  onCheckedChange={(checked) => toggleAll(!!checked)}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedCount} of {eventsToBackfill.length} selected
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={scanForMatchingEvents}
                disabled={isScanning}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isScanning ? "animate-spin" : ""}`}
                />
                Re-scan
              </Button>
            </div>

            <ScrollArea className="flex-1 max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Matched Venue</TableHead>
                    <TableHead>Updates</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventsToBackfill.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <Checkbox
                          checked={event.selected}
                          onCheckedChange={() => toggleEventSelection(event.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm truncate max-w-[200px]">
                            {event.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Venue: {event.venue}
                          </p>
                          {event.currentLocation && (
                            <p className="text-xs text-muted-foreground">
                              Current: {event.currentLocation}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ArrowRight className="h-4 w-4 text-green-500" />
                          <div>
                            <p className="font-medium text-sm text-green-700">
                              {event.matchedVenue.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {event.matchedVenue.address},{" "}
                              {event.matchedVenue.city}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {event.fieldsToUpdate.map((field) => (
                            <Badge
                              key={field}
                              variant="outline"
                              className="text-xs bg-blue-50 text-blue-700"
                            >
                              {field}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {hasScanned && eventsToBackfill.length > 0 ? "Cancel" : "Close"}
          </Button>
          {hasScanned && eventsToBackfill.length > 0 && (
            <Button
              onClick={applyBackfill}
              disabled={isApplying || selectedCount === 0}
            >
              {isApplying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Apply to {selectedCount} Events
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function VenuesManager() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [backfillDialogOpen, setBackfillDialogOpen] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<KnownVenue | null>(null);

  const { data: venues, isLoading } = useKnownVenues(showInactive);
  const stats = useVenueStats();
  const createVenue = useCreateVenue();
  const updateVenue = useUpdateVenue();
  const deleteVenue = useDeleteVenue();

  const filteredVenues = venues?.filter((venue) => {
    const search = searchTerm.toLowerCase();
    return (
      venue.name.toLowerCase().includes(search) ||
      venue.aliases?.some((a) => a.toLowerCase().includes(search)) ||
      venue.city?.toLowerCase().includes(search) ||
      venue.venue_type?.toLowerCase().includes(search)
    );
  });

  const handleCreate = () => {
    setSelectedVenue(null);
    setDialogOpen(true);
  };

  const handleEdit = (venue: KnownVenue) => {
    setSelectedVenue(venue);
    setDialogOpen(true);
  };

  const handleDelete = async (venue: KnownVenue) => {
    if (confirm(`Are you sure you want to delete "${venue.name}"?`)) {
      await deleteVenue.mutateAsync(venue.id);
    }
  };

  const handleSave = async (data: VenueFormData) => {
    if (selectedVenue) {
      await updateVenue.mutateAsync({ id: selectedVenue.id, ...data });
    } else {
      await createVenue.mutateAsync(data);
    }
    setDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Venues</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Building2 className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">With Coordinates</p>
                <p className="text-2xl font-bold text-blue-600">
                  {stats.withCoordinates}
                </p>
              </div>
              <MapPin className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Venue Types</p>
                <p className="text-2xl font-bold">
                  {Object.keys(stats.byType).length}
                </p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-4 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search venues..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show inactive
          </label>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setBackfillDialogOpen(true)}
            disabled={!venues || venues.length === 0}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Backfill Events
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Venue
          </Button>
        </div>
      </div>

      {/* Venues Table */}
      <Card>
        <CardHeader>
          <CardTitle>Known Venues</CardTitle>
          <CardDescription>
            Manage venues for automatic event data population. Events with
            matching venue names will auto-fill location, coordinates, and
            contact information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading venues...
            </div>
          ) : filteredVenues?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No venues found. Add your first venue to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venue</TableHead>
                    <TableHead>Aliases</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Coords</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVenues?.map((venue) => (
                    <TableRow key={venue.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{venue.name}</p>
                          {venue.phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {venue.phone}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {venue.aliases?.slice(0, 3).map((alias) => (
                            <Badge
                              key={alias}
                              variant="outline"
                              className="text-xs"
                            >
                              {alias}
                            </Badge>
                          ))}
                          {(venue.aliases?.length || 0) > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{(venue.aliases?.length || 0) - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {venue.address && (
                            <p className="truncate max-w-[200px]">{venue.address}</p>
                          )}
                          <p className="text-muted-foreground">
                            {venue.city}, {venue.state} {venue.zip}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {venue.venue_type && (
                          <Badge variant="secondary">
                            {VENUE_TYPES.find((t) => t.value === venue.venue_type)
                              ?.label || venue.venue_type}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {venue.latitude && venue.longitude ? (
                          <Badge
                            variant="outline"
                            className="bg-green-50 text-green-700"
                          >
                            <MapPin className="h-3 w-3 mr-1" />
                            Set
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <XCircle className="h-3 w-3 mr-1" />
                            Missing
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {venue.is_active ? (
                          <Badge className="bg-green-100 text-green-800">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(venue)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {venue.website && (
                            <Button
                              size="sm"
                              variant="outline"
                              asChild
                            >
                              <a
                                href={venue.website}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Globe className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(venue)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Venue Dialog */}
      <VenueDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        venue={selectedVenue}
        onSave={handleSave}
        isLoading={createVenue.isPending || updateVenue.isPending}
      />

      {/* Backfill Dialog */}
      <BackfillDialog
        open={backfillDialogOpen}
        onOpenChange={setBackfillDialogOpen}
        venues={venues || []}
      />
    </div>
  );
}
