import Stripe from 'stripe';
import { env } from 'cloudflare:workers';
import { billingConfig, type BillingEnv } from './core';

export const billingEnv = () => env as unknown as BillingEnv;
export function stripeClient() {
  const config = billingEnv();
  billingConfig(config);
  return new Stripe(config.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 1,
    timeout: 10000,
  });
}
