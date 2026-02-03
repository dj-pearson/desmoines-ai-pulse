import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Mail,
  Globe,
  Search,
  Building2,
  Users,
  CheckCircle2,
  XCircle,
  Navigation,
} from "lucide-react";
import {
  useKnownVenues,
  useCreateVenue,
  useUpdateVenue,
  useDeleteVenue,
  useVenueStats,
  KnownVenue,
  VenueFormData,
} from "@/hooks/useKnownVenues";

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

export default function VenuesManager() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
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
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Venue
        </Button>
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
    </div>
  );
}
