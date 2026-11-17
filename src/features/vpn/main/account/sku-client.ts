import type { BrowserContext } from '../../../../shared/contracts/browser-core';
import type { ContextNetworkPort } from '../../../../shared/network-ports';
import { BrowserError } from '../../../../shared/errors';
import { SkuHttpClient } from './http-client';
import { SkuCredentialFetcher } from './credential-fetcher';
import { SkuCredentialPresenter } from './credential-presenter';
import { SkuCryptoAdapter } from './crypto-adapter';
import type { SkuRepository } from './repository';
import { parseSkuOrder, skuIdSchema } from './order-parser';
import { vpnSkuDomain } from './types';

export class VpnSkuClient {
  private readonly http: SkuHttpClient;
  private readonly fetcher: SkuCredentialFetcher;
  private readonly presenter: SkuCredentialPresenter;
  constructor(network: ContextNetworkPort, private readonly repository: SkuRepository) {
    this.http = new SkuHttpClient(network);
    const crypto = new SkuCryptoAdapter();
    this.fetcher = new SkuCredentialFetcher(this.http, repository, crypto);
    this.presenter = new SkuCredentialPresenter(repository, crypto);
  }
  async refreshOrder(context: BrowserContext, orderId: string, signal: AbortSignal) {
    const validId = skuIdSchema.parse(orderId);
    const order = parseSkuOrder(await this.http.request(context, 'GET', `/v1/orders/${validId}`, signal), validId);
    signal.throwIfAborted();
    this.repository.update(context.profileId, document => {
      if (!document.orders[order.id] && Object.keys(document.orders).length >= 100) throw new BrowserError('UNAVAILABLE', '本资料账户订单数量超出支持范围');
      document.orders[order.id] = { order, items: document.orders[order.id]?.items ?? {} };
    });
    return order;
  }
  async fetchOrderCredentials(context: BrowserContext, orderId: string, signal: AbortSignal): Promise<string> {
    const order = await this.refreshOrder(context, orderId, signal);
    await this.fetcher.fetch(context, order, signal);
    return '';
  }
  async summary(context: BrowserContext, domain: string, signal: AbortSignal) {
    this.domain(domain);
    const records = Object.values(this.repository.load(context.profileId).orders);
    for (const record of records) {
      const expiry = record.order.expires_at ? Date.parse(record.order.expires_at) : Infinity;
      const order = expiry <= Date.now() ? await this.refreshOrder(context, record.order.id, signal) : record.order;
      const last = record.items[order.items[0].id]?.buckets.at(-1)?.validTo;
      if (last && Date.parse(last) <= Date.now() && (!order.expires_at || Date.parse(order.expires_at) > Date.now())) await this.fetcher.fetch(context, order, signal);
    }
    return this.presenter.summary(context.profileId);
  }
  present(profileId: string, domain: string, path: string) { this.domain(domain); return this.presenter.present(profileId, path); }
  private domain(domain: string): void { if (domain !== vpnSkuDomain) throw new BrowserError('FORBIDDEN', '此账户能力仅允许VPN产品授权'); }
}
