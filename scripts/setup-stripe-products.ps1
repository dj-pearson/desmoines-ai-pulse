# Des Moines AI Pulse - Stripe Products Setup Script
# ================================================
# This script creates the required Stripe products and prices for subscription plans.
# Run this script in PowerShell on Windows with the Stripe CLI installed.
#
# Prerequisites:
# 1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
# 2. Login to Stripe CLI: stripe login
# 3. Run this script: .\setup-stripe-products.ps1
#
# For test mode (default): stripe login
# For live mode: stripe login --live

param(
    [switch]$Live,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Des Moines AI Pulse - Stripe Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($Live) {
    Write-Host "MODE: LIVE (Production)" -ForegroundColor Red
    Write-Host "WARNING: This will create real products in your live Stripe account!" -ForegroundColor Red
    $confirm = Read-Host "Are you sure you want to continue? (yes/no)"
    if ($confirm -ne "yes") {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 0
    }
} else {
    Write-Host "MODE: TEST (Development)" -ForegroundColor Green
}

if ($DryRun) {
    Write-Host "DRY RUN: Commands will be printed but not executed" -ForegroundColor Yellow
    Write-Host ""
}

# Function to run Stripe CLI commands
function Invoke-StripeCommand {
    param([string]$Command)

    if ($DryRun) {
        Write-Host "  [DRY RUN] stripe $Command" -ForegroundColor Gray
        return $null
    }

    $result = Invoke-Expression "stripe $Command 2>&1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error executing: stripe $Command" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        throw "Stripe command failed"
    }
    return $result
}

# Function to extract ID from Stripe JSON response
function Get-StripeId {
    param([string]$Response)

    if ($Response -match '"id":\s*"([^"]+)"') {
        return $matches[1]
    }
    return $null
}

# Store created IDs
$createdIds = @{
    InsiderProduct = $null
    InsiderPriceMonthly = $null
    InsiderPriceYearly = $null
    VIPProduct = $null
    VIPPriceMonthly = $null
    VIPPriceYearly = $null
}

Write-Host ""
Write-Host "Step 1: Creating Insider Product" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow

# Create Insider product
$insiderProductCmd = 'products create --name="Des Moines Insider" --description="For the passionate Des Moines explorer. Get unlimited favorites, early access to events, advanced filters, ad-free experience, and priority support." --metadata[tier]=insider'
Write-Host "Creating product: Des Moines Insider"
$insiderProductResult = Invoke-StripeCommand $insiderProductCmd
$createdIds.InsiderProduct = Get-StripeId $insiderProductResult
Write-Host "  Product ID: $($createdIds.InsiderProduct)" -ForegroundColor Green

# Create Insider monthly price
$insiderMonthlyCmd = "prices create --product=$($createdIds.InsiderProduct) --unit-amount=499 --currency=usd --recurring[interval]=month --metadata[plan]=insider --metadata[billing]=monthly"
Write-Host "Creating price: Insider Monthly ($4.99/month)"
$insiderMonthlyResult = Invoke-StripeCommand $insiderMonthlyCmd
$createdIds.InsiderPriceMonthly = Get-StripeId $insiderMonthlyResult
Write-Host "  Price ID: $($createdIds.InsiderPriceMonthly)" -ForegroundColor Green

# Create Insider yearly price
$insiderYearlyCmd = "prices create --product=$($createdIds.InsiderProduct) --unit-amount=4999 --currency=usd --recurring[interval]=year --metadata[plan]=insider --metadata[billing]=yearly"
Write-Host "Creating price: Insider Yearly ($49.99/year)"
$insiderYearlyResult = Invoke-StripeCommand $insiderYearlyCmd
$createdIds.InsiderPriceYearly = Get-StripeId $insiderYearlyResult
Write-Host "  Price ID: $($createdIds.InsiderPriceYearly)" -ForegroundColor Green

Write-Host ""
Write-Host "Step 2: Creating VIP Product" -ForegroundColor Yellow
Write-Host "=============================" -ForegroundColor Yellow

# Create VIP product
$vipProductCmd = 'products create --name="Des Moines VIP" --description="The ultimate Des Moines experience. Get exclusive VIP events, restaurant reservation assistance, personalized recommendations, SMS alerts, monthly local business perks, and concierge support." --metadata[tier]=vip'
Write-Host "Creating product: Des Moines VIP"
$vipProductResult = Invoke-StripeCommand $vipProductCmd
$createdIds.VIPProduct = Get-StripeId $vipProductResult
Write-Host "  Product ID: $($createdIds.VIPProduct)" -ForegroundColor Green

# Create VIP monthly price
$vipMonthlyCmd = "prices create --product=$($createdIds.VIPProduct) --unit-amount=1299 --currency=usd --recurring[interval]=month --metadata[plan]=vip --metadata[billing]=monthly"
Write-Host "Creating price: VIP Monthly ($12.99/month)"
$vipMonthlyResult = Invoke-StripeCommand $vipMonthlyCmd
$createdIds.VIPPriceMonthly = Get-StripeId $vipMonthlyResult
Write-Host "  Price ID: $($createdIds.VIPPriceMonthly)" -ForegroundColor Green

# Create VIP yearly price
$vipYearlyCmd = "prices create --product=$($createdIds.VIPProduct) --unit-amount=12999 --currency=usd --recurring[interval]=year --metadata[plan]=vip --metadata[billing]=yearly"
Write-Host "Creating price: VIP Yearly ($129.99/year)"
$vipYearlyResult = Invoke-StripeCommand $vipYearlyCmd
$createdIds.VIPPriceYearly = Get-StripeId $vipYearlyResult
Write-Host "  Price ID: $($createdIds.VIPPriceYearly)" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Output summary
Write-Host "Created Products and Prices:" -ForegroundColor Yellow
Write-Host ""
Write-Host "INSIDER PLAN:" -ForegroundColor White
Write-Host "  Product ID: $($createdIds.InsiderProduct)"
Write-Host "  Monthly Price ID: $($createdIds.InsiderPriceMonthly)"
Write-Host "  Yearly Price ID: $($createdIds.InsiderPriceYearly)"
Write-Host ""
Write-Host "VIP PLAN:" -ForegroundColor White
Write-Host "  Product ID: $($createdIds.VIPProduct)"
Write-Host "  Monthly Price ID: $($createdIds.VIPPriceMonthly)"
Write-Host "  Yearly Price ID: $($createdIds.VIPPriceYearly)"
Write-Host ""

# Generate SQL to update database
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Database Update SQL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Run the following SQL in your Supabase SQL Editor:" -ForegroundColor Yellow
Write-Host ""

$sql = @"
-- Update Insider plan with Stripe price IDs
UPDATE public.subscription_plans
SET
    stripe_price_id_monthly = '$($createdIds.InsiderPriceMonthly)',
    stripe_price_id_yearly = '$($createdIds.InsiderPriceYearly)',
    updated_at = NOW()
WHERE name = 'insider';

-- Update VIP plan with Stripe price IDs
UPDATE public.subscription_plans
SET
    stripe_price_id_monthly = '$($createdIds.VIPPriceMonthly)',
    stripe_price_id_yearly = '$($createdIds.VIPPriceYearly)',
    updated_at = NOW()
WHERE name = 'vip';

-- Verify the update
SELECT name, display_name, price_monthly, price_yearly,
       stripe_price_id_monthly, stripe_price_id_yearly
FROM public.subscription_plans
ORDER BY sort_order;
"@

Write-Host $sql -ForegroundColor Cyan
Write-Host ""

# Save SQL to file
$sqlFile = Join-Path $PSScriptRoot "update-stripe-price-ids.sql"
$sql | Out-File -FilePath $sqlFile -Encoding UTF8
Write-Host "SQL saved to: $sqlFile" -ForegroundColor Green
Write-Host ""

# Generate environment variable update commands
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Supabase Secrets (if not already set)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Make sure these Supabase secrets are configured:" -ForegroundColor Yellow
Write-Host ""
Write-Host "supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx" -ForegroundColor Gray
Write-Host "supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx" -ForegroundColor Gray
Write-Host ""

# Generate Payment Links (optional)
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Optional: Create Payment Links" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can create payment links in the Stripe Dashboard:" -ForegroundColor Yellow
Write-Host "1. Go to https://dashboard.stripe.com/payment-links" -ForegroundColor White
Write-Host "2. Click 'New payment link'" -ForegroundColor White
Write-Host "3. Select the product/price you want" -ForegroundColor White
Write-Host "4. Configure redirect URLs:" -ForegroundColor White
Write-Host "   - Success: https://desmoinesinsider.com/subscription/success" -ForegroundColor Gray
Write-Host "   - Cancel: https://desmoinesinsider.com/pricing?canceled=true" -ForegroundColor Gray
Write-Host ""

Write-Host "Setup complete! Follow the instructions above to complete configuration." -ForegroundColor Green
