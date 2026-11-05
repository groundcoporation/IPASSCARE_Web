// Public website pricing confirmed by the service owner.
// This does not configure billing, entitlements or payment processing.
export const servicePlans = [
  { id: 'basic', name: 'Basic (베이직)', monthlyPrice: 39900, description: '전용 단말기(태블릿) 미포함', recommendation: { students: '30명 이하', shuttles: '1대' } },
  { id: 'lite', name: 'Lite (라이트)', monthlyPrice: 69900, description: '전용 단말기(태블릿) 미포함', recommendation: { students: '50명 이하', shuttles: '1대' } },
  { id: 'pro', name: 'Pro (프로)', monthlyPrice: 99000, description: '전용 단말기(태블릿) 미포함', recommendation: { students: '50명 초과', shuttles: '1대 이상' } },
  { id: 'enterprise', name: 'Enterprise (엔터프라이즈)', monthlyPrice: 119900, description: '전용 단말기(태블릿) 제공', recommendation: { students: '50명 초과', shuttles: '3대 이상' } },
] as const;

export const coreServiceFeatures = ['실시간 차량 위치', '승하차 알림', '운행 관리'] as const;
