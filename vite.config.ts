import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'kspay-wh-rcv-handler',
      configureServer(server) {
        server.middlewares.use('/kspay_wh_rcv.html', (req: any, res: any, next: any) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => { body += chunk; });
            req.on('end', () => {
              const params = new URLSearchParams(body);
              const rcid = params.get('reCommConId') || params.get('reBillingToken') || '';
              const rctype = params.get('reCommType') || '';
              const rhash = params.get('reHash') || '';
              const rcncl = params.get('reCnclType') || '';

              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(`
                <!DOCTYPE html>
                <html lang="ko">
                <head><meta charset="utf-8"><title>결제 승인</title></head>
                <body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;text-align:center;padding:50px;background:#f8fafc;">
                  <div style="background:white;padding:32px 40px;border-radius:24px;display:inline-block;box-shadow:0 10px 30px rgba(0,0,0,0.08);border:1px solid #e2e8f0;">
                    <div style="font-size:36px;margin-bottom:10px;">💳</div>
                    <h3 style="margin:0 0 8px 0;color:#0f172a;font-size:16px;font-weight:800;">카드 인증 완료</h3>
                    <p style="margin:0;color:#64748b;font-size:13px;">카드사 실출금 승인 및 포인트 적립 중입니다...</p>
                  </div>
                  <script>
                    (function() {
                      var rcid = "${rcid}";
                      var rcncl = "${rcncl}";
                      if (rcncl === "1" || !rcid) {
                        if (window.opener && window.opener.mcancel) window.opener.mcancel();
                        window.close();
                        return;
                      }

                      // 1. Broadcast to opener
                      if (window.opener) {
                        if (typeof window.opener.eparamSet === 'function') {
                          window.opener.eparamSet(rcid, "${rctype}", "${rhash}");
                        }
                        if (typeof window.opener.goResult === 'function') {
                          window.opener.goResult(rcid);
                        }
                        window.opener.postMessage({ type: 'KSPAY_PAYMENT_SUCCESS', payKey: rcid }, '*');
                      }

                      // 2. Broadcast to localStorage
                      try {
                        localStorage.setItem('kspay_payment_success', JSON.stringify({
                          time: Date.now(),
                          payKey: rcid,
                          status: 'SUCCESS'
                        }));
                      } catch(e) {}

                      setTimeout(function() { window.close(); }, 800);
                    })();
                  </script>
                </body>
                </html>
              `);
            });
            return;
          }
          next();
        });
      }
    }
  ],
})
