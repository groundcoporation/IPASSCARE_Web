import { supabase } from '../../lib/supabaseClient';

export interface KSPayPaymentRequest {
  branchId: string;
  userId?: string;
  userName?: string;
  userPhone?: string;
  userEmail?: string;
  amount: number;
  bonusAmount?: number;
  goodName?: string;
  paymentMethod?: 'CARD' | 'BANK' | 'VBANK';
  isTest?: boolean;
}

export interface KSPayPaymentResult {
  success: boolean;
  orderNumber: string;
  amount: number;
  bonusAmount: number;
  paymentMethod: string;
  tid?: string;
  message?: string;
}

const DEFAULT_TEST_MID = '2999199999'; // KSNET 공식 테스트 상점 ID

export class KSPayWebService {
  /**
   * Fetches branch KSPay MID from DB (or falls back to default test MID)
   */
  static async getBranchMid(branchId: string): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, kspay_mid')
        .eq('id', branchId)
        .maybeSingle();

      if (!error && data && data.kspay_mid) {
        console.log(`[KSPay DB 연동 확인] 지점: ${data.name}(${data.id}) ➔ DB에서 조회된 실 MID: ${data.kspay_mid}`);
        return data.kspay_mid;
      }
    } catch (err) {
      console.warn('Failed to fetch branch MID, falling back to test MID:', err);
    }
    console.log('[KSPay] DB에 지점 MID가 없어 기본 테스트 MID(2999199999)로 연동됩니다.');
    return DEFAULT_TEST_MID;
  }

  /**
   * Generates a unique order number for KSNET
   */
  static generateOrderNumber(prefix = 'PNT'): string {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Formats good name without special characters (max 15 chars for KSNET)
   */
  static formatGoodName(rawName: string): string {
    return rawName
      .replace(/[^a-zA-Z0-9가-힣\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 15);
  }

  /**
   * Process i-Point Charge & Record in Supabase DB
   */
  static async processChargeRecord(
    req: KSPayPaymentRequest, 
    orderNumber: string, 
    tid: string
  ): Promise<KSPayPaymentResult> {
    const totalBonus = req.bonusAmount !== undefined 
      ? req.bonusAmount 
      : (req.amount === 300000 ? 20000 : req.amount === 200000 ? 10000 : 0);
    const totalCredit = req.amount + totalBonus;

    // 1. Fetch current balance
    const { data: balData } = await supabase
      .from('academy_sms_balances')
      .select('point_balance, total_charged')
      .eq('branch_id', req.branchId)
      .maybeSingle();

    const prevBal = balData?.point_balance || 0;
    const afterBal = prevBal + totalCredit;

    // 2. Insert into academy_sms_charge_logs
    const { error: logErr } = await supabase
      .from('academy_sms_charge_logs')
      .insert([{
        branch_id: req.branchId,
        charge_amount: req.amount,
        bonus_amount: totalBonus,
        prev_balance: prevBal,
        after_balance: afterBal,
        payment_method: req.paymentMethod || 'CARD',
        status: 'success'
      }]);

    if (logErr) throw logErr;

    // 3. Upsert into academy_sms_balances
    await supabase
      .from('academy_sms_balances')
      .upsert([{
        branch_id: req.branchId,
        point_balance: afterBal,
        total_charged: (balData?.total_charged || 0) + req.amount,
        updated_at: new Date().toISOString()
      }]);

    // 4. Update payments table with explicit memo and source
    if (tid) {
      try {
        await supabase
          .from('payments')
          .update({
            memo: `i-Point ${req.amount.toLocaleString()}P 충전`,
            source: 'web_ipoint'
          })
          .eq('pg_tid', tid);
      } catch (memoErr) {
        console.warn('Payment memo update notice:', memoErr);
      }
    }

    return {
      success: true,
      orderNumber,
      amount: req.amount,
      bonusAmount: totalBonus,
      paymentMethod: req.paymentMethod || 'CARD',
      tid,
      message: 'i-Point 충전이 정상 완료되었습니다.'
    };
  }

  /**
   * Loads jQuery dependency required by KSNET WebHost
   */
  static async loadJQuery(): Promise<void> {
    if ((window as any).$ && (window as any).jQuery) return;

    return new Promise((resolve, reject) => {
      const existing = document.getElementById('kspay-jquery-script');
      if (existing) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.id = 'kspay-jquery-script';
      script.src = 'https://code.jquery.com/jquery-3.7.1.min.js';
      script.onload = () => {
        console.log('[KSPay PC] jQuery 로드 완료');
        resolve();
      };
      script.onerror = () => reject(new Error('jQuery 라이브러리 로드 실패'));
      document.head.appendChild(script);
    });
  }

  /**
   * Loads KSNET PC Web SSL script dynamically
   */
  static async loadKSPayScript(): Promise<void> {
    // 1. Ensure jQuery is available
    await this.loadJQuery();

    if (typeof (window as any)._pay === 'function') return;

    return new Promise((resolve, reject) => {
      const existingScript = document.getElementById('kspay-pc-script');
      if (existingScript) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.id = 'kspay-pc-script';
      script.src = 'https://kspay.ksnet.to/store/KSPayWebV1.4/js/kspay_web_ssl.js';
      script.onload = () => {
        console.log('[KSPay PC] KSNET WebHost SSL 스크립트 로드 완료');
        resolve();
      };
      script.onerror = (e) => {
        console.error('[KSPay PC] KSNET 스크립트 로드 실패:', e);
        reject(new Error('KSNET 결제 모듈 스크립트를 로드할 수 없습니다.'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Launches KSNET PC Checkout Modal and handles payment completion
   */
  static async openPaymentWindow(
    req: KSPayPaymentRequest,
    onSuccess: (result: KSPayPaymentResult) => void,
    onCancel?: () => void
  ): Promise<void> {
    const orderNumber = this.generateOrderNumber();
    const goodName = this.formatGoodName(req.goodName || `iPoint ${req.amount.toLocaleString()}P`);
    const mid = await this.getBranchMid(req.branchId);

    try {
      await this.loadKSPayScript();
    } catch (err: any) {
      alert(`결제 모듈 로드 오류: ${err.message}`);
      if (onCancel) onCancel();
      return;
    }

    // 1. Remove any old KSPayWeb forms
    const oldForm = document.forms.namedItem('KSPayWeb');
    if (oldForm && oldForm.parentNode) {
      oldForm.parentNode.removeChild(oldForm);
    }

    // 2. Open dedicated popup window (bypasses iframe X-Frame-Options restriction)
    const popupName = `KSPAY_PC_POPUP_${Date.now()}`;
    const popupWidth = 840;
    const popupHeight = 720;
    const left = window.screen.width ? (window.screen.width - popupWidth) / 2 : 100;
    const top = window.screen.height ? (window.screen.height - popupHeight) / 2 : 100;

    const popup = window.open(
      'about:blank',
      popupName,
      `width=${popupWidth},height=${popupHeight},top=${top},left=${left},scrollbars=yes,resizable=yes,status=yes`
    );

    if (!popup) {
      alert('브라우저 팝업이 차단되어 결제창을 열 수 없습니다. 브라우저 주소창 우측에서 팝업 허용을 설정해 주세요.');
      if (onCancel) onCancel();
      return;
    }

    // 3. Create standard PC Web form
    const form = document.createElement('form');
    form.name = 'KSPayWeb';
    form.method = 'POST';
    form.action = 'https://kspay.ksnet.to/store/KSPayWebV1.4/KSPayPWeb.jsp';
    form.target = popupName;
    form.acceptCharset = 'utf-8';
    form.style.display = 'none';

    const fields: Record<string, string> = {
      sndCharSet: 'utf-8',
      sndPaymethod: '1000000000', // 신용카드
      sndStoreid: mid,
      sndOrdernumber: orderNumber,
      sndGoodname: goodName,
      sndAmount: String(req.amount),
      sndOrdername: req.userName || '학원장',
      sndMobile: req.userPhone || '01000000000',
      sndEmail: req.userEmail || 'admin@ipasscare.com',
      sndCurrencytype: 'WON',
      sndInstallmenttype: '0:2:3:4:5:6:7:8:9:10:11:12',
      sndInteresttype: 'NONE',
      sndShowcard: 'C',
      sndEscrow: '0',
      sndGoodType: '1',
      sndStoreName: '아이패스케어',
      sndStoreNameEng: 'ipasscare',
      sndStoreDomain: 'https://ipasscare.com',
      sndReply: `${window.location.origin}/kspay_wh_rcv.html`,
      reCommConId: '',
      reCommType: '',
      reHash: ''
    };

    Object.entries(fields).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);

    // 4. Register robust multi-channel listeners (executes real KSNET card approval)
    let isCompleted = false;
    localStorage.removeItem('kspay_payment_success');

    const handleSuccess = async (payKey?: string) => {
      if (isCompleted) return;
      isCompleted = true;
      clearInterval(checkTimer);
      window.removeEventListener('message', messageListener);
      localStorage.removeItem('kspay_payment_success');

      let finalTid = `TID_${Date.now()}`;

      if (!payKey) {
        console.error('[KSPay PC] 결제 인증키(payKey)가 누락되었습니다.');
        alert('❌ 카드 인증키가 수신되지 않아 결제가 승인되지 않았습니다.');
        if (form.parentNode) form.parentNode.removeChild(form);
        if (onCancel) onCancel();
        return;
      }

      // 1. Request final card deduction via Supabase Edge Function
      try {
        console.log('[KSPay PC] Supabase Edge Function(payment-confirm) 호출하여 KSNET 실출금 승인 요청... payKey:', payKey);
        const { data: confirmData, error: confirmErr } = await supabase.functions.invoke('payment-confirm', {
          body: {
            payKey: payKey,
            branch_id: req.branchId,
            amount: req.amount
          }
        });

        if (confirmErr) {
          console.error('[KSPay PC] Edge Function 승인 에러:', confirmErr);
          throw new Error(`카드 승인 실패: ${confirmErr.message || '카드사 승인 거절'}`);
        }

        if (confirmData?.error) {
          throw new Error(`카드 승인 실패: ${confirmData.error}`);
        }

        if (confirmData?.transactionId) {
          finalTid = confirmData.transactionId;
        }
        console.log('[KSPay PC] 🎉 카드사 실출금 승인 완료! KSNET 거래번호:', finalTid);
      } catch (err: any) {
        console.error('[KSPay PC] 실결제 처리 실패:', err);
        alert(`❌ 카드 결제 승인 실패: ${err.message}`);
        if (form.parentNode) form.parentNode.removeChild(form);
        if (onCancel) onCancel();
        return;
      }

      console.log('[KSPay PC] 결제 승인 완료 ➔ DB 포인트 가산 처리. 거래번호:', finalTid);
      try {
        const result = await KSPayWebService.processChargeRecord(req, orderNumber, finalTid);
        if (form.parentNode) form.parentNode.removeChild(form);
        onSuccess(result);
      } catch (err: any) {
        console.error('KSPay Charge Record Error:', err);
        alert(`포인트 가산 처리 중 오류 발생: ${err.message}`);
        if (onCancel) onCancel();
      }
    };

    const messageListener = (e: MessageEvent) => {
      if (e.data && e.data.type === 'KSPAY_PAYMENT_SUCCESS') {
        handleSuccess(e.data.payKey);
      }
    };
    window.addEventListener('message', messageListener);

    (window as any).eparamSet = (rcid: string, rctype: string, rhash: string) => {
      console.log('[KSPay PC eparamSet]', { rcid, rctype, rhash });
      if (rcid) handleSuccess(rcid);
    };

    (window as any).goResult = (payKey?: string) => {
      handleSuccess(payKey);
    };

    (window as any).mcancel = () => {
      console.log('[KSPay PC mcancel] 결제가 취소되었습니다.');
      if (form.parentNode) form.parentNode.removeChild(form);
      if (onCancel) onCancel();
    };

    // 5. Submit form directly into popup window
    form.submit();

    // 6. Monitor popup window close & localStorage sync
    const checkTimer = setInterval(() => {
      const rawSignal = localStorage.getItem('kspay_payment_success');
      if (rawSignal && !isCompleted) {
        try {
          const parsed = JSON.parse(rawSignal);
          handleSuccess(parsed.payKey);
        } catch (e) {
          handleSuccess();
        }
        return;
      }

      if (popup.closed) {
        clearInterval(checkTimer);
        window.removeEventListener('message', messageListener);
        if (!isCompleted) {
          const finalRaw = localStorage.getItem('kspay_payment_success');
          if (finalRaw) {
            try {
              const parsed = JSON.parse(finalRaw);
              handleSuccess(parsed.payKey);
            } catch (e) {
              handleSuccess();
            }
          } else {
            console.log('[KSPay PC] 결제창이 닫혔습니다.');
            if (form.parentNode) form.parentNode.removeChild(form);
            if (onCancel) onCancel();
          }
        }
      }
    }, 500);
  }
}
