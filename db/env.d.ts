declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AUTH_ORIGIN: string;
    AUTH_SECRET: string;
    AUTH_EMAIL_FROM: string;
    RESEND_API_KEY: string;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    STRIPE_ACCOUNT_ID: string;
    STRIPE_MODE: string;
    STRIPE_OFFERS_JSON: string;
  }
}
