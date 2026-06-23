#!/usr/bin/env node
/**
 * Des Moines AI Pulse - Stripe Products Setup Script
 * ===================================================
 *
 * This script creates the required Stripe products and prices for subscription
 * plans (monthly + annual Insider/VIP, matching the iOS SKUs and the web Pricing
 * page). It is IDEMPOTENT: products are matched by metadata.tier and prices by a
 * stable lookup_key (insider_monthly, insider_yearly, vip_monthly, vip_yearly),
 * so re-running reuses existing objects instead of creating duplicates.
 *
 * ACTION REQUIRED (one-time): run this once per Stripe account/mode, then paste
 * the printed SQL into Supabase so subscription_plans.stripe_price_id_{monthly,
 * yearly} point at the real price IDs. Annual checkout + the 7-day trial are
 * already wired in create-subscription-checkout; they just need these IDs.
 *
 * Works on Windows, Mac, and Linux with Node.js.
 *
 * Prerequisites:
 * 1. npm install stripe dotenv
 * 2. Set STRIPE_SECRET_KEY in .env or environment
 * 3. Run: node scripts/setup-stripe-products.js
 *
 * Options:
 *   --dry-run   Print what would be created without making API calls
 *   --live      Use live mode (requires sk_live_ key)
 */

const Stripe = require('stripe');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env
require('dotenv').config();

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isLive = args.includes('--live');

// Get Stripe key
const stripeKey = process.env.STRIPE_SECRET_KEY;

if (!stripeKey && !isDryRun) {
  console.error('Error: STRIPE_SECRET_KEY environment variable is required');
  console.error('Set it in .env file or export it in your shell');
  process.exit(1);
}

// Validate key matches mode
if (stripeKey && !isDryRun) {
  if (isLive && stripeKey.startsWith('sk_test_')) {
    console.error('Error: --live flag used but STRIPE_SECRET_KEY is a test key');
    process.exit(1);
  }
  if (!isLive && stripeKey.startsWith('sk_live_')) {
    console.error('Warning: Using live key without --live flag. Add --live to confirm.');
    process.exit(1);
  }
}

const stripe = isDryRun ? null : new Stripe(stripeKey, { apiVersion: '2023-10-16' });

console.log('========================================');
console.log('Des Moines AI Pulse - Stripe Setup');
console.log('========================================\n');

if (isDryRun) {
  console.log('MODE: DRY RUN (no API calls will be made)\n');
} else if (isLive) {
  console.log('MODE: LIVE (Production)\n');
  console.log('WARNING: This will create real products in your live Stripe account!\n');
} else {
  console.log('MODE: TEST (Development)\n');
}

// Store created IDs
const createdIds = {
  insiderProduct: null,
  insiderPriceMonthly: null,
  insiderPriceYearly: null,
  vipProduct: null,
  vipPriceMonthly: null,
  vipPriceYearly: null,
};

// Idempotent: reuse an existing active product with the same metadata.tier.
async function createProduct(name, description, metadata) {
  console.log(`Ensuring product: ${name}`);
  if (isDryRun) {
    console.log('  [DRY RUN] Would find-or-create product');
    return { id: 'prod_DRYRUN_' + name.replace(/\s+/g, '') };
  }
  try {
    const found = await stripe.products.search({
      query: `metadata['tier']:'${metadata.tier}' AND active:'true'`,
      limit: 1,
    });
    if (found.data.length > 0) {
      console.log(`  Reusing existing product: ${found.data[0].id}`);
      return found.data[0];
    }
  } catch (err) {
    console.log(`  (product search unavailable: ${err.message}; creating new)`);
  }
  const product = await stripe.products.create({ name, description, metadata });
  console.log(`  Created product ID: ${product.id}`);
  return product;
}

// Idempotent: reuse the active price carrying this lookup_key (prices are
// immutable in Stripe, so the lookup_key is the stable handle we re-resolve).
async function createPrice(productId, unitAmount, currency, interval, lookupKey, metadata) {
  const amount = (unitAmount / 100).toFixed(2);
  console.log(`Ensuring price: $${amount}/${interval} (${lookupKey})`);
  if (isDryRun) {
    console.log('  [DRY RUN] Would find-or-create price');
    return { id: 'price_DRYRUN_' + interval };
  }
  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  if (existing.data.length > 0) {
    console.log(`  Reusing existing price: ${existing.data[0].id}`);
    return existing.data[0];
  }
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency,
    recurring: { interval },
    lookup_key: lookupKey,
    metadata,
  });
  console.log(`  Created price ID: ${price.id}`);
  return price;
}

async function main() {
  try {
    // =====================================
    // Step 1: Create Insider Product
    // =====================================
    console.log('Step 1: Creating Insider Product');
    console.log('=================================\n');

    const insiderProduct = await createProduct(
      'Des Moines Insider',
      'For the passionate Des Moines explorer. Get unlimited favorites, early access to events, advanced filters, ad-free experience, and priority support.',
      { tier: 'insider' }
    );
    createdIds.insiderProduct = insiderProduct.id;

    const insiderMonthly = await createPrice(
      insiderProduct.id,
      499, // $4.99 in cents
      'usd',
      'month',
      'insider_monthly',
      { plan: 'insider', billing: 'monthly' }
    );
    createdIds.insiderPriceMonthly = insiderMonthly.id;

    const insiderYearly = await createPrice(
      insiderProduct.id,
      4999, // $49.99 in cents
      'usd',
      'year',
      'insider_yearly',
      { plan: 'insider', billing: 'yearly' }
    );
    createdIds.insiderPriceYearly = insiderYearly.id;

    console.log('');

    // =====================================
    // Step 2: Create VIP Product
    // =====================================
    console.log('Step 2: Creating VIP Product');
    console.log('=============================\n');

    const vipProduct = await createProduct(
      'Des Moines VIP',
      'The ultimate Des Moines experience. Get exclusive VIP events, restaurant reservation assistance, personalized recommendations, SMS alerts, monthly local business perks, and concierge support.',
      { tier: 'vip' }
    );
    createdIds.vipProduct = vipProduct.id;

    const vipMonthly = await createPrice(
      vipProduct.id,
      1299, // $12.99 in cents
      'usd',
      'month',
      'vip_monthly',
      { plan: 'vip', billing: 'monthly' }
    );
    createdIds.vipPriceMonthly = vipMonthly.id;

    const vipYearly = await createPrice(
      vipProduct.id,
      12999, // $129.99 in cents
      'usd',
      'year',
      'vip_yearly',
      { plan: 'vip', billing: 'yearly' }
    );
    createdIds.vipPriceYearly = vipYearly.id;

    console.log('');

    // =====================================
    // Summary
    // =====================================
    console.log('========================================');
    console.log('Setup Complete!');
    console.log('========================================\n');

    console.log('Created Products and Prices:\n');

    console.log('INSIDER PLAN:');
    console.log(`  Product ID: ${createdIds.insiderProduct}`);
    console.log(`  Monthly Price ID: ${createdIds.insiderPriceMonthly}`);
    console.log(`  Yearly Price ID: ${createdIds.insiderPriceYearly}`);
    console.log('');

    console.log('VIP PLAN:');
    console.log(`  Product ID: ${createdIds.vipProduct}`);
    console.log(`  Monthly Price ID: ${createdIds.vipPriceMonthly}`);
    console.log(`  Yearly Price ID: ${createdIds.vipPriceYearly}`);
    console.log('');

    // Generate SQL to update database
    console.log('========================================');
    console.log('Database Update SQL');
    console.log('========================================\n');
    console.log('Run the following SQL in your Supabase SQL Editor:\n');

    const sql = `-- Update Insider plan with Stripe price IDs
UPDATE public.subscription_plans
SET
    stripe_price_id_monthly = '${createdIds.insiderPriceMonthly}',
    stripe_price_id_yearly = '${createdIds.insiderPriceYearly}',
    updated_at = NOW()
WHERE name = 'insider';

-- Update VIP plan with Stripe price IDs
UPDATE public.subscription_plans
SET
    stripe_price_id_monthly = '${createdIds.vipPriceMonthly}',
    stripe_price_id_yearly = '${createdIds.vipPriceYearly}',
    updated_at = NOW()
WHERE name = 'vip';

-- Verify the update
SELECT name, display_name, price_monthly, price_yearly,
       stripe_price_id_monthly, stripe_price_id_yearly
FROM public.subscription_plans
ORDER BY sort_order;`;

    console.log(sql);
    console.log('');

    // Save SQL to file
    const sqlPath = path.join(__dirname, 'update-stripe-price-ids.sql');
    fs.writeFileSync(sqlPath, sql, 'utf8');
    console.log(`SQL saved to: ${sqlPath}\n`);

    // Save IDs to JSON for programmatic use
    const jsonPath = path.join(__dirname, 'stripe-product-ids.json');
    fs.writeFileSync(jsonPath, JSON.stringify(createdIds, null, 2), 'utf8');
    console.log(`IDs saved to: ${jsonPath}\n`);

    // Supabase secrets reminder
    console.log('========================================');
    console.log('Supabase Secrets (if not already set)');
    console.log('========================================\n');
    console.log('Make sure these Supabase secrets are configured:\n');
    console.log('supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx');
    console.log('supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx');
    console.log('');

    // Payment Links info
    console.log('========================================');
    console.log('Optional: Create Payment Links');
    console.log('========================================\n');
    console.log('You can create payment links in the Stripe Dashboard:');
    console.log('1. Go to https://dashboard.stripe.com/payment-links');
    console.log('2. Click "New payment link"');
    console.log('3. Select the product/price you want');
    console.log('4. Configure redirect URLs:');
    console.log('   - Success: https://desmoinesinsider.com/subscription/success');
    console.log('   - Cancel: https://desmoinesinsider.com/pricing?canceled=true');
    console.log('');

    console.log('Setup complete! Follow the instructions above to complete configuration.');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
