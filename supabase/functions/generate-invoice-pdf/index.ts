/**
 * Generate Invoice PDF Edge Function
 *
 * Generates a PDF invoice for a payment and stores it in Supabase Storage.
 * Uses HTML-to-PDF approach for clean invoice generation.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Company details for invoice
const COMPANY_INFO = {
  name: "Des Moines Insider LLC",
  address: "Des Moines, IA",
  email: "billing@desmoinespulse.com",
  website: "https://desmoinespulse.com",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get the authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request
    const { invoiceId, paymentId, format = "html" } = await req.json();

    if (!invoiceId && !paymentId) {
      return new Response(
        JSON.stringify({ error: "invoiceId or paymentId required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get invoice data
    let invoice;
    if (invoiceId) {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, payment:payments(*)")
        .eq("id", invoiceId)
        .eq("user_id", user.id)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Invoice not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      invoice = data;
    } else {
      // Find or create invoice from payment
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId)
        .eq("user_id", user.id)
        .single();

      if (paymentError || !payment) {
        return new Response(
          JSON.stringify({ error: "Payment not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check if invoice exists
      const { data: existingInvoice } = await supabase
        .from("invoices")
        .select("*")
        .eq("payment_id", paymentId)
        .single();

      if (existingInvoice) {
        invoice = existingInvoice;
      } else {
        // Create new invoice
        const { data: invoiceNumber } = await supabase.rpc(
          "generate_invoice_number"
        );

        // Get user profile for billing info
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", user.id)
          .single();

        const newInvoice = {
          user_id: user.id,
          payment_id: paymentId,
          invoice_number: invoiceNumber,
          stripe_invoice_id: payment.stripe_invoice_id,
          status: payment.status === "succeeded" ? "paid" : "open",
          subtotal: payment.amount,
          tax: 0,
          total: payment.amount,
          currency: payment.currency || "usd",
          customer_name: profile?.full_name || profile?.username || user.email,
          customer_email: user.email,
          line_items: [
            {
              description: payment.description || getPaymentDescription(payment),
              quantity: 1,
              unit_price: payment.amount,
              amount: payment.amount,
            },
          ],
          invoice_date: new Date().toISOString().split("T")[0],
          paid_at: payment.paid_at,
        };

        const { data: createdInvoice, error: createError } = await supabase
          .from("invoices")
          .insert(newInvoice)
          .select()
          .single();

        if (createError) {
          console.error("Failed to create invoice:", createError);
          return new Response(
            JSON.stringify({ error: "Failed to create invoice" }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        invoice = createdInvoice;
      }
    }

    // Generate invoice HTML
    const html = generateInvoiceHTML(invoice, user);

    if (format === "html") {
      return new Response(html, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    // Return invoice data for client-side PDF generation
    return new Response(
      JSON.stringify({
        invoice,
        html,
        downloadUrl: invoice.pdf_url,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Generate invoice error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function getPaymentDescription(payment: { payment_type: string; description?: string }): string {
  switch (payment.payment_type) {
    case "subscription":
      return "Des Moines Insider Subscription";
    case "campaign":
      return "Advertising Campaign";
    default:
      return payment.description || "Payment";
  }
}

function generateInvoiceHTML(invoice: Record<string, unknown>, user: { email?: string }): string {
  const lineItems = (invoice.line_items as Array<{
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }>) || [];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: ((invoice.currency as string) || "usd").toUpperCase(),
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.5;
      color: #1a1a1a;
      background: #f5f5f5;
      padding: 40px;
    }
    .invoice {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-radius: 8px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #f0f0f0;
    }
    .company-info h1 {
      font-size: 24px;
      font-weight: 700;
      color: #0066cc;
      margin-bottom: 8px;
    }
    .company-info p {
      color: #666;
      font-size: 14px;
    }
    .invoice-meta {
      text-align: right;
    }
    .invoice-meta h2 {
      font-size: 28px;
      font-weight: 700;
      color: #333;
      margin-bottom: 8px;
    }
    .invoice-meta p {
      color: #666;
      font-size: 14px;
    }
    .status {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      margin-top: 8px;
    }
    .status-paid {
      background: #dcfce7;
      color: #166534;
    }
    .status-open {
      background: #fef3c7;
      color: #92400e;
    }
    .billing-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 40px;
    }
    .billing-section h3 {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 8px;
    }
    .billing-section p {
      color: #333;
      font-size: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    thead {
      background: #f9fafb;
    }
    th {
      text-align: left;
      padding: 12px 16px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: #666;
      border-bottom: 2px solid #e5e7eb;
    }
    th:last-child {
      text-align: right;
    }
    td {
      padding: 16px;
      border-bottom: 1px solid #f0f0f0;
      font-size: 14px;
    }
    td:last-child {
      text-align: right;
      font-weight: 500;
    }
    .totals {
      margin-left: auto;
      width: 280px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
    }
    .totals-row.total {
      border-top: 2px solid #e5e7eb;
      padding-top: 16px;
      margin-top: 8px;
      font-size: 18px;
      font-weight: 700;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #f0f0f0;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
    @media print {
      body {
        background: white;
        padding: 0;
      }
      .invoice {
        box-shadow: none;
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="company-info">
        <h1>${COMPANY_INFO.name}</h1>
        <p>${COMPANY_INFO.address}</p>
        <p>${COMPANY_INFO.email}</p>
        <p>${COMPANY_INFO.website}</p>
      </div>
      <div class="invoice-meta">
        <h2>INVOICE</h2>
        <p><strong>${invoice.invoice_number}</strong></p>
        <p>Date: ${formatDate(invoice.invoice_date as string)}</p>
        ${invoice.due_date ? `<p>Due: ${formatDate(invoice.due_date as string)}</p>` : ""}
        <span class="status status-${invoice.status}">${invoice.status}</span>
      </div>
    </div>

    <div class="billing-info">
      <div class="billing-section">
        <h3>Bill To</h3>
        <p><strong>${invoice.customer_name || "Customer"}</strong></p>
        <p>${invoice.customer_email || user.email || ""}</p>
      </div>
      <div class="billing-section">
        <h3>Payment Details</h3>
        <p>Currency: ${((invoice.currency as string) || "USD").toUpperCase()}</p>
        ${invoice.paid_at ? `<p>Paid: ${formatDate(invoice.paid_at as string)}</p>` : ""}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Unit Price</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItems
          .map(
            (item) => `
          <tr>
            <td>${item.description}</td>
            <td style="text-align: center;">${item.quantity}</td>
            <td style="text-align: right;">${formatCurrency(item.unit_price)}</td>
            <td>${formatCurrency(item.amount)}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>${formatCurrency(invoice.subtotal as number)}</span>
      </div>
      ${
        (invoice.tax as number) > 0
          ? `
      <div class="totals-row">
        <span>Tax</span>
        <span>${formatCurrency(invoice.tax as number)}</span>
      </div>
      `
          : ""
      }
      <div class="totals-row total">
        <span>Total</span>
        <span>${formatCurrency(invoice.total as number)}</span>
      </div>
    </div>

    <div class="footer">
      <p>Thank you for your business!</p>
      <p>Questions? Contact us at ${COMPANY_INFO.email}</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
