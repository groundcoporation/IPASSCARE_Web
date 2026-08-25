import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { loadActiveAppSchedulesByChild } from '../../lib/adminScheduleAssignments';
import { KSPayWebService } from '../../services/payment/KSPayWebService';
import { 
  Send, Search, Smartphone, Clock, History, BookmarkPlus, 
  Trash2, X, RefreshCw, ChevronLeft, ChevronRight, 
  Coins, CheckCircle2, XCircle, AlertCircle, Paperclip,
  TrendingUp, TrendingDown, Gift, CreditCard, RotateCcw,
  Wallet, Filter, ArrowUpRight, ArrowDownRight, Building2, FileText, Lock
} from 'lucide-react';

interface PointTransaction {
  id: string;
  type: 'charge' | 'convert' | 'sms' | 'referral' | 'refund';
  title: string;
  detail: string;
  amount: number;
  balanceAfter?: number | null;
  createdAt: string;
}

interface Student {
  id: string;
  student_name: string;
  mother_phone: string | null;
  father_phone: string | null;
  student_phone: string | null;
  target_class?: string;
  target_classes?: string[];
  attendance_code?: string;
}

interface Recipient {
  id: string; // unique key
  studentId?: string;
  studentName: string;
  relation: '어머니' | '아버지' | '학생' | '직접입력';
  phone: string;
}

interface SmsLog {
  id: string;
  branch_id: string | null;
  type: 'SMS' | 'LMS' | 'MMS';
  sender_phone: string | null;
  receiver_name: string;
  receiver_phone: string;
  content: string;
  status: 'success' | 'failed' | 'reserved' | 'cancelled';
  cost: number;
  sent_at: string;
  reserved_at?: string | null;
}

interface SmsTemplate {
  id: string;
  branch_id?: string | null;
  title: string;
  category: string;
  content: string;
}

const DEFAULT_TEMPLATES: SmsTemplate[] = [
  {
    id: 'tpl-1',
    title: '등원 안심 알림',
    category: '출결',
    content: '[아이패스케어] 원생이 학원에 안전하게 등원하였습니다.'
  },
  {
    id: 'tpl-2',
    title: '하원 안심 알림',
    category: '출결',
    content: '[아이패스케어] 원생이 모든 수업을 마치고 안전하게 하원하였습니다. 귀가 지도를 부탁드립니다.'
  },
  {
    id: 'tpl-3',
    title: '수강료 결제 안내',
    category: '수납',
    content: '[아이패스케어] 학부모님 안녕하십니까. 이번 달 수강료 결제 고지서가 발행되었습니다. 어플에서 확인 후 간편 결제 가능합니다.'
  },
  {
    id: 'tpl-4',
    title: '정기 휴원 안내',
    category: '공지',
    content: '[아이패스케어] 안내드립니다. 다가오는 공휴일에는 학원 정기 휴원으로 수업이 진행되지 않습니다. 수업 일정에 착오 없으시길 바랍니다.'
  },
  {
    id: 'tpl-5',
    title: '방학 집중 특강 안내',
    category: '공지',
    content: '[아이패스케어] 학부모님 안녕하십니까. 학생을 위한 맞춤형 집중 방학 특강이 개설되었습니다. 선착순 마감되오니 많은 관심 바랍니다.'
  }
];

interface AdminSmsTabProps {
  activeBranchId: string | null;
  branches: Array<{ id: string; name: string }>;
  profile?: { id: string; name: string | null; role: string; branch_id: string | null } | null;
  subTab?: string;
  setSubTab?: (tab: string) => void;
}

export const AdminSmsTab: React.FC<AdminSmsTabProps> = ({
  activeBranchId,
  branches,
  profile,
  subTab = 'sms_send',
  setSubTab
}) => {
  // Admin / Master privilege check
  const isAdmin = profile?.role === 'admin' || profile?.role === 'master';

  // Current active subview (sms_send | sms_history | sms_reserved | sms_points)
  const currentSubTab = ['sms_history', 'sms_reserved', 'sms_points'].includes(subTab) ? subTab : 'sms_send';

  // Target effective branch id
  const targetBranchId = activeBranchId && activeBranchId !== 'all' 
    ? activeBranchId 
    : (branches.length > 0 ? branches[0].id : null);

  // Student list state
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Table selection
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  // Phone Mockup Composer State
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [manualPhoneInput, setManualPhoneInput] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [isReserved, setIsReserved] = useState(false);
  const [reserveDate, setReserveDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [reserveHour, setReserveHour] = useState('09');
  const [reserveMinute, setReserveMinute] = useState('00');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // i-Point State (from Supabase academy_sms_balances)
  const [pointBalance, setPointBalance] = useState<number>(1000);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [chargeAmount, setChargeAmount] = useState<number>(100000);
  const [selectedPayMethod, setSelectedPayMethod] = useState<'CARD' | 'BANK' | 'VBANK'>('CARD');
  const [chargeLoading, setChargeLoading] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<SmsTemplate[]>(DEFAULT_TEMPLATES);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');

  // History & Reserved logs state (from Supabase academy_sms_logs)
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Point Usage & Unified Ledger State
  const [pointTransactions, setPointTransactions] = useState<PointTransaction[]>([]);
  const [pointFilter, setPointFilter] = useState<'all' | 'charge' | 'sms' | 'referral' | 'refund'>('all');
  const [pointSearchQuery, setPointSearchQuery] = useState('');
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointCurrentPage, setPointCurrentPage] = useState(1);
  const pointPageSize = 10;

  const [myReferralPoints, setMyReferralPoints] = useState<number>(0);

  // 1. Load i-Point Balance from DB (Branch Common Balance + User Referral Points)
  const loadBalance = useCallback(async () => {
    if (!targetBranchId) return;
    setBalanceLoading(true);
    try {
      // 1. Fetch current user's earned/referral points from users table
      let userPoints = 0;
      if (profile?.id) {
        const { data: userData } = await supabase
          .from('users')
          .select('points')
          .eq('id', profile.id)
          .maybeSingle();
        if (userData && typeof userData.points === 'number') {
          userPoints = userData.points;
        }
      }
      setMyReferralPoints(userPoints);

      // 2. Fetch total actual charges from academy_sms_charge_logs
      const { data: chargeRows } = await supabase
        .from('academy_sms_charge_logs')
        .select('charge_amount, bonus_amount')
        .eq('branch_id', targetBranchId);

      const totalCharged = (chargeRows || []).reduce((acc, cur) => acc + (cur.charge_amount || 0) + (cur.bonus_amount || 0), 0);

      // 3. Fetch total actual SMS deductions from academy_sms_logs
      const { data: smsRows } = await supabase
        .from('academy_sms_logs')
        .select('cost, status')
        .eq('branch_id', targetBranchId);

      const totalUsed = (smsRows || []).filter((s: any) => s.status === 'success').reduce((acc, cur) => acc + (cur.cost || 0), 0);

      // 4. Branch Common Balance = total charged - total used
      const computedBal = totalCharged - totalUsed;

      // 5. Update or insert into academy_sms_balances to keep ledger synchronized
      await supabase
        .from('academy_sms_balances')
        .upsert([{
          branch_id: targetBranchId,
          point_balance: computedBal,
          total_charged: totalCharged,
          total_used: totalUsed,
          updated_at: new Date().toISOString()
        }]);

      setPointBalance(computedBal);
    } catch (err) {
      console.error('Failed to load SMS balance from DB:', err);
    } finally {
      setBalanceLoading(false);
    }
  }, [targetBranchId, profile?.id]);

  // Convert Personal Referral Points to Branch i-Point
  const handleConvertPoints = async () => {
    if (!profile?.id) {
      alert('로그인 정보가 확인되지 않습니다.');
      return;
    }
    if (myReferralPoints <= 0) {
      alert('전환 가능한 개인 추천 리워드 포인트가 없습니다.');
      return;
    }
    if (!targetBranchId) {
      alert('소속 지점이 확인되지 않습니다.');
      return;
    }

    const inputVal = window.prompt(
      `[개인 추천 리워드 ➔ 학원 공용 i-Point 전환]\n- 현재 보유 개인 리워드: ${myReferralPoints.toLocaleString()} P\n\n학원 공용 문자 포인트로 전환할 금액을 입력해 주세요:`,
      String(myReferralPoints)
    );
    if (!inputVal) return;

    const amountToConvert = parseInt(inputVal.replace(/[^0-9]/g, ''), 10);
    if (isNaN(amountToConvert) || amountToConvert <= 0) {
      alert('올바른 전환 포인트를 입력해 주세요.');
      return;
    }
    if (amountToConvert > myReferralPoints) {
      alert(`보유 중인 개인 리워드(${myReferralPoints.toLocaleString()} P)를 초과하여 전환할 수 없습니다.`);
      return;
    }

    try {
      setBalanceLoading(true);
      // 1. Deduct from users.points
      const { error: userErr } = await supabase
        .from('users')
        .update({ points: myReferralPoints - amountToConvert })
        .eq('id', profile.id);
      if (userErr) throw userErr;

      // 2. Insert into point_logs
      await supabase
        .from('point_logs')
        .insert([{
          user_id: profile.id,
          amount: -amountToConvert,
          reason: '학원 문자 i-Point 전환',
          type: 'use'
        }]);

      // 3. Insert into academy_sms_charge_logs (with payment_method: 'POINT_CONVERT')
      await supabase
        .from('academy_sms_charge_logs')
        .insert([{
          branch_id: targetBranchId,
          charge_amount: amountToConvert,
          bonus_amount: 0,
          prev_balance: pointBalance,
          after_balance: pointBalance + amountToConvert,
          payment_method: 'POINT_CONVERT',
          status: 'success'
        }]);

      await loadBalance();
      await loadPointTransactions();
      alert(`🎉 개인 리워드 ${amountToConvert.toLocaleString()} P가 학원 공용 i-Point로 성공적으로 전환되었습니다!`);
    } catch (err: any) {
      alert(`포인트 전환 실패: ${err.message}`);
    } finally {
      setBalanceLoading(false);
    }
  };

  // 2. Load SMS Logs (History & Reserved) from DB
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      let query = supabase
        .from('academy_sms_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (targetBranchId) {
        query = query.eq('branch_id', targetBranchId);
      }

      const { data, error } = await query;
      if (!error && data) {
        setLogs(data as SmsLog[]);
      }
    } catch (err) {
      console.error('Failed to load SMS logs from DB:', err);
    } finally {
      setLogsLoading(false);
    }
  }, [targetBranchId]);

  // 3. Load Templates from DB
  const loadTemplates = useCallback(async () => {
    try {
      let query = supabase.from('academy_sms_templates').select('*');
      if (targetBranchId) {
        query = query.or(`branch_id.eq.${targetBranchId},branch_id.is.null`);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        setTemplates(data as SmsTemplate[]);
      } else {
        setTemplates(DEFAULT_TEMPLATES);
      }
    } catch (err) {
      console.warn('Using default templates', err);
    }
  }, [targetBranchId]);

  // 4. Fetch Students & Classes from DB
  const loadStudentsData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('academy_students').select(`
        id,
        child_id,
        student_name,
        mother_phone,
        father_phone,
        student_phone,
        attendance_code,
        branch_id,
        academy_student_classes(
          class_schedules(target_class)
        )
      `);

      if (targetBranchId) {
        query = query.eq('branch_id', targetBranchId);
      }

      const { data, error } = await query;
      if (!error && data) {
        const schedulesByChild = await loadActiveAppSchedulesByChild(
          data.map((item: any) => item.child_id).filter(Boolean),
        );
        const mappedStudents: Student[] = data.map((item: any) => {
          const classNames = item.child_id
            ? (schedulesByChild.get(item.child_id) || []).map((schedule) => schedule.target_class)
            : (item.academy_student_classes || [])
                .map((assignment: any) => assignment.class_schedules?.target_class)
                .filter(Boolean);
          return {
            id: item.id,
            student_name: item.student_name,
            mother_phone: item.mother_phone,
            father_phone: item.father_phone,
            student_phone: item.student_phone,
            attendance_code: item.attendance_code,
            target_class: classNames[0] || '일반수강',
            target_classes: classNames,
          };
        });

        setStudents(mappedStudents);

        // Extract unique classes
        const classSet = new Set<string>();
        mappedStudents.forEach(s => {
          (s.target_classes?.length ? s.target_classes : [s.target_class]).forEach((className) => {
            if (className) classSet.add(className);
          });
        });
        setClasses(Array.from(classSet));
      }
    } catch (err) {
      console.error('Failed to load students for SMS tab:', err);
    } finally {
      setLoading(false);
    }
  }, [targetBranchId]);

  // 5. Load Point Transactions (Unified Ledger: Charges + SMS Deductions + Referral point_logs + Refunds)
  const loadPointTransactions = useCallback(async () => {
    setPointsLoading(true);
    try {
      const items: PointTransaction[] = [];

      // 1. Fetch Charge Logs
      let chargeQuery = supabase
        .from('academy_sms_charge_logs')
        .select('*')
        .order('created_at', { ascending: false });
      if (targetBranchId) {
        chargeQuery = chargeQuery.eq('branch_id', targetBranchId);
      }
      const { data: chargeData } = await chargeQuery;
      if (chargeData) {
        chargeData.forEach((c: any) => {
          const isConvert = c.payment_method === 'POINT_CONVERT';
          const methodLabel = c.payment_method === 'CARD' ? '신용/체크카드' : c.payment_method === 'BANK' ? '계좌이체' : c.payment_method === 'VBANK' ? '가상계좌' : c.payment_method;
          items.push({
            id: `charge-${c.id}`,
            type: isConvert ? 'convert' : 'charge',
            title: isConvert ? '학원 공용 i-Point 전환 입금' : 'i-Point 충전',
            detail: isConvert 
              ? `개인 추천 리워드 전환 입금 (+${c.charge_amount?.toLocaleString()}P)`
              : `${methodLabel || '간편결제/신용카드'} (충전 +${c.charge_amount?.toLocaleString()}P${c.bonus_amount ? `, 보너스 +${c.bonus_amount?.toLocaleString()}P` : ''})`,
            amount: (c.charge_amount || 0) + (c.bonus_amount || 0),
            balanceAfter: c.after_balance,
            createdAt: c.created_at
          });
        });
      }

      // 2. Fetch SMS Logs
      let smsQuery = supabase
        .from('academy_sms_logs')
        .select('*')
        .order('sent_at', { ascending: false });
      if (targetBranchId) {
        smsQuery = smsQuery.eq('branch_id', targetBranchId);
      }
      const { data: smsData } = await smsQuery;
      if (smsData) {
        smsData.forEach((s: any) => {
          if (s.status === 'success') {
            items.push({
              id: `sms-${s.id}`,
              type: 'sms',
              title: `문자 발송 차감 (${s.type || 'SMS'})`,
              detail: `수신: ${s.receiver_name} (${s.receiver_phone}) - ${s.content?.slice(0, 35)}...`,
              amount: -(s.cost || 20),
              balanceAfter: null,
              createdAt: s.sent_at || s.created_at
            });
          } else if (s.status === 'cancelled') {
            items.push({
              id: `refund-${s.id}`,
              type: 'refund',
              title: '예약 발송 취소 환불',
              detail: `수신: ${s.receiver_name} (${s.receiver_phone}) 예약 취소 자동 환불`,
              amount: s.cost || 20,
              balanceAfter: null,
              createdAt: s.created_at || s.sent_at
            });
          }
        });
      }

      // 3. Fetch Referral point_logs (Both reward earnings and conversion withdrawals)
      let pointLogsQuery = supabase
        .from('point_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (profile?.id) {
        pointLogsQuery = pointLogsQuery.eq('user_id', profile.id);
      }

      const { data: pointLogsData } = await pointLogsQuery;
      if (pointLogsData) {
        pointLogsData.forEach((p: any) => {
          if ((p.amount || 0) < 0) {
            items.push({
              id: `referral-out-${p.id}`,
              type: 'convert',
              title: '개인 리워드 ➔ 학원 전환 출금',
              detail: `${p.reason || '학원 문자 i-Point로 전환'} (개인 지갑 ${p.amount?.toLocaleString()}P 차감)`,
              amount: p.amount,
              balanceAfter: null,
              createdAt: p.created_at
            });
          } else {
            items.push({
              id: `referral-${p.id}`,
              type: 'referral',
              title: '추천인 / 이벤트 적립',
              detail: p.reason || '신규 학부모/원생 가입 추천 보상 리워드',
              amount: p.amount || 0,
              balanceAfter: null,
              createdAt: p.created_at
            });
          }
        });
      }

      // Sort combined array by createdAt desc
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPointTransactions(items);
    } catch (err) {
      console.error('Failed to load point transactions:', err);
    } finally {
      setPointsLoading(false);
    }
  }, [targetBranchId, profile?.id]);

  useEffect(() => {
    loadBalance();
    loadLogs();
    loadTemplates();
    loadStudentsData();
    loadPointTransactions();
  }, [loadBalance, loadLogs, loadTemplates, loadStudentsData, loadPointTransactions]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      const matchesClass = selectedClass === 'all' || (student.target_classes || [student.target_class]).includes(selectedClass);
      const query = searchQuery.toLowerCase().trim();
      const matchesQuery = !query || 
        student.student_name.toLowerCase().includes(query) ||
        (student.mother_phone && student.mother_phone.includes(query)) ||
        (student.father_phone && student.father_phone.includes(query)) ||
        (student.student_phone && student.student_phone.includes(query));
      return matchesClass && matchesQuery;
    });
  }, [students, selectedClass, searchQuery]);

  // Filtered Point Transactions
  const filteredPointTransactions = useMemo(() => {
    return pointTransactions.filter(item => {
      const matchesFilter = pointFilter === 'all' || item.type === pointFilter;
      const query = pointSearchQuery.toLowerCase().trim();
      const matchesQuery = !query || 
        item.title.toLowerCase().includes(query) ||
        item.detail.toLowerCase().includes(query);
      return matchesFilter && matchesQuery;
    });
  }, [pointTransactions, pointFilter, pointSearchQuery]);

  const totalChargedSum = useMemo(() => {
    return pointTransactions.filter(t => t.type === 'charge').reduce((acc, cur) => acc + cur.amount, 0);
  }, [pointTransactions]);

  const totalUsedSum = useMemo(() => {
    return pointTransactions.filter(t => t.type === 'sms').reduce((acc, cur) => acc + Math.abs(cur.amount), 0);
  }, [pointTransactions]);

  const totalReferralSum = useMemo(() => {
    return pointTransactions.filter(t => t.type === 'referral').reduce((acc, cur) => acc + cur.amount, 0);
  }, [pointTransactions]);

  const pointTotalPages = Math.ceil(filteredPointTransactions.length / pointPageSize) || 1;
  const paginatedPointTransactions = filteredPointTransactions.slice((pointCurrentPage - 1) * pointPageSize, pointCurrentPage * pointPageSize);

  // Table Select All / Deselect All
  const handleToggleSelectAll = () => {
    if (selectedStudentIds.size === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(filteredStudents.map(s => s.id)));
    }
  };

  const handleToggleStudent = (id: string) => {
    const next = new Set(selectedStudentIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStudentIds(next);
  };

  // Add numbers of selected students to recipients
  const handleAddRecipients = (type: 'mother' | 'father' | 'student' | 'all') => {
    const selected = filteredStudents.filter(s => selectedStudentIds.has(s.id));
    if (selected.length === 0) {
      alert('학생 목록에서 먼저 학생을 1명 이상 체크박스로 선택해 주세요!');
      return;
    }

    const newRecipients: Recipient[] = [...recipients];
    const existingPhones = new Set(recipients.map(r => r.phone.replace(/[^0-9]/g, '')));

    let addedCount = 0;

    selected.forEach(s => {
      if ((type === 'mother' || type === 'all') && s.mother_phone) {
        const clean = s.mother_phone.replace(/[^0-9]/g, '');
        if (clean && !existingPhones.has(clean)) {
          newRecipients.push({
            id: `rec-${s.id}-mother-${Date.now()}-${Math.random()}`,
            studentId: s.id,
            studentName: s.student_name,
            relation: '어머니',
            phone: s.mother_phone
          });
          existingPhones.add(clean);
          addedCount++;
        }
      }

      if ((type === 'father' || type === 'all') && s.father_phone) {
        const clean = s.father_phone.replace(/[^0-9]/g, '');
        if (clean && !existingPhones.has(clean)) {
          newRecipients.push({
            id: `rec-${s.id}-father-${Date.now()}-${Math.random()}`,
            studentId: s.id,
            studentName: s.student_name,
            relation: '아버지',
            phone: s.father_phone
          });
          existingPhones.add(clean);
          addedCount++;
        }
      }

      if ((type === 'student' || type === 'all') && s.student_phone) {
        const clean = s.student_phone.replace(/[^0-9]/g, '');
        if (clean && !existingPhones.has(clean)) {
          newRecipients.push({
            id: `rec-${s.id}-student-${Date.now()}-${Math.random()}`,
            studentId: s.id,
            studentName: s.student_name,
            relation: '학생',
            phone: s.student_phone
          });
          existingPhones.add(clean);
          addedCount++;
        }
      }
    });

    setRecipients(newRecipients);
    if (addedCount > 0) {
      alert(`선택한 원생 중 연락처가 등록된 ${addedCount}건의 번호를 수신대상에 추가했습니다.`);
    } else {
      alert('선택한 원생에 등록된 해당 연락처가 없거나 이미 수신대상에 모두 추가되어 있습니다.');
    }
  };

  // Add manual phone
  const handleAddManualPhone = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    if (!manualPhoneInput.trim()) return;

    const clean = manualPhoneInput.trim();
    if (clean.length < 8) {
      alert('올바른 전화번호를 입력해 주세요.');
      return;
    }

    setRecipients(prev => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        studentName: '직접입력',
        relation: '직접입력',
        phone: clean
      }
    ]);
    setManualPhoneInput('');
  };

  const handleRemoveRecipient = (id: string) => {
    setRecipients(prev => prev.filter(r => r.id !== id));
  };

  const handleClearAllRecipients = () => {
    if (window.confirm('수신 대상 목록을 모두 비우시겠습니까?')) {
      setRecipients([]);
    }
  };

  // Byte calculation (Korean = 2 bytes, ASCII = 1 byte)
  const byteCount = useMemo(() => {
    let bytes = 0;
    for (let i = 0; i < messageContent.length; i++) {
      const charCode = messageContent.charCodeAt(i);
      bytes += charCode > 127 ? 2 : 1;
    }
    return bytes;
  }, [messageContent]);

  const isLms = byteCount > 90 || Boolean(attachedImage);
  const costPerMsg = attachedImage ? 150 : isLms ? 50 : 20; // MMS: 150, LMS: 50, SMS: 20
  const totalCost = recipients.length * costPerMsg;

  // Real DB Charge Action via KSPay Web Service
  const handleSimulateCharge = async () => {
    if (!targetBranchId) {
      alert('소속 지점 정보가 확인되지 않습니다.');
      return;
    }

    setChargeLoading(true);
    try {
      await KSPayWebService.openPaymentWindow(
        {
          branchId: targetBranchId,
          userId: profile?.id,
          userName: profile?.name || '학원장',
          amount: chargeAmount,
          goodName: `iPoint ${chargeAmount.toLocaleString()}P`,
          paymentMethod: selectedPayMethod
        },
        async (result) => {
          setShowChargeModal(false);
          await loadBalance();
          await loadPointTransactions();
          alert(`🎉 ${result.amount.toLocaleString()} P (보너스 +${result.bonusAmount.toLocaleString()}P)가 성공적으로 충전되었습니다!\n- 결제수단: ${result.paymentMethod === 'CARD' ? '신용카드' : result.paymentMethod === 'BANK' ? '계좌이체' : '가상계좌'}\n- 주문번호: ${result.orderNumber}`);
        },
        (errMsg?: string) => {
          setChargeLoading(false);
          alert(errMsg || '❌ 결제가 취소되었거나 정상적으로 완료되지 않았습니다.');
        }
      );
    } catch (err: any) {
      alert(`i-Point 충전 중 에러 발생: ${err.message}`);
    } finally {
      setChargeLoading(false);
    }
  };

  // Real DB Send Message Action (실시간 차감 및 로그 저장)
  const handleSendMessage = async () => {
    if (recipients.length === 0) {
      alert('문자를 수신할 대상을 1명 이상 추가해 주세요!');
      return;
    }

    if (!messageContent.trim()) {
      alert('보내실 문자 메시지 내용을 입력해 주세요!');
      return;
    }

    if (pointBalance < totalCost) {
      alert(`보유 i-Point가 부족합니다.\n- 필요 포인트: ${totalCost.toLocaleString()} P\n- 현재 잔액: ${pointBalance.toLocaleString()} P\n상단의 [i-Point 충전] 버튼을 눌러 충전해 주세요!`);
      setShowChargeModal(true);
      return;
    }

    const confirmText = isReserved 
      ? `[예약 발송 확인]\n- 예약 일시: ${reserveDate} ${reserveHour}:${reserveMinute}\n- 수신 인원: ${recipients.length}명\n- 차감 예정 포인트: ${totalCost.toLocaleString()} P\n\n문자 예약을 등록하시겠습니까?`
      : `[즉시 발송 확인]\n- 수신 인원: ${recipients.length}명\n- 차감 포인트: ${totalCost.toLocaleString()} P (${isLms ? 'LMS 장문' : 'SMS 단문'})\n\n메시지를 지금 즉시 발송하시겠습니까?`;

    if (!window.confirm(confirmText)) return;

    setSending(true);

    try {
      // 1. Batch insert into academy_sms_logs in DB
      const logRows = recipients.map(r => ({
        branch_id: targetBranchId,
        type: attachedImage ? 'MMS' : isLms ? 'LMS' : 'SMS',
        sender_phone: '02-1234-5678',
        receiver_name: `${r.studentName} (${r.relation})`,
        receiver_phone: r.phone,
        content: messageContent,
        cost: costPerMsg,
        status: isReserved ? 'reserved' : 'success',
        sent_at: isReserved ? null : new Date().toISOString(),
        reserved_at: isReserved ? `${reserveDate}T${reserveHour}:${reserveMinute}:00` : null
      }));

      const { error: logError } = await supabase
        .from('academy_sms_logs')
        .insert(logRows);

      if (logError) console.warn('Sms log insert warning', logError);

      await loadBalance();
      await loadLogs();
      await loadPointTransactions();

      alert(isReserved 
        ? `✅ 총 ${recipients.length}명의 수신 대상에게 ${reserveDate} ${reserveHour}:${reserveMinute} 예약 발송이 성공적으로 등록되었습니다!` 
        : `✅ 총 ${recipients.length}명에게 성공적으로 문자(알림톡) 발송을 완료했습니다! (${totalCost.toLocaleString()} P 차감)`
      );

      // Reset
      setMessageContent('');
      setAttachedImage(null);
      setIsReserved(false);
    } catch (err: any) {
      alert(`문자 발송 처리 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  // Real DB Cancel reservation
  const handleCancelReservation = async (id: string, cost: number) => {
    if (!window.confirm('해당 예약 발송을 취소하시겠습니까?\n취소 시 차감된 i-Point는 즉시 환불됩니다.')) return;
    
    try {
      // 1. Update status to cancelled in DB
      await supabase
        .from('academy_sms_logs')
        .update({ status: 'cancelled' })
        .eq('id', id);

      await loadBalance();
      await loadLogs();
      await loadPointTransactions();
      alert('예약이 성공적으로 취소되었습니다.');
    } catch (err: any) {
      alert(`예약 취소 실패: ${err.message}`);
    }
  };

  // Real DB Save new template
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateTitle.trim() || !newTemplateContent.trim()) return;

    try {
      await supabase
        .from('academy_sms_templates')
        .insert([{
          branch_id: targetBranchId,
          title: newTemplateTitle.trim(),
          category: '자주쓰는문구',
          content: newTemplateContent.trim()
        }]);

      loadTemplates();
      setNewTemplateTitle('');
      setNewTemplateContent('');
      alert('새 템플릿이 성공적으로 저장되었습니다!');
    } catch (err: any) {
      alert(`템플릿 저장 실패: ${err.message}`);
    }
  };

  // Apply template
  const applyTemplate = (tpl: SmsTemplate) => {
    setMessageContent(tpl.content);
    setShowTemplateModal(false);
  };

  // Pagination state for students table
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.ceil(filteredStudents.length / pageSize) || 1;
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-4">
      
      {/* Ultra-Slim & Compact Top Header Bar (No Scroll Needed!) */}
      <div className="bg-white px-5 py-3.5 rounded-2xl ring-1 ring-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Smartphone className="w-5 h-5 text-blue-600 shrink-0" />
          <div>
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
              등하원 문자 및 카카오 알림톡 관리
              <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                실시간 연동
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
              원생 및 학부모님께 출결 알림, 공지사항을 대량/개별 발송하고 예약 내역을 관리합니다.
            </p>
          </div>
        </div>

        {/* Right i-Point Balance Indicator */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
          {/* 1. Branch Common i-Point */}
          <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-[11.5px] font-bold text-slate-500">i-Point 잔액:</span>
            <span className="text-xs font-black text-blue-600 font-mono">
              {balanceLoading ? '조회중...' : `${pointBalance.toLocaleString()} P`}
            </span>
            <button
              onClick={() => setShowChargeModal(true)}
              className="ml-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10.5px] px-2 py-0.5 rounded-lg shadow-2xs transition"
            >
              i-Point 충전 +
            </button>
          </div>

          {/* 2. Personal Referral Points */}
          <div className="bg-purple-50/80 border border-purple-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
            <Gift className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            <span className="text-[11.5px] font-bold text-purple-700">내 리워드:</span>
            <span className="text-xs font-black text-purple-900 font-mono">
              {myReferralPoints.toLocaleString()} P
            </span>
            {myReferralPoints > 0 && (
              <button
                onClick={handleConvertPoints}
                className="ml-0.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-[10.5px] px-2 py-0.5 rounded-lg shadow-2xs transition flex items-center gap-0.5"
                title="개인 추천 리워드를 학원 문자 i-Point로 전환"
              >
                전환 ➔
              </button>
            )}
          </div>
        </div>
      </div>

      {/* VIEW 1: SMS 보내기 (Split View: Left Student Table + Right Smartphone Mockup) */}
      {currentSubTab === 'sms_send' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          
          {/* LEFT: Student Selection Table & Guide Footer (Compact High-Density) */}
          <div className="lg:col-span-7 bg-white p-4 rounded-2xl ring-1 ring-slate-200 space-y-2.5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  👥 수신 대상 원생 선택
                </h3>
                <p className="text-[10.5px] text-slate-400">
                  체크박스로 학생을 선택하고 하단 버튼으로 번호를 우측 발송함에 담아주세요.
                </p>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedClass}
                onChange={(e) => { setSelectedClass(e.target.value); setCurrentPage(1); }}
                className="bg-slate-100 px-2.5 py-1.5 rounded-lg text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">수업 전체 ({students.length}명)</option>
                {classes.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                <input
                  type="text"
                  placeholder="원생 이름, 전화번호 검색..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="w-full bg-slate-100 pl-7 pr-3 py-1.5 rounded-lg text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Student Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr className="whitespace-nowrap text-[11px]">
                    <th className="p-2 text-center w-7">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.size > 0 && selectedStudentIds.size === filteredStudents.length}
                        onChange={handleToggleSelectAll}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="p-2 text-center w-7">No.</th>
                    <th className="p-2">수업</th>
                    <th className="p-2 font-extrabold text-slate-900">이름</th>
                    <th className="p-2">어머니 번호</th>
                    <th className="p-2">아버지 번호</th>
                    <th className="p-2">학생 번호</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600 text-[11.5px]">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-400 font-bold">
                        <RefreshCw className="animate-spin text-blue-500 mx-auto mb-1.5" size={16} />
                        원생 목록을 불러오는 중입니다...
                      </td>
                    </tr>
                  ) : paginatedStudents.length > 0 ? (
                    paginatedStudents.map((s, idx) => {
                      const isChecked = selectedStudentIds.has(s.id);
                      return (
                        <tr 
                          key={s.id} 
                          onClick={() => handleToggleStudent(s.id)}
                          className={`hover:bg-blue-50/40 cursor-pointer transition ${isChecked ? 'bg-blue-50/60' : ''}`}
                        >
                          <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleStudent(s.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-2 text-center text-slate-400 font-mono text-[10.5px]">
                            {(currentPage - 1) * pageSize + idx + 1}
                          </td>
                          <td className="p-2 font-semibold text-slate-800 whitespace-nowrap">
                            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                              {(s.target_classes?.length ? s.target_classes.join(', ') : s.target_class) || '일반'}
                            </span>
                          </td>
                          <td className="p-2 font-black text-slate-900 whitespace-nowrap">
                            {s.student_name}
                          </td>
                          <td className="p-2 font-mono whitespace-nowrap text-slate-700 text-[11px]">
                            {s.mother_phone || <span className="text-slate-300">-</span>}
                          </td>
                          <td className="p-2 font-mono whitespace-nowrap text-slate-700 text-[11px]">
                            {s.father_phone || <span className="text-slate-300">-</span>}
                          </td>
                          <td className="p-2 font-mono whitespace-nowrap text-slate-700 text-[11px]">
                            {s.student_phone || <span className="text-slate-300">-</span>}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400 font-bold">
                        조회된 학생이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Bottom: Selection Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-600">
                  선택 학생: <b className="text-blue-600">{selectedStudentIds.size}명</b>
                </span>
                {selectedStudentIds.size > 0 && (
                  <button 
                    onClick={() => setSelectedStudentIds(new Set())}
                    className="text-[10px] text-slate-400 hover:text-slate-700 underline font-semibold ml-1"
                  >
                    해제
                  </button>
                )}
              </div>

              {/* Action Buttons to Add to Recipient List */}
              <div className="flex flex-wrap items-center gap-1">
                <button
                  onClick={() => handleAddRecipients('mother')}
                  disabled={selectedStudentIds.size === 0}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-2 py-1 rounded-lg text-[10.5px] font-black disabled:opacity-40 transition"
                >
                  + 어머니 번호
                </button>
                <button
                  onClick={() => handleAddRecipients('father')}
                  disabled={selectedStudentIds.size === 0}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-2 py-1 rounded-lg text-[10.5px] font-black disabled:opacity-40 transition"
                >
                  + 아버지 번호
                </button>
                <button
                  onClick={() => handleAddRecipients('student')}
                  disabled={selectedStudentIds.size === 0}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-2 py-1 rounded-lg text-[10.5px] font-black disabled:opacity-40 transition"
                >
                  + 학생 번호
                </button>
                <button
                  onClick={() => handleAddRecipients('all')}
                  disabled={selectedStudentIds.size === 0}
                  className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 px-2 py-1 rounded-lg text-[10.5px] font-black disabled:opacity-40 transition"
                >
                  + 전체 추가
                </button>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-0.5">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-30"
                >
                  <ChevronLeft size={12} />
                </button>
                <span className="text-[10.5px] font-bold text-slate-600 font-mono">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-30"
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            )}

            {/* SMS Notice / Guide Card (Exact Match with Reference Image) */}
            <div className="bg-slate-50/90 border border-slate-200 rounded-xl p-3 space-y-1.5 text-[10.5px] text-slate-600 mt-1">
              <div className="flex items-center justify-between font-bold text-slate-800 border-b border-slate-200/60 pb-1">
                <span className="flex items-center gap-1.5 font-black text-slate-900 text-[11px]">
                  <AlertCircle size={13} className="text-blue-600" />
                  SMS 발송안내
                </span>
                <span className="text-[10px] text-slate-400 font-semibold">단문 20P · 장문 50P · 포토 150P</span>
              </div>
              <ul className="space-y-0.5 text-slate-500 list-disc list-inside leading-relaxed text-[10px] font-medium">
                <li>SMS 내용은 <b>최대 90 Byte</b>까지 작성 가능하며, 초과 시 자동으로 <b>LMS(장문)</b>으로 전환됩니다.</li>
                <li>원생 정보에 등록된 <b>어머니, 아버지, 학생 번호</b>를 원클릭으로 우측 전송함에 담을 수 있습니다.</li>
                <li>우측 스마트폰 화면에서 직접 번호를 입력해 추가하거나, 잘못 담긴 수신자를 개별 삭제할 수 있습니다.</li>
                <li><b>⏰ 예약 발송 설정</b>을 통해 원하는 날짜/시간에 자동 발송되며, 발송 전 언제든 취소 및 즉시 환불됩니다.</li>
                <li><b>자주 쓰는 문자</b>에 등하원/수강료/휴원 등 반복 공지를 저장하여 다음 발송 시 1초 만에 불러올 수 있습니다.</li>
              </ul>
            </div>
          </div>

          {/* RIGHT: Large Prominent Smartphone Chassis Mockup (Exact Match with Reference Image) */}
          <div className="lg:col-span-5 flex justify-center sticky top-[72px]">
            <div className="w-full max-w-[390px] bg-slate-950 p-4 rounded-[42px] shadow-2xl border-[6px] border-slate-800 relative space-y-2.5">
              
              {/* Speaker / Camera Notch */}
              <div className="w-20 h-3.5 bg-slate-800 rounded-full mx-auto flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-950/90 mr-2" />
                <div className="w-7 h-1 bg-slate-700 rounded-full" />
              </div>

              {/* Inner Smartphone Screen Area */}
              <div className="bg-white rounded-[26px] overflow-hidden flex flex-col min-h-[620px] border border-slate-200 shadow-inner">
                
                {/* 1. TOP SECTION: Recipient Header & Large Scrollable List Box */}
                <div className="bg-slate-50 border-b border-slate-200 flex flex-col">
                  <div className="p-2.5 bg-white border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800">
                      SMS 수신대상 ({recipients.length})명
                    </span>
                    {recipients.length > 0 && (
                      <button
                        onClick={handleClearAllRecipients}
                        className="text-[10px] text-rose-500 hover:text-rose-700 font-bold"
                      >
                        전체 비우기
                      </button>
                    )}
                  </div>

                  {/* Upper Recipient Box (Large & Scrollable to view all registered students) */}
                  <div className="p-2 h-44 overflow-y-auto bg-slate-50/60 divide-y divide-slate-100 space-y-1">
                    {recipients.length > 0 ? (
                      <div className="space-y-1">
                        {recipients.map((r, idx) => (
                          <div 
                            key={r.id}
                            className="flex items-center justify-between bg-white border border-slate-200/80 px-2.5 py-1 rounded-lg shadow-2xs hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[9.5px] font-mono text-slate-400 font-bold">{idx + 1}.</span>
                              <span className="text-[11px] font-black text-slate-800 truncate">{r.studentName}</span>
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1 py-0.2 rounded shrink-0">
                                {r.relation}
                              </span>
                              <span className="text-[10.5px] font-mono text-slate-600 truncate">{r.phone}</span>
                            </div>
                            <button 
                              onClick={() => handleRemoveRecipient(r.id)}
                              className="text-slate-400 hover:text-rose-600 ml-1 p-0.5"
                              title="삭제"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 text-[11px] space-y-1 py-6">
                        <p className="font-semibold">수신 대상이 비어있습니다.</p>
                        <p className="text-[10px] text-slate-300">👈 좌측 명부에서 학생 연락처를 담아주세요.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. MIDDLE SECTION: Manual Direct Phone Input Bar */}
                <div className="border-t border-b border-slate-200 bg-white">
                  <div className="flex items-center">
                    <input
                      type="text"
                      placeholder="수동으로 번호를 입력하세요."
                      value={manualPhoneInput}
                      onChange={(e) => setManualPhoneInput(e.target.value)}
                      onKeyDown={handleAddManualPhone}
                      className="flex-1 text-[11px] px-3 py-2 bg-transparent border-none outline-none font-medium text-slate-800 placeholder-slate-400"
                    />
                    <button
                      onClick={handleAddManualPhone}
                      className="border-l border-slate-200 px-3 py-2 text-slate-600 hover:text-slate-900 text-[11px] font-black bg-slate-50 hover:bg-slate-100 shrink-0 transition"
                    >
                      번호 입력
                    </button>
                  </div>

                  {/* SMS (단문/장문) Status Bar with Replacement Tag Buttons */}
                  <div className="px-3 py-1.5 bg-slate-100/70 border-t border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10.5px] font-black text-slate-800">
                        {attachedImage ? 'MMS (포토)' : isLms ? 'LMS (장문)' : 'SMS (단문)'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({byteCount} / 90 Byte)
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setMessageContent(prev => prev + '{학원명}')}
                        className="text-[10px] font-bold bg-white border border-slate-200 hover:bg-blue-50 text-slate-600 hover:text-blue-600 px-2 py-0.5 rounded shadow-2xs"
                      >
                        학원명
                      </button>
                      <button
                        onClick={() => setMessageContent(prev => prev + '{이름}')}
                        className="text-[10px] font-bold bg-white border border-slate-200 hover:bg-blue-50 text-slate-600 hover:text-blue-600 px-2 py-0.5 rounded shadow-2xs"
                      >
                        이름
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. LOWER SECTION: Message Body Textarea */}
                <div className="p-3 flex-1 flex flex-col bg-white">
                  <textarea
                    rows={6}
                    placeholder="발송할 공지 또는 안내 문자 내용을 입력하세요.&#10;&#10;예: [아이패스케어] 안녕하세요 학부모님. 금일 수업 출결 및 안내사항입니다."
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    className="w-full flex-1 p-2 text-xs text-slate-800 leading-relaxed border-none outline-none resize-none font-medium placeholder-slate-300"
                  />
                </div>

                {/* 4. ATTACHMENT & RESERVATION CONTROLS ROW */}
                <div className="p-2.5 bg-slate-50 border-t border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <label className="flex items-center gap-1 cursor-pointer font-bold hover:text-slate-900">
                      <Paperclip size={12} className="text-slate-400" />
                      <span>첨부</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setAttachedImage(URL.createObjectURL(e.target.files[0]));
                            alert('이미지 1건이 첨부되었습니다. (MMS 요금 적용)');
                          }
                        }}
                      />
                    </label>

                    {attachedImage && (
                      <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded">
                        이미지 첨부됨
                        <button onClick={() => setAttachedImage(null)} className="ml-1 text-rose-500">×</button>
                      </span>
                    )}

                    <span className="text-[10px] text-slate-500 font-mono">
                      건당 {costPerMsg}P · 총 <b className="text-slate-900 font-bold">{totalCost.toLocaleString()} P</b>
                    </span>
                  </div>

                  {/* Reservation Inline Bar */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200/60">
                    <label className="flex items-center gap-1 cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={isReserved}
                        onChange={(e) => setIsReserved(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                      />
                      <span className="text-[10.5px] font-bold text-slate-700">예약</span>
                    </label>

                    {isReserved ? (
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          type="date"
                          value={reserveDate}
                          onChange={(e) => setReserveDate(e.target.value)}
                          className="bg-white px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-200 flex-1"
                        />
                        <select 
                          value={reserveHour} 
                          onChange={(e) => setReserveHour(e.target.value)}
                          className="bg-white px-1 py-0.5 rounded text-[10px] font-bold border border-slate-200"
                        >
                          {Array.from({ length: 24 }).map((_, i) => (
                            <option key={i} value={String(i).padStart(2, '0')}>{String(i).padStart(2, '0')}시</option>
                          ))}
                        </select>
                        <select 
                          value={reserveMinute} 
                          onChange={(e) => setReserveMinute(e.target.value)}
                          className="bg-white px-1 py-0.5 rounded text-[10px] font-bold border border-slate-200"
                        >
                          <option value="00">00분</option>
                          <option value="15">15분</option>
                          <option value="30">30분</option>
                          <option value="45">45분</option>
                        </select>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium">즉시 발송 (체크 시 예약 발송)</span>
                    )}
                  </div>
                </div>

                {/* 5. BOTTOM BUTTONS (Matching Reference: White [자주 쓰는 문자] + Emerald Green [SMS 발송]) */}
                <div className="p-3 bg-slate-900 border-t border-slate-800 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowTemplateModal(true)}
                    className="bg-white hover:bg-slate-50 text-emerald-600 border border-emerald-500 font-extrabold text-xs py-3 rounded-xl transition shadow-xs flex items-center justify-center gap-1"
                  >
                    자주 쓰는 문자
                  </button>

                  <button
                    onClick={handleSendMessage}
                    disabled={sending}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs py-3 rounded-xl transition shadow-md flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {sending ? <RefreshCw className="animate-spin" size={14} /> : <Send size={14} />}
                    {isReserved ? '예약 등록' : 'SMS 발송'}
                  </button>
                </div>

              </div>

            </div>
          </div>

        </div>
      )}

      {/* VIEW 2: 메시지 발송내역 (Sms History) */}
      {currentSubTab === 'sms_history' && (
        <div className="bg-white p-5 rounded-2xl ring-1 ring-slate-200 space-y-3.5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                📋 메시지 실시간 발송내역
              </h3>
              <p className="text-[11px] text-slate-400">
                학원 관리자 및 시스템에서 발송 완료된 SMS / 알림톡 성공 및 실패 내역을 조회합니다.
              </p>
            </div>
            <button
              onClick={loadLogs}
              className="flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 self-start sm:self-center"
            >
              <RefreshCw size={12} className={logsLoading ? 'animate-spin' : ''} /> 새로고침
            </button>
          </div>

          {/* Logs Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                <tr className="whitespace-nowrap">
                  <th className="p-2.5 text-center">발송일시</th>
                  <th className="p-2.5 text-center">구분</th>
                  <th className="p-2.5">수신 대상 (원생)</th>
                  <th className="p-2.5">수신 번호</th>
                  <th className="p-2.5">메시지 본문 요약</th>
                  <th className="p-2.5 text-center">발송 상태</th>
                  <th className="p-2.5 text-right">차감 i-Point</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 text-xs">
                {logsLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 font-bold">
                      <RefreshCw className="animate-spin text-blue-500 mx-auto mb-2" size={18} />
                      발송 내역을 조회 중입니다...
                    </td>
                  </tr>
                ) : logs.filter(l => l.status !== 'reserved').length > 0 ? (
                  logs.filter(l => l.status !== 'reserved').map(log => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="p-2.5 text-center font-mono whitespace-nowrap text-slate-500 text-[11px]">
                        {new Date(log.sent_at).toLocaleString('ko-KR')}
                      </td>
                      <td className="p-2.5 text-center whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          log.type === 'MMS' ? 'bg-purple-50 text-purple-700' : log.type === 'LMS' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                        }`}>
                          {log.type}
                        </span>
                      </td>
                      <td className="p-2.5 font-bold text-slate-900 whitespace-nowrap">
                        {log.receiver_name}
                      </td>
                      <td className="p-2.5 font-mono whitespace-nowrap text-slate-700 text-[11px]">
                        {log.receiver_phone}
                      </td>
                      <td className="p-2.5 max-w-xs truncate text-slate-800 font-medium" title={log.content}>
                        {log.content}
                      </td>
                      <td className="p-2.5 text-center whitespace-nowrap">
                        {log.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold text-[10px]">
                            <CheckCircle2 size={11} /> 발송성공
                          </span>
                        ) : log.status === 'cancelled' ? (
                          <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-bold text-[10px]">
                            예약취소
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full font-bold text-[10px]">
                            <XCircle size={11} /> 전송실패
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                        {log.cost} P
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 font-bold">
                      발송 내역이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: 메시지 예약내역 (Sms Reserved) */}
      {currentSubTab === 'sms_reserved' && (
        <div className="bg-white p-5 rounded-2xl ring-1 ring-slate-200 space-y-3.5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                ⏰ 예약 발송 대기 리스트
              </h3>
              <p className="text-[11px] text-slate-400">
                지정된 일시에 자동 발송되도록 예약된 문자입니다. 취소 시 i-Point가 즉시 자동 환불됩니다.
              </p>
            </div>
            <button
              onClick={loadLogs}
              className="flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 self-start sm:self-center"
            >
              <RefreshCw size={12} className={logsLoading ? 'animate-spin' : ''} /> 새로고침
            </button>
          </div>

          {/* Reserved Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                <tr className="whitespace-nowrap">
                  <th className="p-2.5 text-center">예약 발송 일시</th>
                  <th className="p-2.5 text-center">구분</th>
                  <th className="p-2.5">수신 대상 (원생)</th>
                  <th className="p-2.5">수신 번호</th>
                  <th className="p-2.5">메시지 본문 요약</th>
                  <th className="p-2.5 text-center">상태</th>
                  <th className="p-2.5 text-right">예상 차감</th>
                  <th className="p-2.5 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 text-xs">
                {logsLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400 font-bold">
                      <RefreshCw className="animate-spin text-blue-500 mx-auto mb-2" size={18} />
                      예약 목록을 조회 중입니다...
                    </td>
                  </tr>
                ) : logs.filter(l => l.status === 'reserved').length > 0 ? (
                  logs.filter(l => l.status === 'reserved').map(log => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="p-2.5 text-center font-mono font-black text-blue-600 whitespace-nowrap text-[11px]">
                        {log.reserved_at ? new Date(log.reserved_at).toLocaleString('ko-KR') : '-'}
                      </td>
                      <td className="p-2.5 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 text-blue-700">
                          {log.type}
                        </span>
                      </td>
                      <td className="p-2.5 font-bold text-slate-900 whitespace-nowrap">
                        {log.receiver_name}
                      </td>
                      <td className="p-2.5 font-mono whitespace-nowrap text-slate-700 text-[11px]">
                        {log.receiver_phone}
                      </td>
                      <td className="p-2.5 max-w-xs truncate text-slate-800 font-medium" title={log.content}>
                        {log.content}
                      </td>
                      <td className="p-2.5 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-bold text-[10px]">
                          <Clock size={11} /> 발송 대기중
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                        {log.cost} P
                      </td>
                      <td className="p-2.5 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleCancelReservation(log.id, log.cost)}
                          className="bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded text-[11px] font-bold transition"
                        >
                          예약 취소
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400 font-bold">
                      현재 대기 중인 예약 문자가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 4: 포인트 사용내역 (Sms Points Ledger) */}
      {currentSubTab === 'sms_points' && (
        <div className="space-y-4">
          
          {/* Top 4 KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white p-4 rounded-2xl ring-1 ring-slate-200 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
                <span>학원 공용 i-Point 잔액</span>
                <Wallet className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-black text-blue-600 font-mono">
                  {balanceLoading ? '조회중...' : `${pointBalance.toLocaleString()} P`}
                </span>
                <button
                  onClick={() => setShowChargeModal(true)}
                  className="text-[11px] font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200"
                >
                  + 충전하기
                </button>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl ring-1 ring-slate-200 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
                <span>누적 유료 충전액</span>
                <CreditCard className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                +{totalChargedSum.toLocaleString()} P
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl ring-1 ring-slate-200 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
                <span>누적 문자 발송 차감</span>
                <TrendingDown className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-xl font-black text-rose-600 font-mono">
                -{totalUsedSum.toLocaleString()} P
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl ring-1 ring-slate-200 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
                <span>내 개인 추천 리워드</span>
                <Gift className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-black text-purple-700 font-mono">
                  +{myReferralPoints.toLocaleString()} P
                </span>
                {myReferralPoints > 0 && (
                  <button
                    onClick={handleConvertPoints}
                    className="text-[11px] font-black text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded-lg border border-purple-200 transition"
                    title="개인 추천 리워드를 학원 문자 i-Point로 전환"
                  >
                    전환 ➔
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Main Ledger Card */}
          <div className="bg-white p-5 rounded-2xl ring-1 ring-slate-200 space-y-3.5 shadow-2xs">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                  💳 i-Point 입출금 및 사용내역 원장
                </h3>
                <p className="text-[11px] text-slate-400">
                  학원 유료 충전, 추천인 리워드 적립, 대량 문자 발송 차감 및 환불 내역을 통합 조회합니다.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadPointTransactions}
                  className="flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw size={12} className={pointsLoading ? 'animate-spin' : ''} /> 새로고침
                </button>
              </div>
            </div>

            {/* Filter Chips & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: '전체 내역' },
                  { id: 'charge', label: '포인트 충전' },
                  { id: 'convert', label: '리워드 전환' },
                  { id: 'sms', label: '문자 차감' },
                  { id: 'referral', label: '추천인 적립' },
                  { id: 'refund', label: '예약취소/환불' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => { setPointFilter(tab.id as any); setPointCurrentPage(1); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      pointFilter === tab.id
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                <input
                  type="text"
                  placeholder="내역, 수신자, 상세 검색..."
                  value={pointSearchQuery}
                  onChange={(e) => { setPointSearchQuery(e.target.value); setPointCurrentPage(1); }}
                  className="w-full bg-slate-100 pl-8 pr-3 py-1.5 rounded-xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Transactions Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                  <tr className="whitespace-nowrap">
                    <th className="p-2.5 text-center">거래일시</th>
                    <th className="p-2.5 text-center">구분</th>
                    <th className="p-2.5">거래 항목</th>
                    <th className="p-2.5">상세 내용</th>
                    <th className="p-2.5 text-right">변동 포인트</th>
                    <th className="p-2.5 text-right">거래 후 잔액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600 text-xs">
                  {pointsLoading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400 font-bold">
                        <RefreshCw className="animate-spin text-blue-500 mx-auto mb-2" size={18} />
                        포인트 내역을 조회 중입니다...
                      </td>
                    </tr>
                  ) : paginatedPointTransactions.length > 0 ? (
                    paginatedPointTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-2.5 text-center font-mono whitespace-nowrap text-slate-500 text-[11px]">
                          {new Date(tx.createdAt).toLocaleString('ko-KR')}
                        </td>
                        <td className="p-2.5 text-center whitespace-nowrap">
                          {tx.type === 'charge' ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-black text-[10px]">
                              <CreditCard size={10} /> 포인트 충전
                            </span>
                          ) : tx.type === 'convert' ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-black text-[10px] ${
                              tx.amount > 0 
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}>
                              <RefreshCw size={10} /> {tx.amount > 0 ? '리워드 입금' : '리워드 출금'}
                            </span>
                          ) : tx.type === 'sms' ? (
                            <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-black text-[10px]">
                              <ArrowDownRight size={10} /> 문자 차감
                            </span>
                          ) : tx.type === 'referral' ? (
                            <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-black text-[10px]">
                              <Gift size={10} /> 추천인 적립
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-black text-[10px]">
                              <RotateCcw size={10} /> 예약 취소환불
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 font-black text-slate-900 whitespace-nowrap">
                          {tx.title}
                        </td>
                        <td className="p-2.5 max-w-md truncate text-slate-700 font-medium" title={tx.detail}>
                          {tx.detail}
                        </td>
                        <td className={`p-2.5 text-right font-mono font-black whitespace-nowrap text-xs ${
                          tx.amount > 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {tx.amount > 0 ? `+${tx.amount.toLocaleString()}` : tx.amount.toLocaleString()} P
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-600 font-bold whitespace-nowrap">
                          {tx.balanceAfter !== null && tx.balanceAfter !== undefined ? `${tx.balanceAfter.toLocaleString()} P` : '-'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400 font-bold">
                        조회된 포인트 거래 내역이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pointTotalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-2">
                <button
                  onClick={() => setPointCurrentPage(p => Math.max(1, p - 1))}
                  disabled={pointCurrentPage === 1}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="text-xs font-bold text-slate-600 font-mono">
                  {pointCurrentPage} / {pointTotalPages}
                </span>
                <button
                  onClick={() => setPointCurrentPage(p => Math.min(pointTotalPages, p + 1))}
                  disabled={pointCurrentPage === pointTotalPages}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            )}

          </div>

        </div>
      )}

      {/* MODAL 1: i-Point Recharge Modal */}
      {showChargeModal && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 space-y-5 shadow-2xl border border-slate-100" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Coins className="text-amber-500" />
                i-Point (아이포인트) 간편 충전
              </h3>
              <button onClick={() => setShowChargeModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-600">충전 포인트 선택</label>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setChargeAmount(100)}
                    className={`text-[10px] font-black px-2 py-0.5 rounded-lg border transition ${
                      chargeAmount === 100 
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs' 
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                    title="개발자/대표(admin) 전용 테스트 결제 버튼"
                  >
                    🧪 100원 테스트 결제 (admin 전용)
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { amount: 100000, label: '100,000 P (10만원)', bonus: 'SMS 5,000건 발송 (기본)', tag: '기본' },
                  { amount: 200000, label: '200,000 P (20만원)', bonus: 'SMS 11,000건 (+20,000P 혜택)', tag: '최대혜택' },
                ].map(item => (
                  <button
                    key={item.amount}
                    type="button"
                    onClick={() => setChargeAmount(item.amount)}
                    className={`p-4 rounded-2xl border text-left transition-all relative ${
                      chargeAmount === item.amount 
                        ? 'border-blue-600 bg-blue-50/80 text-blue-900 ring-2 ring-blue-500 shadow-xs' 
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className={`absolute top-2.5 right-2.5 text-[9.5px] font-black px-1.5 py-0.5 rounded-full ${
                      item.amount === 200000 ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
                    }`}>
                      {item.tag}
                    </span>
                    <b className="text-sm block font-black">{item.label}</b>
                    <span className="text-[11px] text-blue-600 font-bold mt-1 block">{item.bonus}</span>
                  </button>
                ))}
              </div>

              {chargeAmount === 100 && (
                <div className="bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl text-center text-xs font-bold text-amber-800 animate-in fade-in">
                  ⚡ [테스트 결제 모드] 100원 결제 승인 테스트가 진행됩니다. 최고 관리자에게만 노출됩니다 (100 P 적립)
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between font-bold">
                <span>현재 보유 잔액:</span>
                <span>{pointBalance.toLocaleString()} P</span>
              </div>
              <div className="flex justify-between font-extrabold text-blue-600">
                <span>충전 후 총 잔액:</span>
                <span>{(pointBalance + chargeAmount + (chargeAmount === 200000 ? 20000 : 0)).toLocaleString()} P</span>
              </div>
            </div>

            {/* Payment Method Selector (신용카드 단일 지정) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600">결제 수단</label>
              <div className="bg-emerald-50/70 border border-emerald-200/80 p-3 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                    <CreditCard size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-900">신용 / 체크카드 간편결제</div>
                    <div className="text-[10px] text-slate-500 font-medium">모든 국내 카드사 안심클릭 / ISP 결제 지원</div>
                  </div>
                </div>
                <span className="text-[10.5px] font-extrabold bg-emerald-600 text-white px-2 py-0.5 rounded-lg shadow-2xs">기본 결제</span>
              </div>
            </div>

            {/* KSNET Security Notice */}
            <div className="flex items-center justify-center gap-1.5 text-[10.5px] text-slate-400 font-semibold bg-slate-50 py-1.5 rounded-xl border border-slate-100">
              <Lock size={12} className="text-emerald-600" />
              <span>KSNET(KSPay) 256-bit 전자결제 시스템 연동</span>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowChargeModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black py-3 rounded-xl text-xs"
              >
                취소
              </button>
              <button
                onClick={handleSimulateCharge}
                disabled={chargeLoading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl text-xs shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {chargeLoading ? <RefreshCw className="animate-spin" size={14} /> : <CreditCard size={14} />}
                {chargeAmount.toLocaleString()}원 결제 충전
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: 자주 쓰는 문자 템플릿 관리 */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white max-w-xl w-full rounded-3xl p-6 space-y-5 shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <BookmarkPlus className="text-blue-600" />
                자주 쓰는 문자 템플릿 보관함
              </h3>
              <button onClick={() => setShowTemplateModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            {/* Template List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {templates.map(tpl => (
                <div key={tpl.id} className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white transition space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {tpl.category}
                      </span>
                      <b className="text-xs font-black text-slate-900">{tpl.title}</b>
                    </div>
                    <button
                      onClick={() => applyTemplate(tpl)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-3 py-1 rounded-lg"
                    >
                      본문에 적용
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-slate-100 leading-relaxed font-medium">
                    {tpl.content}
                  </p>
                </div>
              ))}
            </div>

            {/* New Template Form */}
            <form onSubmit={handleSaveTemplate} className="border-t border-slate-200 pt-3 space-y-2.5">
              <span className="text-xs font-black text-slate-800 block">+ 새 자주 쓰는 문구 등록</span>
              <input
                type="text"
                placeholder="템플릿 제목 (예: 중간고사 대비반 안내)"
                value={newTemplateTitle}
                onChange={(e) => setNewTemplateTitle(e.target.value)}
                className="w-full bg-slate-100 px-3 py-2 rounded-xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <textarea
                rows={2}
                placeholder="템플릿 내용 입력"
                value={newTemplateContent}
                onChange={(e) => setNewTemplateContent(e.target.value)}
                className="w-full bg-slate-100 p-2.5 rounded-xl text-xs font-medium border-none outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                required
              />
              <button
                type="submit"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-black py-2.5 rounded-xl"
              >
                + 템플릿 저장하기
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
