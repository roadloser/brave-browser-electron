import { z } from 'zod';
import { BrowserError } from '../../../../shared/errors';
import type { SkuOrder } from './types';
import { vpnSkuDomain } from './types';

export const skuIdSchema = z.string().uuid();
const dateSchema = z.string().refine(value => Number.isFinite(Date.parse(value)));
const itemSchema = z.object({
  id: skuIdSchema, orderId: skuIdSchema, sku: z.string().min(1).max(256),
  createdAt: dateSchema, updatedAt: dateSchema, currency: z.string().max(16),
  quantity: z.number().int().min(1).max(5000), price: z.string().max(40), subtotal: z.string().max(40),
  location: z.string().max(256), description: z.string().max(4096),
  credentialType: z.enum(['time-limited', 'time-limited-v2', 'single-use']),
});
const orderSchema = z.object({
  id: skuIdSchema, createdAt: dateSchema, updatedAt: dateSchema, currency: z.string().max(16), totalPrice: z.string().max(40),
  location: z.literal(vpnSkuDomain), merchantId: z.string().min(1).max(256), status: z.string().max(80), items: z.array(itemSchema).min(1).max(20),
  metadata: z.object({ stripeCheckoutSessionId: z.string().optional(), paymentProcessor: z.string().optional(), numIntervals: z.number().int().min(1).max(5000).optional(), numPerInterval: z.number().int().min(1).max(5000).optional() }).nullish(),
  expiresAt: dateSchema.nullish(), lastPaidAt: dateSchema.nullish(),
});
export function parseSkuOrder(value: unknown, requestedId: string): SkuOrder {
  const parsed = orderSchema.safeParse(value);
  if (!parsed.success || parsed.data.id !== requestedId || parsed.data.items.some(item => item.orderId !== requestedId || item.location !== vpnSkuDomain)) throw new BrowserError('FORBIDDEN', '账户返回的订单不属于此VPN授权');
  const order = parsed.data;
  const items = order.items.map(item => ({ id: item.id, order_id: item.orderId, sku: item.sku, created_at: item.createdAt, updated_at: item.updatedAt, currency: item.currency, quantity: item.quantity, price: Number(item.price), subtotal: Number(item.subtotal), location: item.location, description: item.description, credential_type: item.credentialType }));
  if (!Number.isFinite(Number(order.totalPrice)) || items.some(item => !Number.isFinite(item.price) || !Number.isFinite(item.subtotal))) throw new BrowserError('UNAVAILABLE', '账户订单金额格式变化');
  return { id: order.id, created_at: order.createdAt, updated_at: order.updatedAt, currency: order.currency, total_price: Number(order.totalPrice), location: order.location, merchant_id: order.merchantId, status: order.status, items,
    metadata: order.metadata ? { stripe_checkout_session_id: order.metadata.stripeCheckoutSessionId, payment_processor: order.metadata.paymentProcessor, num_intervals: order.metadata.numIntervals, num_per_interval: order.metadata.numPerInterval } : null,
    expires_at: order.expiresAt ?? null, last_paid_at: order.lastPaidAt ?? null };
}
export function mayIssueCredentials(order: SkuOrder): boolean {
  return order.status === 'paid' || (['canceled', 'cancelled'].includes(order.status) && !!order.expires_at && Date.parse(order.expires_at) > Date.now());
}
