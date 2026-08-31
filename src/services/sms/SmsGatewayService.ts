import { supabase } from '../../lib/supabaseClient';

export type SmsMessageType = 'SMS' | 'LMS';

export interface SmsGatewayRecipient {
  id: string;
  phone: string;
}

export interface SmsGatewayResult {
  recipientId: string;
  phone: string;
  code: string;
  result: string;
  messageKey: string | null;
  success: boolean;
}

interface SendSmsRequest {
  branchId: string;
  type: SmsMessageType;
  content: string;
  recipients: SmsGatewayRecipient[];
}

interface SendSmsResponse {
  requestId: string;
  senderPhone: string;
  acceptedCount: number;
  failedCount: number;
  results: SmsGatewayResult[];
}

const relayUrl = (import.meta.env.VITE_SMS_RELAY_URL as string | undefined)?.replace(/\/$/, '');

export class SmsGatewayError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'SmsGatewayError';
  }
}

export const SmsGatewayService = {
  async send(request: SendSmsRequest): Promise<SendSmsResponse> {
    if (!relayUrl) {
      throw new SmsGatewayError('문자 중계 서버 주소(VITE_SMS_RELAY_URL)가 설정되지 않았습니다.');
    }

    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new SmsGatewayError('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.', 401);
    }

    const response = await fetch(`${relayUrl}/v1/messages/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...request,
        clientRequestId: crypto.randomUUID(),
      }),
    });

    const payload = await response.json().catch(() => null) as
      | (SendSmsResponse & { error?: string })
      | null;

    if (!response.ok) {
      throw new SmsGatewayError(
        payload?.error || `문자 중계 서버 요청에 실패했습니다. (${response.status})`,
        response.status,
      );
    }

    if (!payload) {
      throw new SmsGatewayError('문자 중계 서버가 올바른 응답을 반환하지 않았습니다.');
    }

    return payload;
  },
};
