import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { 
  Users, CalendarCheck2, CreditCard, MessageSquare, 
  TrendingUp, Clock, AlertCircle, ArrowRight, RefreshCw, 
  Plus, CheckCircle2, ChevronRight, Bus, Sparkles, Building2, Megaphone, X, Pin, FileText, Loader2
} from 'lucide-react';

interface AdminDashboardTabProps {
  profile?: {
    id: string;
    name: string | null;
    role: string;
    branch_id: string | null;
  } | null;
  activeBranchId: string | null;
  branches: Array<{ id: string; name: string }>;
  onNavigateTab: (mainTab: string, subTab?: string) => void;
}

export const AdminDashboardTab: React.FC<AdminDashboardTabProps> = ({
  profile,
  activeBranchId,
  branches,
  onNavigateTab,
}) => {
  const [loading, setLoading] = useState(true);

  // Raw Database Data
  const [students, setStudents] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [pointBalance, setPointBalance] = useState<number>(0);
  const [hqNotices, setHqNotices] = useState<any[]>([]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // Fetch all live dashboard data
  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const targetBranch = activeBranchId && activeBranchId !== 'all' ? activeBranchId : null;

      // 1. Students Query
      let studentsQuery = supabase
        .from('academy_students')
        .select(`
          id, student_name, admission_date, created_at, branch_id,
          child_id, child:children(deleted_at),
          parent_user_id, parent:users(status)
        `);
      if (targetBranch) studentsQuery = studentsQuery.eq('branch_id', targetBranch);

      // 2. Class Schedules (Active)
      let schedulesQuery = supabase
        .from('class_schedules')
        .select('id, target_class, day_of_week, start_time, end_time, branch_id, max_people')
        .eq('is_active', true)
        .order('start_time', { ascending: true });
      if (targetBranch) schedulesQuery = schedulesQuery.eq('branch_id', targetBranch);

      // 3. Reservations for this month
      let reservationsQuery = supabase
        .from('reservations')
        .select('id, child_id, schedule_id, class_date, status, attendance_status, branch_id')
        .is('deleted_at', null)
        .gte('class_date', `${currentMonthStr}-01`)
        .lte('class_date', `${currentMonthStr}-31`);
      if (targetBranch) reservationsQuery = reservationsQuery.eq('branch_id', targetBranch);

      // 4. Attendance logs for this month
      let logsQuery = supabase
        .from('attendance_logs')
        .select('id, child_id, date, status, check_in, check_out, branch_id')
        .gte('date', `${currentMonthStr}-01`)
        .lte('date', `${currentMonthStr}-31`);
      if (targetBranch) logsQuery = logsQuery.eq('branch_id', targetBranch);

      // 5. Bills for this month
      let billsQuery = supabase
        .from('academy_bills')
        .select('id, student_id, bill_month, amount_due, amount_paid, status, branch_id')
        .eq('bill_month', currentMonthStr);
      if (targetBranch) billsQuery = billsQuery.eq('branch_id', targetBranch);

      // 6. SMS Points Balance
      let smsBalanceQuery = supabase
        .from('academy_sms_balances')
        .select('point_balance, branch_id');
      if (targetBranch) smsBalanceQuery = smsBalanceQuery.eq('branch_id', targetBranch);

      // 7. HQ Notices Query (headquarter_notices table)
      const hqNoticesQuery = supabase
        .from('headquarter_notices')
        .select('*')
        .order('created_at', { ascending: false });

      const [
        studentsRes, schedulesRes, reservationsRes, logsRes, billsRes, smsRes, hqNoticesRes
      ] = await Promise.all([
        studentsQuery, schedulesQuery, reservationsQuery, logsQuery, billsQuery, smsBalanceQuery, hqNoticesQuery
      ]);

      // Filter active students
      const activeStudents = (studentsRes.data || []).filter((s: any) => 
        (!s.child_id || s.child?.deleted_at == null) &&
        (!s.parent_user_id || s.parent?.status !== 'deleted')
      );

      setStudents(activeStudents);
      setSchedules(schedulesRes.data || []);
      setReservations(reservationsRes.data || []);
      setAttendanceLogs(logsRes.data || []);
      setBills(billsRes.data || []);
      
      const loadedHq = hqNoticesRes.data && hqNoticesRes.data.length > 0 ? hqNoticesRes.data : [
        {
          id: 'hq-launch-1',
          title: '📢 [공식 런칭] 아이패스케어 스마트 ERP v1.0.0 정식 버전 오픈 안내',
          content: '안녕하세요, 아이패스케어 가맹 학원 원장님 및 임직원 여러분!\n아이패스케어 스마트 ERP v1.0.0 정식 안정화 버전이 성공적으로 런칭되었습니다.',
          is_important: true,
          author_name: '아이패스케어 본사',
          created_at: '2026-08-26T00:00:00Z'
        }
      ];
      setHqNotices(loadedHq);

      const totalBalance = (smsRes.data || []).reduce((acc: number, row: any) => acc + (row.point_balance || 0), 0);
      setPointBalance(totalBalance);

    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [activeBranchId]);

  // Calculations for KPI Cards
  const totalStudentCount = students.length;
  const newStudentsThisMonth = useMemo(() => {
    return students.filter(s => {
      const date = s.admission_date || s.created_at;
      return date && date.startsWith(currentMonthStr);
    }).length;
  }, [students, currentMonthStr]);

  // Today's Attendance KPI
  const todayReservations = useMemo(() => {
    return reservations.filter(r => r.class_date === todayStr);
  }, [reservations, todayStr]);

  const todayScheduledChildIds = useMemo(() => {
    return Array.from(new Set(todayReservations.map(r => r.child_id).filter(Boolean)));
  }, [todayReservations]);

  const todayLogs = useMemo(() => {
    return attendanceLogs.filter(l => l.date === todayStr);
  }, [attendanceLogs, todayStr]);

  const todayAttendedCount = useMemo(() => {
    return new Set(todayLogs.filter(l => l.check_in || l.status === '등원' || l.status === '출석').map(l => l.child_id)).size;
  }, [todayLogs]);

  const todayPendingCount = Math.max(0, todayScheduledChildIds.length - todayAttendedCount);

  // Billing KPI
  const billingStats = useMemo(() => {
    const totalDue = bills.reduce((acc, b) => acc + (b.amount_due || 0), 0);
    const totalPaid = bills.filter(b => b.status === 'paid').reduce((acc, b) => acc + (b.amount_paid || b.amount_due || 0), 0);
    const paidCount = bills.filter(b => b.status === 'paid').length;
    const unpaidCount = bills.filter(b => b.status === 'unpaid').length;
    const rate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;
    return { totalDue, totalPaid, paidCount, unpaidCount, rate };
  }, [bills]);

  // Chart 1: Monthly Student Growth (Jan ~ Dec of Current Year)
  const monthlyStudentChartData = useMemo(() => {
    const currentMonthNum = new Date().getMonth() + 1;
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    
    let elapsedSum = 0;
    const data = months.map((m, idx) => {
      const monthNum = idx + 1;
      const isFuture = monthNum > currentMonthNum;

      let count = 0;
      if (!isFuture) {
        const monthPrefix = `${currentYear}-${m}`;
        count = students.filter(s => {
          const date = s.admission_date || s.created_at || '2026-01-01';
          return date.slice(0, 7) <= monthPrefix;
        }).length;
        elapsedSum += count;
      }

      return { month: `${monthNum}월`, count, isFuture };
    });

    const maxCount = Math.max(...data.map(d => d.count), 10);
    const avgCount = currentMonthNum > 0 ? Math.round(elapsedSum / currentMonthNum) : 0;
    return { data, maxCount, avgCount, currentMonthNum };
  }, [students, currentYear]);

  // Chart 2: Daily Attendance Trend for this month (1st ~ Last Day)
  const dailyAttendanceChartData = useMemo(() => {
    const parts = currentMonthStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const totalDays = new Date(year, month, 0).getDate();

    const data: Array<{ day: number; dateStr: string; attended: number; scheduled: number }> = [];

    for (let d = 1; d <= totalDays; d++) {
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${currentMonthStr}-${dayStr}`;
      const dayLogs = attendanceLogs.filter(l => l.date === dateStr && (l.check_in || l.status === '등원' || l.status === '출석'));
      const dayAttended = new Set(dayLogs.map(l => l.child_id)).size;
      const dayScheduled = new Set(reservations.filter(r => r.class_date === dateStr).map(r => r.child_id)).size;

      data.push({
        day: d,
        dateStr,
        attended: dayAttended,
        scheduled: dayScheduled
      });
    }

    const maxDaily = Math.max(...data.map(d => d.attended), 10);
    return { data, maxDaily, totalDays };
  }, [attendanceLogs, reservations, currentMonthStr]);

  // Today's Classes based on day of week
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const todayDayName = dayNames[new Date().getDay()];

  const todayClasses = useMemo(() => {
    return schedules.filter(s => {
      const days = Array.isArray(s.day_of_week) 
        ? s.day_of_week 
        : typeof s.day_of_week === 'string' 
        ? s.day_of_week.split(',').map((d: string) => d.trim()) 
        : [];
      return days.includes(todayDayName);
    });
  }, [schedules, todayDayName]);

  const displayName = useMemo(() => {
    const raw = profile?.name?.trim() || '관리자';
    return raw.endsWith('님') ? raw : `${raw}님`;
  }, [profile?.name]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* 1. Header Banner & Quick Refresh */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-blue-950 text-white rounded-3xl p-6 sm:p-7 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles size={11} className="text-amber-400" />
              스마트 학원 통합 관제
            </span>
            <span className="text-slate-400 text-xs font-medium">
              {todayStr} ({todayDayName}요일)
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">
            안녕하세요, <span className="text-blue-400">{displayName}</span>! 👋
          </h1>
          <p className="text-xs text-slate-300 font-medium">
            오늘 우리 학원의 재원생, 출결 상황, 수납률을 한눈에 파악하고 조치할 수 있습니다.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={loadDashboardData}
            disabled={loading}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3.5 py-2.5 rounded-2xl text-xs font-bold transition border border-white/10 shadow-xs active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            새로고침
          </button>
        </div>
      </div>

      {/* 1.5 HQ Announcement 1-Line Ticker Banner */}
      <div 
        onClick={() => onNavigateTab('dashboard', 'hq_notices')}
        className="bg-white border border-slate-200/90 shadow-2xs hover:shadow-xs hover:border-blue-300 rounded-2xl p-3.5 px-5 flex items-center justify-between gap-4 cursor-pointer transition group"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="bg-blue-600 text-white text-[11px] font-black px-2.5 py-0.5 rounded-lg shrink-0 flex items-center gap-1">
            <Megaphone size={12} /> 본사 공지
          </span>
          <p className="text-xs font-bold text-slate-800 group-hover:text-blue-600 truncate transition flex-1">
            {hqNotices.length > 0 
              ? hqNotices[0].title 
              : '📢 아이패스케어 v1.0.0 공식 런칭! 원장님들의 성공적인 학원 운영을 전폭 지원합니다.'}
          </p>
          <span className="text-[11px] text-slate-400 shrink-0 font-mono hidden sm:inline">
            {hqNotices.length > 0 ? hqNotices[0].created_at?.slice(0, 10) : todayStr}
          </span>
        </div>

        <button 
          onClick={(e) => {
            e.stopPropagation();
            onNavigateTab('dashboard', 'hq_notices');
          }}
          className="text-xs font-black text-blue-600 hover:text-blue-700 flex items-center gap-0.5 pl-2 border-l border-slate-200 shrink-0 group-hover:translate-x-0.5 transition-transform"
        >
          전체 보기 <ChevronRight size={13} />
        </button>
      </div>

      {/* 2. Top 4 Golden KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: 총 재원생 수 */}
        <div 
          onClick={() => onNavigateTab('student_mgmt', 'students')}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">총 재원생</span>
            <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
              {loading ? '...' : `${totalStudentCount}명`}
            </span>
            <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
              +{newStudentsThisMonth}명 신규
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
            <span>이번 달 등록 기준</span>
            <span className="text-blue-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              원생 관리 <ArrowRight size={11} />
            </span>
          </p>
        </div>

        {/* KPI 2: 오늘 출결 현황 */}
        <div 
          onClick={() => onNavigateTab('attendance_mgmt', 'admin_attendance')}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">오늘 수업 출결</span>
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <CalendarCheck2 size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
              {loading ? '...' : `${todayAttendedCount} / ${todayScheduledChildIds.length}명`}
            </span>
            {todayPendingCount > 0 ? (
              <span className="text-xs font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                미처리 {todayPendingCount}명
              </span>
            ) : (
              <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                ✓ 전원 출석
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
            <span>오늘 수업 예약 원생</span>
            <span className="text-emerald-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              실시간 출결 <ArrowRight size={11} />
            </span>
          </p>
        </div>

        {/* KPI 3: 이번 달 수납 현황 */}
        <div 
          onClick={() => onNavigateTab('billing_mgmt', 'billing')}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">이번 달 수납률</span>
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <CreditCard size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
              {loading ? '...' : `${billingStats.rate}%`}
            </span>
            <span className="text-xs font-bold text-slate-500">
              미납 {billingStats.unpaidCount}명
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
            <span className="truncate">완료: {(billingStats.totalPaid / 10000).toLocaleString()}만원</span>
            <span className="text-indigo-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              수납 장부 <ArrowRight size={11} />
            </span>
          </p>
        </div>

        {/* KPI 4: 문자 i-Point 잔여량 */}
        <div 
          onClick={() => onNavigateTab('sms_mgmt', 'sms_send')}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-purple-300 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">문자 i-Point 잔액</span>
            <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <MessageSquare size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-purple-700 font-mono">
              {loading ? '...' : `${pointBalance.toLocaleString()} P`}
            </span>
            <span className="text-[11px] font-black text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
              +충전하기
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
            <span>SMS 약 {Math.floor(pointBalance / 20).toLocaleString()}건 가능</span>
            <span className="text-purple-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              문자 관리 <ArrowRight size={11} />
            </span>
          </p>
        </div>

      </div>

      {/* 3. Middle 2 Visual Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Chart 1: 월별 재원생 추이 (막대그래프) */}
        <div className="lg:col-span-6 bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Users size={16} className="text-blue-600" />
                재원생 현황 ({currentYear}년)
              </h3>
              <p className="text-[11px] text-slate-400">월별 학원 재원생 추이 및 연간 성장 지표</p>
            </div>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-xl">
              연평균 <b className="text-blue-600 font-black">{monthlyStudentChartData.avgCount}명</b>
            </span>
          </div>

            {/* Bar Chart Container */}
            <div className="pt-4 pb-2">
              <div className="h-44 flex items-end justify-between gap-1 sm:gap-2 px-2 border-b border-slate-200">
                {monthlyStudentChartData.data.map((item, idx) => {
                  const isCurrentMonth = item.month === `${monthlyStudentChartData.currentMonthNum}월`;
                  const heightPercent = item.count > 0 
                    ? Math.max(8, Math.round((item.count / monthlyStudentChartData.maxCount) * 100))
                    : 0;

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                      <span className="text-[10px] font-bold font-mono text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {item.isFuture ? '-' : `${item.count}명`}
                      </span>
                      {item.isFuture ? (
                        <div className="w-full max-w-[24px] h-1 rounded-full bg-slate-100 mb-1" title="미도래 월" />
                      ) : (
                        <div 
                          className={`w-full max-w-[28px] rounded-t-lg transition-all duration-300 ${
                            isCurrentMonth 
                              ? 'bg-blue-600 group-hover:bg-blue-700 shadow-xs' 
                              : 'bg-emerald-400/80 group-hover:bg-emerald-500'
                          }`}
                          style={{ height: `${heightPercent}%` }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

            {/* X-Axis Labels */}
            <div className="flex justify-between gap-1 sm:gap-2 px-2 pt-2 text-[10px] font-bold text-slate-400">
              {monthlyStudentChartData.data.map((item, idx) => (
                <span key={idx} className={`flex-1 text-center truncate ${item.month === `${new Date().getMonth() + 1}월` ? 'text-blue-600 font-black' : ''}`}>
                  {item.month}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Chart 2: 월간 일자별 출결 현황 (선 그래프 시각화) */}
        <div className="lg:col-span-6 bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <CalendarCheck2 size={16} className="text-emerald-600" />
                월간 일별 출결 추이 ({currentMonthStr})
              </h3>
              <p className="text-[11px] text-slate-400">이번 달 1일부터 말일까지 일자별 등원 출석 인원</p>
            </div>
            <span className="text-xs font-bold text-slate-600 bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded-xl">
              최고 출석 <b className="font-black">{dailyAttendanceChartData.maxDaily}명</b>
            </span>
          </div>

          {/* Line/Bar Chart Container for Daily Attendance */}
          <div className="pt-4 pb-2">
            <div className="h-44 flex items-end justify-between gap-0.5 sm:gap-1 px-1 border-b border-slate-200">
              {dailyAttendanceChartData.data.map((item, idx) => {
                const heightPercent = item.attended > 0 
                  ? Math.max(8, Math.round((item.attended / dailyAttendanceChartData.maxDaily) * 100)) 
                  : 4;
                const isToday = item.dateStr === todayStr;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    {/* Tooltip on Hover */}
                    <div className="absolute -top-7 hidden group-hover:flex bg-slate-900 text-white text-[9.5px] font-black px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap z-20">
                      {item.day}일: {item.attended}명 출석
                    </div>
                    <div 
                      className={`w-full max-w-[12px] rounded-t-sm transition-all duration-200 ${
                        isToday 
                          ? 'bg-rose-500 shadow-xs' 
                          : item.attended > 0 
                          ? 'bg-rose-400 hover:bg-rose-500' 
                          : 'bg-slate-100'
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                );
              })}
            </div>

            {/* X-Axis Day Markers */}
            <div className="flex justify-between px-1 pt-2 text-[10px] font-bold text-slate-400">
              <span>1일</span>
              <span>5일</span>
              <span>10일</span>
              <span>15일</span>
              <span>20일</span>
              <span>25일</span>
              <span>{dailyAttendanceChartData.totalDays}일</span>
            </div>
          </div>
        </div>

      </div>

      {/* 4. Bottom 2 Action & Operational Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: 오늘의 수업 & 셔틀 실시간 타임라인 */}
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Clock size={16} className="text-blue-600" />
                오늘({todayDayName}요일) 수업 & 셔틀 시간표
              </h3>
              <p className="text-[11px] text-slate-400">오늘 운영되는 수업 클래스와 시간대별 일정</p>
            </div>
            <button 
              onClick={() => onNavigateTab('student_mgmt', 'classes')}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
            >
              시간표 관리 <ChevronRight size={13} />
            </button>
          </div>

          <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
            {todayClasses.length > 0 ? (
              todayClasses.map((cls) => {
                const startTime = cls.start_time ? cls.start_time.slice(0, 5) : '00:00';
                const endTime = cls.end_time ? cls.end_time.slice(0, 5) : '00:00';
                return (
                  <div 
                    key={cls.id}
                    onClick={() => onNavigateTab('attendance_mgmt', 'admin_attendance')}
                    className="p-3.5 rounded-2xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/80 hover:border-blue-200 transition flex items-center justify-between cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-blue-600 font-mono font-black text-xs flex flex-col items-center justify-center shrink-0 shadow-2xs">
                        <span>{startTime}</span>
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                          {cls.target_class}
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                          {startTime} ~ {endTime} · 정원 {cls.max_people || 15}명
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-xl shadow-2xs">
                        출결 체크 ➔
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs font-bold">
                오늘({todayDayName}요일) 배정된 수업 일정이 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* Right: 빠른 업무 바로가기 (Quick Launcher) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Sparkles size={16} className="text-amber-500" />
              원클릭 빠른 실행
            </h3>
            <p className="text-[11px] text-slate-400">자주 사용하는 핵심 관리 업무로 즉시 이동합니다.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onNavigateTab('student_mgmt', 'students')}
              className="p-4 rounded-2xl bg-blue-50/60 hover:bg-blue-100/70 border border-blue-200 text-left transition group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs mb-2 group-hover:scale-105 transition-transform">
                <Plus size={16} />
              </div>
              <b className="text-xs font-black text-slate-900 block">신규 원생 등록</b>
              <span className="text-[10.5px] text-slate-500 mt-0.5 block">학생 명부 및 반 배정</span>
            </button>

            <button
              onClick={() => onNavigateTab('attendance_mgmt', 'admin_attendance')}
              className="p-4 rounded-2xl bg-emerald-50/60 hover:bg-emerald-100/70 border border-emerald-200 text-left transition group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs mb-2 group-hover:scale-105 transition-transform">
                <CalendarCheck2 size={16} />
              </div>
              <b className="text-xs font-black text-slate-900 block">오늘 출결 관리</b>
              <span className="text-[10.5px] text-slate-500 mt-0.5 block">승하차 및 등하원 체크</span>
            </button>

            <button
              onClick={() => onNavigateTab('billing_mgmt', 'billing')}
              className="p-4 rounded-2xl bg-indigo-50/60 hover:bg-indigo-100/70 border border-indigo-200 text-left transition group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs mb-2 group-hover:scale-105 transition-transform">
                <CreditCard size={16} />
              </div>
              <b className="text-xs font-black text-slate-900 block">원비 수납 청구</b>
              <span className="text-[10.5px] text-slate-500 mt-0.5 block">모바일 청구서 발송</span>
            </button>

            <button
              onClick={() => onNavigateTab('sms_mgmt', 'sms_send')}
              className="p-4 rounded-2xl bg-purple-50/60 hover:bg-purple-100/70 border border-purple-200 text-left transition group shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs mb-2 group-hover:scale-105 transition-transform">
                <MessageSquare size={16} />
              </div>
              <b className="text-xs font-black text-slate-900 block">문자/알림톡 발송</b>
              <span className="text-[10.5px] text-slate-500 mt-0.5 block">대량 공지 및 알림</span>
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
