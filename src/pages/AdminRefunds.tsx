import { useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  RefreshCw,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
  Search,
  Filter,
  Plus,
  Eye,
  RotateCcw,
} from "lucide-react";
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

interface Refund {
  id: string;
  campaign_id: string | null;
  admin_user_id: string | null;
  amount: number;
  reason: string | null;
  refund_reason: RefundReason | null;
  refund_reason_notes: string | null;
  status: "pending" | "approved" | "processed" | "rejected";
  stripe_refund_id: string | null;
  processed_at: string | null;
  created_at: string;
  campaign?: {
    id: string;
    name: string;
    total_cost: number;
    user_id: string;
  };
  admin?: {
    full_name: string | null;
    username: string | null;
  };
}

interface Payment {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  payment_type: string;
  status: string;
  description: string | null;
  stripe_payment_intent_id: string | null;
  refunded_amount: number;
  created_at: string;
  paid_at: string | null;
}

export default function AdminRefunds() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useDocumentTitle("Refund Management");
  const [activeTab, setActiveTab] = useState("refunds");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  // ADMIN-REFUND-001: required structured taxonomy alongside free-text reason.
  const [refundReasonCategory, setRefundReasonCategory] = useState<RefundReason | "">("");
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState<Refund | null>(null);

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

  // Fetch eligible payments for refund
  const { data: eligiblePayments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["admin-refund-eligible-payments", searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("payments")
        .select("*")
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(50);

      if (searchQuery) {
        query = query.or(
          `stripe_payment_intent_id.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as Payment[]).filter(
        (p) => p.amount - (p.refunded_amount || 0) > 0
      );
    },
  });

  // Process refund mutation
  const processRefund = useMutation({
    mutationFn: async ({
      paymentId,
      amount,
      reason,
      refundReason,
      refundReasonNotes,
    }: {
      paymentId: string;
      amount: number;
      reason: string;
      refundReason: RefundReason;
      refundReasonNotes?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "process-stripe-refund",
        {
          body: {
            paymentId,
            amount,
            reason,
            refundReason,
            refundReasonNotes,
          },
        }
      );

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-refunds"] });
      queryClient.invalidateQueries({ queryKey: ["admin-refund-eligible-payments"] });
      setIsRefundDialogOpen(false);
      setSelectedPayment(null);
      setRefundAmount("");
      setRefundReason("");
      setRefundReasonCategory("");
      toast.success("Refund processed successfully");
    },
    onError: (error) => {
      toast.error(`Failed to process refund: ${error.message}`);
    },
  });

  // Approve pending refund
  const approveRefund = useMutation({
    mutationFn: async (refundId: string) => {
      const { error } = await supabase
        .from("refunds")
        .update({ status: "approved" })
        .eq("id", refundId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-refunds"] });
      toast.success("Refund approved");
    },
  });

  // Reject pending refund
  const rejectRefund = useMutation({
    mutationFn: async (refundId: string) => {
      const { error } = await supabase
        .from("refunds")
        .update({ status: "rejected" })
        .eq("id", refundId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-refunds"] });
      toast.success("Refund rejected");
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
        icon: <Clock className="h-3 w-3 mr-1" />,
      },
      approved: {
        variant: "default",
        icon: <CheckCircle className="h-3 w-3 mr-1" />,
      },
      processed: {
        variant: "default",
        icon: <CheckCircle className="h-3 w-3 mr-1" />,
      },
      rejected: {
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

  const handleInitiateRefund = (payment: Payment) => {
    setSelectedPayment(payment);
    setRefundAmount(
      String(payment.amount - (payment.refunded_amount || 0))
    );
    setRefundReason("");
    setIsRefundDialogOpen(true);
  };

  const handleProcessRefund = () => {
    if (!selectedPayment) return;

    const amount = parseFloat(refundAmount);
    const maxRefundable =
      selectedPayment.amount - (selectedPayment.refunded_amount || 0);

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
      paymentId: selectedPayment.id,
      amount,
      reason: refundReason,
      refundReason: refundReasonCategory,
      refundReasonNotes: refundReason,
    });
  };

  // Summary stats
  const stats = {
    pending: refunds.filter((r) => r.status === "pending").length,
    approved: refunds.filter((r) => r.status === "approved").length,
    processed: refunds.filter((r) => r.status === "processed").length,
    totalRefunded: refunds
      .filter((r) => r.status === "processed")
      .reduce((sum, r) => sum + r.amount, 0),
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
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Approved</p>
                  <p className="text-2xl font-bold">{stats.approved}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Processed</p>
                  <p className="text-2xl font-bold">{stats.processed}</p>
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
            <TabsTrigger value="refunds">Refund Requests</TabsTrigger>
            <TabsTrigger value="new-refund">Issue New Refund</TabsTrigger>
          </TabsList>

          {/* Refund Requests Tab */}
          <TabsContent value="refunds">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Refund Requests</CardTitle>
                    <CardDescription>
                      Review and process refund requests
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={statusFilter}
                      onValueChange={setStatusFilter}
                    >
                      <SelectTrigger className="w-[150px]">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="processed">Processed</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
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
                    <p>No refund requests found</p>
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
                        <TableHead className="text-right">Actions</TableHead>
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
                            {refund.status === "pending" && (
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => approveRefund.mutate(refund.id)}
                                  disabled={approveRefund.isPending}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => rejectRefund.mutate(refund.id)}
                                  disabled={rejectRefund.isPending}
                                >
                                  Reject
                                </Button>
                              </div>
                            )}
                            {refund.status === "approved" && (
                              <Button
                                size="sm"
                                onClick={() => setConfirmRefund(refund)}
                              >
                                Process Refund
                              </Button>
                            )}
                            {refund.status === "processed" && (
                              <span className="text-sm text-muted-foreground">
                                {refund.stripe_refund_id?.slice(0, 12)}...
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
                  Search for a payment and issue a refund
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by payment ID or description..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {paymentsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : eligiblePayments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No eligible payments found</p>
                    <p className="text-sm">
                      Only succeeded payments with remaining balance can be refunded
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Refunded</TableHead>
                        <TableHead>Available</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eligiblePayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>
                            {format(new Date(payment.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {payment.description || payment.stripe_payment_intent_id?.slice(0, 15) || "Payment"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {payment.payment_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {formatCurrency(payment.amount, payment.currency)}
                          </TableCell>
                          <TableCell>
                            {payment.refunded_amount > 0
                              ? formatCurrency(payment.refunded_amount)
                              : "-"}
                          </TableCell>
                          <TableCell className="font-medium text-green-600">
                            {formatCurrency(
                              payment.amount - (payment.refunded_amount || 0),
                              payment.currency
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => handleInitiateRefund(payment)}
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
              Process a refund for this payment
            </DialogDescription>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Original Amount:</span>
                    <p className="font-medium">
                      {formatCurrency(selectedPayment.amount)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Already Refunded:</span>
                    <p className="font-medium">
                      {formatCurrency(selectedPayment.refunded_amount || 0)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Available to Refund:</span>
                    <p className="font-medium text-green-600">
                      {formatCurrency(
                        selectedPayment.amount -
                          (selectedPayment.refunded_amount || 0)
                      )}
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
                    max={
                      selectedPayment.amount -
                      (selectedPayment.refunded_amount || 0)
                    }
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

      {/* Confirm Refund Dialog for approved refunds */}
      <AlertDialog
        open={!!confirmRefund}
        onOpenChange={() => setConfirmRefund(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Process Approved Refund?</AlertDialogTitle>
            <AlertDialogDescription>
              This will process a refund of{" "}
              <strong>{confirmRefund && formatCurrency(confirmRefund.amount)}</strong>{" "}
              to the customer. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRefund?.campaign_id) {
                  // For campaign refunds, use the existing process-stripe-refund function
                  supabase.functions
                    .invoke("process-stripe-refund", {
                      body: {
                        campaignId: confirmRefund.campaign_id,
                        amount: confirmRefund.amount,
                        reason: confirmRefund.reason || "Approved refund",
                      },
                    })
                    .then(() => {
                      queryClient.invalidateQueries({
                        queryKey: ["admin-refunds"],
                      });
                      toast.success("Refund processed successfully");
                    })
                    .catch((error) => {
                      toast.error(`Failed to process refund: ${error.message}`);
                    });
                }
                setConfirmRefund(null);
              }}
            >
              Process Refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
