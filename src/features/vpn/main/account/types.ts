export type SkuItem = {
  id: string; order_id: string; sku: string; created_at: string; updated_at: string;
  currency: string; quantity: number; price: number; subtotal: number; location: string;
  description: string; credential_type: 'time-limited' | 'time-limited-v2' | 'single-use';
};
export type SkuOrder = {
  id: string; created_at: string; updated_at: string; currency: string; total_price: number;
  location: string; merchant_id: string; status: string; items: SkuItem[];
  metadata: { stripe_checkout_session_id?: string; payment_processor?: string; num_intervals?: number; num_per_interval?: number } | null;
  expires_at: string | null; last_paid_at: string | null;
};
export type SkuToken = { encoded: string; spent: boolean; rfc: boolean };
export type SkuBucket = { validFrom: string; validTo: string; issuerId: string; tokens: SkuToken[] };
export type SkuPending = { requestId: string; tokens: string[]; blinded: string[]; submitted: boolean };
export type SkuItemState = { pending?: SkuPending; buckets: SkuBucket[]; timeLimited: { issuedAt: string; expiresAt: string; token: string }[] };
export type SkuRecord = { order: SkuOrder; items: Record<string, SkuItemState> };
export type SkuDocument = { orders: Record<string, SkuRecord> };
export type SkuSummary = { order: SkuOrder; remaining_credential_count: number; expires_at: string | null; active: boolean; next_active_at: string | null };
export type SkuPresentation = { cookie: string; credential: string; expiresAt: number };
export const vpnSkuDomain = 'vpn.brave.com';
export const accountOrigin = 'https://account.brave.com';
export const accountUrl = `${accountOrigin}/account/`;
