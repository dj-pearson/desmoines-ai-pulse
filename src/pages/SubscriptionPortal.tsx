import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Crown,
  Sparkles,
  CreditCard,
  Receipt,
  FileText,
  Download,
  ExternalLink,
  Calendar,
  Check,
  AlertCircle,
  RefreshCw,
  Printer,
  Eye,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePayments } from "@/hooks/usePayments";
import { useSubscription } from "@/hooks/useSubscription";
import { format } from "date-fns";
import { toast } from "sonner";

export default function SubscriptionPortal() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    payments,
    invoices,
    paymentSummary,
    subscriptionDetails,
    upcomingInvoice,
    hasActiveSubscription,
    isLoading,
    portalLoading,
    openCustomerPortal,
    cancelSubscription,
    resumeSubscription,
    viewInvoice,
    printInvoice,
    isCanceling,
    isResuming,
  } = usePayments();
  const { tier, isPremium, subscription, plans, startCheckout, checkoutLoading } =
    useSubscription();
  const [activeTab, setActiveTab] = useState("overview");

  const formatCurrency = (amount: number, currency = "usd") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
    > = {
      active: { variant: "default", label: "Active" },
      trialing: { variant: "secondary", label: "Trial" },
      past_due: { variant: "destructive", label: "Past Due" },
      canceled: { variant: "outline", label: "Canceled" },
      paused: { variant: "outline", label: "Paused" },
      succeeded: { variant: "default", label: "Paid" },
      pending: { variant: "secondary", label: "Pending" },
      failed: { variant: "destructive", label: "Failed" },
      refunded: { variant: "outline", label: "Refunded" },
      partially_refunded: { variant: "outline", label: "Partial Refund" },
      paid: { variant: "default", label: "Paid" },
      open: { variant: "secondary", label: "Open" },
      void: { variant: "outline", label: "Void" },
    };

    const config = statusConfig[status] || { variant: "outline", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleCancelSubscription = async () => {
    try {
      await cancelSubscription();
      toast.success("Subscription will be canceled at the end of your billing period");
    } catch {
      toast.error("Failed to cancel subscription");
    }
  };

  const handleResumeSubscription = async () => {
    try {
      await resumeSubscription();
      toast.success("Subscription has been resumed");
    } catch {
      toast.error("Failed to resume subscription");
    }
  };

  const handleViewInvoice = async (paymentId: string) => {
    try {
      await viewInvoice(paymentId);
    } catch {
      toast.error("Failed to load invoice");
    }
  };

  const handlePrintInvoice = async (paymentId: string) => {
    try {
      await printInvoice(paymentId);
    } catch {
      toast.error("Failed to print invoice");
    }
  };

  const handleManagePaymentMethods = async () => {
    const url = await openCustomerPortal();
    if (!url) {
      toast.error("Failed to open billing portal");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-48 mb-8" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b py-4 sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-card/95">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(-1)}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">Subscription & Billing</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Crown className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Billing History
            </TabsTrigger>
            <TabsTrigger value="invoices" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Invoices
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Current Plan Card */}
            <Card
              className={
                isPremium
                  ? "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-200 dark:border-amber-800"
                  : ""
              }
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-3 rounded-full ${
                        isPremium
                          ? "bg-amber-100 dark:bg-amber-900"
                          : "bg-muted"
                      }`}
                    >
                      {tier === "vip" ? (
                        <Crown className="h-6 w-6 text-purple-500" />
                      ) : tier === "insider" ? (
                        <Sparkles className="h-6 w-6 text-amber-500" />
                      ) : (
                        <CreditCard className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-xl">
                        {tier === "vip"
                          ? "VIP Member"
                          : tier === "insider"
                            ? "Insider Member"
                            : "Free Plan"}
                      </CardTitle>
                      <CardDescription>
                        {isPremium
                          ? `Your plan renews on ${
                              subscription?.current_period_end
                                ? format(
                                    new Date(subscription.current_period_end),
                                    "MMMM d, yyyy"
                                  )
                                : "soon"
                            }`
                          : "Upgrade to unlock premium features"}
                      </CardDescription>
                    </div>
                  </div>
                  {subscription?.cancel_at_period_end && (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Canceling
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isPremium && subscription && (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="p-4 bg-background/50 rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">
                        Current Period
                      </div>
                      <div className="font-medium">
                        {format(
                          new Date(subscription.current_period_start),
                          "MMM d"
                        )}{" "}
                        -{" "}
                        {format(
                          new Date(subscription.current_period_end),
                          "MMM d, yyyy"
                        )}
                      </div>
                    </div>
                    <div className="p-4 bg-background/50 rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">
                        Status
                      </div>
                      <div className="font-medium flex items-center gap-2">
                        {getStatusBadge(subscription.status)}
                      </div>
                    </div>
                    {upcomingInvoice && (
                      <div className="p-4 bg-background/50 rounded-lg">
                        <div className="text-sm text-muted-foreground mb-1">
                          Next Payment
                        </div>
                        <div className="font-medium">
                          {formatCurrency(
                            upcomingInvoice.amount,
                            upcomingInvoice.currency
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!isPremium && (
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      You&apos;re on the free plan. Upgrade to get unlimited
                      favorites, early access to events, and more.
                    </p>
                    <div className="flex gap-4">
                      {plans
                        .filter((p) => p.name !== "free")
                        .map((plan) => (
                          <Card key={plan.id} className="flex-1">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-lg">
                                {plan.display_name}
                              </CardTitle>
                              <CardDescription>
                                {formatCurrency(plan.price_monthly)}/month
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="pb-4">
                              <Button
                                onClick={() => startCheckout(plan.id)}
                                disabled={checkoutLoading}
                                className="w-full"
                                variant={
                                  plan.name === "vip" ? "default" : "outline"
                                }
                              >
                                Upgrade to {plan.display_name}
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
              {isPremium && (
                <CardFooter className="flex gap-4 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={handleManagePaymentMethods}
                    disabled={portalLoading}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    {portalLoading ? "Opening..." : "Manage Payment Method"}
                  </Button>
                  {subscription?.cancel_at_period_end ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" disabled={isResuming}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          {isResuming ? "Resuming..." : "Resume Subscription"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Resume your subscription?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Your subscription will continue and you&apos;ll be
                            billed normally on{" "}
                            {subscription?.current_period_end
                              ? format(
                                  new Date(subscription.current_period_end),
                                  "MMMM d, yyyy"
                                )
                              : "your next billing date"}
                            .
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleResumeSubscription}>
                            Resume Subscription
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" className="text-destructive">
                          Cancel Subscription
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Cancel your subscription?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Your subscription will remain active until{" "}
                            {subscription?.current_period_end
                              ? format(
                                  new Date(subscription.current_period_end),
                                  "MMMM d, yyyy"
                                )
                              : "the end of your billing period"}
                            . You can resume anytime before then.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleCancelSubscription}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {isCanceling ? "Canceling..." : "Yes, Cancel"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <Button variant="ghost" asChild>
                    <Link to="/pricing">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View All Plans
                    </Link>
                  </Button>
                </CardFooter>
              )}
            </Card>

            {/* Payment Summary */}
            {paymentSummary && paymentSummary.payment_count > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Payment Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">
                        Total Spent
                      </div>
                      <div className="text-2xl font-bold">
                        {formatCurrency(paymentSummary.total_spent)}
                      </div>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">
                        Payments
                      </div>
                      <div className="text-2xl font-bold">
                        {paymentSummary.payment_count}
                      </div>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">
                        Subscriptions
                      </div>
                      <div className="text-2xl font-bold">
                        {formatCurrency(paymentSummary.subscription_payments)}
                      </div>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">
                        Campaigns
                      </div>
                      <div className="text-2xl font-bold">
                        {formatCurrency(paymentSummary.campaign_payments)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Features */}
            {isPremium && subscription?.plan && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Your Features</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(subscriptionDetails?.plan?.features || []).map(
                      (feature, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Check className="h-4 w-4 text-green-500" />
                          {feature}
                        </div>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Billing History Tab */}
          <TabsContent value="billing">
            <Card>
              <CardHeader>
                <CardTitle>Billing History</CardTitle>
                <CardDescription>
                  View all your past payments and transactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No payments yet</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>
                            {format(new Date(payment.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            {payment.description ||
                              (payment.payment_type === "subscription"
                                ? "Subscription Payment"
                                : payment.payment_type === "campaign"
                                  ? "Campaign Payment"
                                  : "Payment")}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {payment.payment_type}
                            </Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(payment.status)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(payment.amount, payment.currency)}
                            {payment.refunded_amount > 0 && (
                              <span className="text-sm text-muted-foreground ml-2">
                                (-{formatCurrency(payment.refunded_amount)})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewInvoice(payment.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handlePrintInvoice(payment.id)}
                              >
                                <Printer className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
                <CardDescription>
                  Download invoices for your records
                </CardDescription>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No invoices yet</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-mono">
                            {invoice.invoice_number}
                          </TableCell>
                          <TableCell>
                            {format(new Date(invoice.invoice_date), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(invoice.total, invoice.currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {invoice.pdf_url ? (
                                <Button variant="ghost" size="sm" asChild>
                                  <a
                                    href={invoice.pdf_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Download className="h-4 w-4" />
                                  </a>
                                </Button>
                              ) : (
                                invoice.payment_id && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        handleViewInvoice(invoice.payment_id!)
                                      }
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        handlePrintInvoice(invoice.payment_id!)
                                      }
                                    >
                                      <Printer className="h-4 w-4" />
                                    </Button>
                                  </>
                                )
                              )}
                            </div>
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
    </div>
  );
}
