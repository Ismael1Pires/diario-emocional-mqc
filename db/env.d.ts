declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AUTH_ORIGIN: string;
    AUTH_SECRET: string;
    AUTH_EMAIL_FROM: string;
    RESEND_API_KEY: string;
  }
}
