import http from 'node:http';
import { randomUUID } from 'node:crypto';

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'BIZGO_API_KEY',
  'BIZGO_SENDER_PHONE',
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
const bizgoUrl = process.env.BIZGO_API_URL || 'https://mars.ibapi.kr/api/comm/v1/send/omni';
const bizgoEnvironment = bizgoUrl.includes('sandbox-mars.ibapi.kr') ? 'sandbox' : 'production';
const senderPhone = normalizePhone(process.env.BIZGO_SENDER_PHONE);
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const staffRoles = new Set(['admin', 'master', 'director', 'teacher', 'coach']);

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function legacyMessageBytes(value) {
  return [...value].reduce((bytes, character) => bytes + (character.charCodeAt(0) > 127 ? 2 : 1), 0);
}

function jsonResponse(res, status, payload, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };

  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }

  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 256_000) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

async function verifySupabaseUser(accessToken) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  return response.json();
}

async function loadProfile(userId) {
  const query = new URLSearchParams({
    id: `eq.${userId}`,
    select: 'id,role,branch_id,status',
    limit: '1',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/users?${query}`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!response.ok) throw new Error('Failed to load sender profile.');
  const rows = await response.json();
  return rows[0] || null;
}

function validateRequest(payload, profile) {
  const branchId = String(payload.branchId || '').trim();
  const type = payload.type === 'LMS' ? 'LMS' : payload.type === 'SMS' ? 'SMS' : null;
  const content = String(payload.content || '').trim();
  const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];

  if (!branchId) throw new Error('지점 정보가 없습니다.');
  if (!type) throw new Error('지원하지 않는 문자 유형입니다.');
  if (!content) throw new Error('문자 내용이 없습니다.');
  if (recipients.length < 1 || recipients.length > 200) {
    throw new Error('수신자는 1명 이상 200명 이하로 지정해야 합니다.');
  }

  const byteLength = legacyMessageBytes(content);
  if (type === 'SMS' && byteLength > 90) throw new Error('SMS 본문은 90byte 이하여야 합니다.');
  if (type === 'LMS' && byteLength > 2_000) throw new Error('LMS 본문은 2,000byte 이하여야 합니다.');

  if (!['admin', 'master'].includes(profile.role) && profile.branch_id !== branchId) {
    throw new Error('다른 지점의 문자를 발송할 권한이 없습니다.');
  }

  const normalizedRecipients = recipients.map((recipient) => {
    const phone = normalizePhone(recipient.phone);
    if (!/^01\d{8,9}$/.test(phone)) throw new Error(`잘못된 수신번호입니다: ${recipient.phone || ''}`);
    return {
      id: String(recipient.id || randomUUID()),
      phone,
    };
  });

  return { branchId, type, content, recipients: normalizedRecipients };
}

function normalizeBizgoResponse(payload, recipients) {
  const commonCode = payload?.common?.authCode;
  const body = payload?.data ?? payload;
  const destinationResults = body?.data?.destinations ?? body?.destinations ?? [];

  return recipients.map((recipient) => {
    const result = destinationResults.find(
      (item) => item.ref === recipient.id || normalizePhone(item.to) === recipient.phone,
    );
    const code = String(result?.code || body?.code || commonCode || 'UNKNOWN');
    return {
      recipientId: recipient.id,
      phone: recipient.phone,
      code,
      result: String(result?.result || body?.result || payload?.common?.authResult || 'Unknown response'),
      messageKey: result?.msgKey || null,
      success: code === 'A000' && (!commonCode || commonCode === 'A000'),
    };
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;

  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse(res, 403, { error: '허용되지 않은 웹 출처입니다.' });
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    });
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/health') {
    return jsonResponse(res, 200, {
      ok: true,
      service: 'ipasscare-sms-relay',
      environment: bizgoEnvironment,
    }, origin);
  }

  if (req.method !== 'POST' || req.url !== '/v1/messages/send') {
    return jsonResponse(res, 404, { error: 'Not found' }, origin);
  }

  try {
    const authorization = req.headers.authorization || '';
    const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!accessToken) return jsonResponse(res, 401, { error: '로그인이 필요합니다.' }, origin);

    const authUser = await verifySupabaseUser(accessToken);
    if (!authUser?.id) return jsonResponse(res, 401, { error: '유효하지 않은 로그인 세션입니다.' }, origin);

    const profile = await loadProfile(authUser.id);
    if (!profile || profile.status === 'deleted' || !staffRoles.has(profile.role)) {
      return jsonResponse(res, 403, { error: '문자를 발송할 권한이 없습니다.' }, origin);
    }

    const payload = await readJson(req);
    const request = validateRequest(payload, profile);
    const requestId = String(payload.clientRequestId || randomUUID());
    const message = request.type === 'SMS'
      ? { sms: { from: senderPhone, text: request.content } }
      : { mms: { from: senderPhone, title: '[IPASSCARE]', text: request.content } };

    const bizgoResponse = await fetch(bizgoUrl, {
      method: 'POST',
      headers: {
        Authorization: process.env.BIZGO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        destinations: request.recipients.map((recipient) => ({
          to: recipient.phone,
          ref: recipient.id,
        })),
        messageFlow: [message],
        ref: requestId,
        idempotencyKey: requestId,
        idempotencyTtl: 86_400,
      }),
    });

    const bizgoPayload = await bizgoResponse.json().catch(() => ({}));
    const results = normalizeBizgoResponse(bizgoPayload, request.recipients);
    const acceptedCount = results.filter((result) => result.success).length;

    if (!bizgoResponse.ok || acceptedCount === 0) {
      console.error('Bizgo request failed', {
        requestId,
        status: bizgoResponse.status,
        code: bizgoPayload?.common?.authCode || bizgoPayload?.code,
      });
      return jsonResponse(res, 502, {
        error: `비즈고 발송 접수에 실패했습니다: ${results[0]?.result || bizgoResponse.status}`,
        requestId,
        results,
      }, origin);
    }

    console.info('SMS accepted', { requestId, userId: authUser.id, branchId: request.branchId, acceptedCount });
    return jsonResponse(res, 200, {
      requestId,
      environment: bizgoEnvironment,
      senderPhone,
      acceptedCount,
      failedCount: results.length - acceptedCount,
      results,
    }, origin);
  } catch (error) {
    console.error('SMS relay error', error);
    return jsonResponse(res, 400, {
      error: error instanceof Error ? error.message : '문자 발송 요청을 처리하지 못했습니다.',
    }, origin);
  }
});

server.listen(port, host, () => {
  console.info(`IPASSCARE SMS relay listening on http://${host}:${port}`);
});
