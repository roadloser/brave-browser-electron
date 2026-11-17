import type { RewardsState } from '../../../../shared/contracts/rewards';

export function withDeliveryCapabilities(state: RewardsState): RewardsState {
  const capabilities = state.capabilities.filter(item => !['广告资格与展示确认', '其他余额和结算', '通知广告与匿名确认', '广告token兑换', '其他广告格式与定向', '其他余额'].includes(item.operation));
  return { ...state, ads: { ...state.ads, reason: state.ads.status === 'unknown' ? '通知广告与匿名确认客户端已接入，官方资格和运行结果尚未确认' : state.ads.reason }, capabilities: [...capabilities,
    { operation: '通知广告与匿名确认', status: 'implemented', reason: '官方目录/issuer/地理、真实系统通知事件、密文confirmation队列；未运行观察，外部资格尚未确认' },
    { operation: '广告token兑换', status: 'implemented', reason: 'paymentToken证明去盲与固定批次paymentCredentials兑换；服务接受不等于BAT到账' },
    { operation: '其他广告格式与定向', status: 'blocked', reason: '个性化模型、其他广告格式与落地/转化事件仍待接入；当前通知广告使用官方untargeted候选' },
    { operation: '其他余额', status: 'blocked', reason: '其他wallet provider余额和OAuth仍待接入，未以Solana替代' },
  ] };
}
