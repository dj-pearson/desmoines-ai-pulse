import { useState } from "react";
import { useTabState } from "@/hooks/useTabState";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, RefreshCw, DollarSign, AlertCircle, CheckCircle, Search, Filter, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Download } from "lucide-react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

// ADMIN-REFUND-001: structured taxonomy for finance reporting.
const REFUND_REASON_OPTIONS = [
  { value: "duplicate_charge", label: "Duplicate charge" },
  { value: "user_request", label: "User request" },
  { value: "campaign_cancelled", label: "Campaign cancelled" },
  { value: "fraud", label: "Fraud" },
  { value: "technical_issue", label: "Technical issue" },
  { value: "content_takedown", label: "Content takedown" },
  { value: "accidental_purchase", label: "Accidental purchase" },
  { value: "other", label: "Other" },
] as const;

type RefundReason = (typeof REFUND_REASON_OPTIONS)[number]["value"];

/**
 * A row process-stripe-refund wrote. Its status is "completed" when Stripe
 * answered succeeded and "pending" while the refund settles; there is no
 * approval step, because the refund is made in the same call that records it.
 */
interface Refund {
  id: string;
  campaign_id: string | null;
  admin_user_id: string | null;
  amount: number;
  reason: string | null;
  refund_reason: RefundReason | null;
  refund_reason_notes: string | null;
  status: string;
  stripe_refund_id: string | null;
  processed_at: string | null;
  created_at: string;
  campaign?: {
    id: string;
    name: string;
    total_cost: number;
    user_id: string;
  };
}

/**
 * A paid campaign that may still have money to return.
 *
 * Read from campaigns, not payments: payments is not in production, so this
 * tab listed nothing, and its request sent an id the function never reads.
 * `paid` is amount_paid_cents when the webhook recorded it (20261003000001),
 * otherwise the list price. Either way it is an estimate for the dialog;
 * process-stripe-refund caps the amount against the Stripe charge itself.
 */
interface RefundableCampaign {
  id: string;
  name: string;
  status: string;
  created_at: string;
  paid: number;
  paidIsListPrice: boolean;
  refunded: number;
}

interface CampaignRefundRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  total_cost: number | null;
  amount_paid_cents?: number | null;
  refunds: Array<{ amount: number | null; status: string | null }> | null;
}

/** Statuses with no money taken, or nothing left to give back. */
const NOT_REFUNDABLE = "(draft,pending_payment,refunded)";

async function fetchRefundableCampaigns(search: string): Promise<RefundableCampaign[]> {
  const run = (withPaid: boolean) => {
    const columns = withPaid
      ? "id, name, status, created_at, total_cost, amount_paid_cents, refunds(amount, status)"
      : "id, name, status, created_at, total_cost, refunds(amount, status)";
    let query = supabase
      .from("campaigns")
      .select(columns)
      .not("stripe_payment_intent_id", "is", null)
      .not("status", "in", NOT_REFUNDABLE)
      .order("created_at", { ascending: false })
      .limit(50);
    const term = search.trim();
    if (term) query = query.ilike("name", `%${term}%`);
    return query;
  };

  let { data, error } = await run(true);
  // 42703 until 20261003000001 is applied: list at the list price instead.
  if (error?.code === "42703") ({ data, error } = await run(false));
  if (error) throw error;

  return ((data ?? []) as unknown as CampaignRefundRow[])
    .map((row) => {
      const recorded = row.amount_paid_cents;
      const paid = typeof recorded === "number" ? recorded / 100 : Number(row.total_cost ?? 0);
      const refunded = (row.refunds ?? [])
        .filter((r) => r.status !== "failed")
        .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        created_at: row.created_at,
        paid,
        paidIsListPrice: typeof recorded !== "number",
        refunded,
      };
    })
    .filter((c) => c.paid - c.refunded > 0.005);
}

export default function AdminRefunds() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useDocumentTitle("Refund Management");
  const [activeTab, setActiveTab] = useTabState("refunds", {
    validTabs: ["refunds", "new-refund"],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "completed" | "failed">("all");
  const [selectedCampaign, setSelectedCampaign] = useState<RefundableCampaign | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  // ADMIN-REFUND-001: required structured taxonomy alongside free-text reason.
  const [refundReasonCategory, setRefundReasonCategory] = useState<RefundReason | "">("");
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);

  // Fetch refunds
  const { data: refunds = [], isLoading: refundsLoading } = useQuery({
    queryKey: ["admin-refunds", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("refunds")
        .select(`
          *,
          campaign:campaigns(id, name, total_cost, user_id)
        `)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Refund[];
    },
  });

  // Paid campaigns with a balance left to refund
  const { data: refundableCampaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ["admin-refundable-campaigns", searchQuery],
    queryFn: () => fetchRefundableCampaigns(searchQuery),
  });

  // Process refund mutation. The body is the one process-stripe-refund
  // reads: campaignId and the structured refundReason are both required, and
  // this page sent neither (a payments row id instead), so every refund here
  // was a 400.
  const processRefund = useMutation({
    mutationFn: async ({
      campaignId,
      amount,
      reason,
      refundReason,
    }: {
      campaignId: string;
      amount: number;
      reason: string;
      refundReason: RefundReason;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "process-stripe-refund",
        {
          body: {
            campaignId,
            amount,
            reason,
            refundReason,
            refundReasonNotes: reason,
          },
        }
      );

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Refund processing failed");
      return data as { duplicate?: boolean; full?: boolean; amount?: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-refunds"] });
      queryClient.invalidateQueries({ queryKey: ["admin-refundable-campaigns"] });
      setIsRefundDialogOpen(false);
      setSelectedCampaign(null);
      setRefundAmount("");
      setRefundReason("");
      setRefundReasonCategory("");
      if (data?.duplicate) {
        toast.info("Stripe already had this refund; nothing new was sent.");
      } else if (data?.full) {
        toast.success("Refunded in full. The campaign has ended and the advertiser was emailed.");
      } else {
        toast.success("Partial refund issued. The campaign keeps running; the advertiser was emailed.");
      }
    },
    onError: (error) => {
      toast.error(`Failed to process refund: ${error.message}`);
    },
  });

  const formatCurrency = (amount: number, currency = "usd") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      {
        variant: "default" | "secondary" | "destructive" | "outline";
        icon: React.ReactNode;
      }
    > = {
      pending: {
        variant: "secondary",
        icon: <SpriteIcon name="clock" className="h-3 w-3 mr-1" />,
      },
      completed: {
        variant: "default",
        icon: <CheckCircle className="h-3 w-3 mr-1" />,
      },
      failed: {
        variant: "destructive",
        icon: <AlertCircle className="h-3 w-3 mr-1" />,
      },
    };

    const config = statusConfig[status] || {
      variant: "outline",
      icon: null,
    };

    return (
      <Badge variant={config.variant} className="flex items-center w-fit">
        {config.icon}
        <span className="capitalize">{status}</span>
      </Badge>
    );
  };

  const availableOf = (c: RefundableCampaign) => Math.max(0, c.paid - c.refunded);

  const handleInitiateRefund = (campaign: RefundableCampaign) => {
    setSelectedCampaign(campaign);
    setRefundAmount(availableOf(campaign).toFixed(2));
    setRefundReason("");
    setIsRefundDialogOpen(true);
  };

  const handleProcessRefund = () => {
    if (!selectedCampaign) return;

    const amount = parseFloat(refundAmount);
    const maxRefundable = availableOf(selectedCampaign);

    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid refund amount");
      return;
    }

    if (amount > maxRefundable) {
      toast.error(`Maximum refundable amount is ${formatCurrency(maxRefundable)}`);
      return;
    }

    if (!refundReason.trim()) {
      toast.error("Please provide a reason for the refund");
      return;
    }
    if (!refundReasonCategory) {
      toast.error("Please pick a refund reason category");
      return;
    }

    processRefund.mutate({
      campaignId: selectedCampaign.id,
      amount,
      reason: refundReason,
      refundReason: refundReasonCategory,
    });
  };

  // Summary stats
  const stats = {
    pending: refunds.filter((r) => r.status === "pending").length,
    completed: refunds.filter((r) => r.status === "completed").length,
    totalRefunded: refunds
      .filter((r) => r.status === "completed" || r.status === "pending")
      .reduce((sum, r) => sum + Number(r.amount), 0),
  };

  // ADMIN-REFUND-001: 90-day reasons breakdown.
  const reasonsBreakdown = (() => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const counts = new Map<string, number>();
    for (const r of refunds) {
      if (new Date(r.created_at).getTime() < cutoff) continue;
      const key = r.refund_reason ?? "other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return REFUND_REASON_OPTIONS
      .map((opt) => ({
        name: opt.label,
        value: counts.get(opt.value) ?? 0,
        key: opt.value,
      }))
      .filter((row) => row.value > 0);
  })();

  const REASON_COLORS = [
    "hsl(var(--primary))",
    "#22c55e",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#06b6d4",
    "#ec4899",
    "#64748b",
  ];

  function exportCsv() {
    const header = [
      "id",
      "created_at",
      "amount",
      "status",
      "refund_reason",
      "refund_reason_notes",
      "reason",
      "campaign_id",
      "stripe_refund_id",
      "admin_user_id",
    ];
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [header.join(",")];
    for (const r of refunds) {
      lines.push(
        [
          esc(r.id),
          esc(r.created_at),
          esc(r.amount),
          esc(r.status),
          esc(r.refund_reason),
          esc(r.refund_reason_notes),
          esc(r.reason),
          esc(r.campaign_id),
          esc(r.stripe_refund_id),
          esc(r.admin_user_id),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `refunds-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${refunds.length} refunds`);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b py-4 sticky top-0 z-40">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">Refund Management</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Settling at Stripe</p>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                </div>
                <SpriteIcon name="clock" className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold">{stats.completed}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Refunded</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(stats.totalRefunded)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ADMIN-REFUND-001: 90-day reasons breakdown + CSV export */}
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                Reasons breakdown · last 90 days
              </CardTitle>
              <CardDescription>
                Sourced from the structured <code>refund_reason</code> column
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={exportCsv}
              disabled={refunds.length === 0}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            {reasonsBreakdown.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No refunds in the last 90 days.
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={reasonsBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry) => `${entry.name} (${entry.value})`}
                    >
                      {reasonsBreakdown.map((entry, idx) => (
                        <Cell
                          key={entry.key}
                          fill={REASON_COLORS[idx % REASON_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="mb-6">
            <TabsTrigger value="refunds">Refunds issued</TabsTrigger>
            <TabsTrigger value="new-refund">Issue New Refund</TabsTrigger>
          </TabsList>

          {/* Refund history. Advertiser requests arrive as support tickets
              (request_campaign_refund); every row here is a refund Stripe
              has already been asked to make. */}
          <TabsContent value="refunds">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Refunds issued</CardTitle>
                    <CardDescription>
                      Every refund sent to Stripe from this page or the API
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={statusFilter}
                      onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
                    >
                      <SelectTrigger className="w-[150px]">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Settling</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {refundsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : refunds.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <RotateCcw className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No refunds found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Stripe refund</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {refunds.map((refund) => (
                        <TableRow key={refund.id}>
                          <TableCell>
                            {format(new Date(refund.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            {refund.campaign?.name || "N/A"}
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(refund.amount)}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {refund.reason || "-"}
                          </TableCell>
                          <TableCell>{getStatusBadge(refund.status)}</TableCell>
                          <TableCell className="text-right">
                            {refund.stripe_refund_id && (
                              <span className="text-sm text-muted-foreground">
                                {refund.stripe_refund_id.slice(0, 12)}...
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* New Refund Tab */}
          <TabsContent value="new-refund">
            <Card>
              <CardHeader>
                <CardTitle>Issue New Refund</CardTitle>
                <CardDescription>
                  Paid campaigns with money left to return. Stripe checks the
                  amount against the actual charge before anything is sent.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by campaign name..."
                      aria-label="Search campaigns by name"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {campaignsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : refundableCampaigns.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No refundable campaigns found</p>
                    <p className="text-sm">
                      Only paid campaigns with a balance left can be refunded
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Refunded</TableHead>
                        <TableHead>Available</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {refundableCampaigns.map((campaign) => (
                        <TableRow key={campaign.id}>
                          <TableCell>
                            {format(new Date(campaign.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {campaign.name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {campaign.status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {formatCurrency(campaign.paid)}
                            {campaign.paidIsListPrice && (
                              <span className="block text-xs text-muted-foreground">list price</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {campaign.refunded > 0 ? formatCurrency(campaign.refunded) : "-"}
                          </TableCell>
                          <TableCell className="font-medium text-green-600">
                            {formatCurrency(availableOf(campaign))}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => handleInitiateRefund(campaign)}
                            >
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Refund
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Refund Dialog */}
      <Dialog open={isRefundDialogOpen} onOpenChange={setIsRefundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Refund</DialogTitle>
            <DialogDescription>
              A refund of the whole balance ends the campaign. A partial
              refund leaves it running. Either way the advertiser is emailed.
            </DialogDescription>
          </DialogHeader>
          {selectedCampaign && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">
                      {selectedCampaign.paidIsListPrice ? "List price:" : "Paid:"}
                    </span>
                    <p className="font-medium">
                      {formatCurrency(selectedCampaign.paid)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Already Refunded:</span>
                    <p className="font-medium">
                      {formatCurrency(selectedCampaign.refunded)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Available to Refund:</span>
                    <p className="font-medium text-green-600">
                      {formatCurrency(availableOf(selectedCampaign))}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="refundAmount">Refund Amount</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="refundAmount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={availableOf(selectedCampaign)}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="refundReasonCategory">
                  Refund reason category *
                </Label>
                <Select
                  value={refundReasonCategory}
                  onValueChange={(v) =>
                    setRefundReasonCategory(v as RefundReason)
                  }
                >
                  <SelectTrigger id="refundReasonCategory">
                    <SelectValue placeholder="Pick a category…" />
                  </SelectTrigger>
                  <SelectContent>
                    {REFUND_REASON_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Required. Used for finance reporting and the breakdown
                  chart on this page.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="refundReason">Reason / notes *</Label>
                <Textarea
                  id="refundReason"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Describe the reason for this refund..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRefundDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleProcessRefund}
              disabled={
                processRefund.isPending ||
                !refundReasonCategory ||
                !refundReason.trim()
              }
            >
              {processRefund.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Process Refund"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
