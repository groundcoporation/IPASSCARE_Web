// Public website pricing confirmed by the service owner.
// This does not configure billing, entitlements or payment processing.
export const servicePlans = [
  { id: 'basic', name: 'Lite (베이직)', monthlyPrice: 39900, description: '전용 단말기(태블릿) 미포함' },
  { id: 'lite', name: 'Lite (라이트)', monthlyPrice: 69900, description: '전용 단말기(태블릿) 미포함' },
  { id: 'pro', name: 'Pro (프로)', monthlyPrice: 99000, description: '전용 단말기(태블릿) 1대 제공' },
  { id: 'enterprise', name: 'Enterprise (엔터프라이즈)', monthlyPrice: 119900, description: '전용 단말기 제공 및 커스텀 케어 지원 (별도 협의)' },
] as const;

export const coreServiceFeatures = ['실시간 차량 위치', '승하차 알림', '운행 관리'] as const;
