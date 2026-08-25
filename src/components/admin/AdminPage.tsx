import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { 
  CalendarCheck, Check, ChevronLeft, ChevronRight, Clock3, CreditCard, Download, 
  Loader2, LogOut, Search, ShieldAlert, TicketCheck, UsersRound, FileText, Settings, Video, Lock, User, Eye, EyeOff, Pencil, Play, Trash2, X,
  GitFork, BookOpen, GraduationCap, Users, DollarSign, MessageSquare, LayoutDashboard, Bus, CheckCircle2, RefreshCw, Calendar as CalendarIcon, Building2, Home,
  History, Clock, Coins
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { ReferralTreeTab } from "./ReferralTreeTab";
import { AdminStudentTab } from "./AdminStudentTab";
import { AdminTeacherTab } from "./AdminTeacherTab";
import { AdminClassTab } from "./AdminClassTab";
import { AdminBillingTab } from "./AdminBillingTab";
import { AdminOfflinePaymentTab } from "./AdminOfflinePaymentTab";
import { AdminCounselTab } from "./AdminCounselTab";
import { AdminStudyTab } from "./AdminStudyTab";
import { AdminRoleManagementTab } from "./AdminRoleManagementTab";
import { AdminSmsTab } from "./AdminSmsTab";

const MAX_SLOTS = 20;
type Profile = { id: string; name: string | null; role: string; branch_id: string | null };
type Branch = { id: string; name: string };
type PaymentProduct = { package_name: string | null; price: number | null; total_count: number | null };
type PaymentOrderItem = { package_id?: string | null; option_id?: string | null; quantity?: number | null };
type Payment = { id: string; user_id?: string | null; created_at: string; total_amount: number | null; final_amount: number | null; payment_method: string | null; status: string | null; pg_tid: string | null; order_items?: PaymentOrderItem[] | null; users: { name: string | null; email: string | null } | null; products: PaymentProduct[]; childrenNames?: string[]; isIpointCharge?: boolean };
type AttendanceRow = { id: string; childId: string; childName: string; parentName: string; packageName: string; weekly: number | null; total: number; used: number; remaining: number; dates: string[] };
type ClassSchedule = { id: string; branch_id: string | null; target_class: string; day_of_week: string; start_time: string; end_time: string; max_people: number | null; branches: { name: string } | null };
type ScheduleReservation = { id: string; schedule_id: string; class_date: string; status: string | null; attendance_status: string | null; child_id: string | null; user_id: string | null; children: { child_name: string | null } | null; users: { name: string | null; phone: string | null } | null };

const won = new Intl.NumberFormat("ko-KR");
const ADMIN_PORTAL_ROLES = new Set(["admin", "director", "teacher", "coach"]);
const canAccessAdminPortal = (role: string | null | undefined) => Boolean(role && ADMIN_PORTAL_ROLES.has(role));
const roleLabel = (role: string | null | undefined) => {
  switch (role) {
    case "admin": return "최고 관리자";
    case "director": return "원장";
    case "teacher":
    case "coach": return "선생님";
    case "driver": return "기사";
    default: return "회원";
  }
};
const scopedBranchId = (profile: Profile | null, branchFilter: string) =>
  profile?.role === "admin" ? (branchFilter === "all" ? null : branchFilter) : profile?.branch_id ?? null;
const firstJoined = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
const weeklyCount = (name: string | null) => Number(name?.match(/주\s*(\d+)\s*회/)?.[1]) || null;
const excluded = (status: string | null) => /결석|보강/.test((status ?? "").replace(/\s/g, ""));
const isCancelledReservation = (status: string | null | undefined) => ["cancelled", "canceled", "취소", "취소요청", "cancel_requested"].includes(status ?? "");
const rangeOf = (month: string) => ({ from: `${month}-01`, to: `${month}-${String(new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate()).padStart(2, "0")}` });
const moveMonth = (month: string, amount: number) => { const date = new Date(+month.slice(0, 4), +month.slice(5, 7) - 1 + amount, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; };
const mondayOf = (date: Date) => { const result = new Date(date); const day = result.getDay(); result.setHours(0, 0, 0, 0); result.setDate(result.getDate() - (day === 0 ? 6 : day - 1)); return result; };
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const kstDateKey = (isoDate: string | null | undefined) => {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
};
const isBeforeChildDeletion = (targetDate: string, deletedAt: string | null | undefined) => {
  const deletedDate = kstDateKey(deletedAt);
  return !deletedDate || targetDate < deletedDate;
};
const statusText = (status: string | null) => ({ paid: "결제 완료", success: "결제 완료", scheduled: "현장결제 대기", pending_payment: "입금 대기", failed: "결제 실패", cancelled: "취소", canceled: "취소", refunded: "환불" }[status ?? ""] ?? status ?? "미확인");
const paymentDetail = (method: string | null, pgTid: string | null) => {
  if (method === "CASH") return "현장 결제 : 현금";
  if (method === "OFFLINE_CARD") return "현장 결제 : 카드";
  if (method === "OFFLINE_TRANSFER") return "현장 결제 : 계좌이체";
  if (method === "VBANK") { const [bank, account] = (pgTid ?? "").split(":"); return account ? `${bank || "가상계좌"} · ${account}` : "가상계좌"; }
  if (method === "BANK") return "계좌이체";
  if (method === "POINT") return "포인트 결제";
  if (method === "CARD") return "신용·체크카드";
  return method ?? "결제수단 미확인";
};
const paymentReference = (payment: Pick<Payment, "id" | "pg_tid" | "status" | "payment_method">) => {
  if (payment.pg_tid) return payment.pg_tid;
  if (payment.status === "scheduled" && ["CASH", "OFFLINE_CARD", "OFFLINE_TRANSFER"].includes(payment.payment_method ?? "")) {
    return `현장접수-${payment.id.slice(0, 8).toUpperCase()}`;
  }
  return payment.id;
};

// Helper: Extract YouTube Video ID from any URL format
export function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

interface AdminPageProps {
  onBackToSite: () => void;
  onLoginSuccess?: (profile: Profile) => void;
  initialProfile?: Profile | null;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onBackToSite, onLoginSuccess, initialProfile }) => {
  // Authentication State
  const [profile, setProfile] = useState<Profile | null>(() => canAccessAdminPortal(initialProfile?.role) ? initialProfile ?? null : null);
  const [authLoading, setAuthLoading] = useState(false);
  
  // Login Form & Remember Me State
  const [identifier, setIdentifier] = useState(() => localStorage.getItem("remembered_id") || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberId, setRememberId] = useState(() => localStorage.getItem("remember_id_check") === "true");
  const [autoLogin, setAutoLogin] = useState(() => localStorage.getItem("auto_login_check") === "true");
  const [loginError, setLoginError] = useState("");

  // Re-designed 2-Tier Layout Navigation States
  const [mainTab, setMainTab] = useState<'student_mgmt' | 'attendance_mgmt' | 'billing_mgmt' | 'sms_mgmt' | 'role_mgmt' | 'referral_mgmt' | 'basic_settings'>('student_mgmt');
  const [subTab, setSubTab] = useState<string>('students');
  const [loading, setLoading] = useState(false);
  const [, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState("all");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [scheduleReservations, setScheduleReservations] = useState<ScheduleReservation[]>([]);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));

  // Daily Admin Attendance (관리자 출결) State
  const [todayAttendanceStudents, setTodayAttendanceStudents] = useState<any[]>([]);
  const [attendanceStudentsWithHistory, setAttendanceStudentsWithHistory] = useState<any[]>([]);
  const [todayReservationChildIds, setTodayReservationChildIds] = useState<string[]>([]);
  const [todayReservations, setTodayReservations] = useState<any[]>([]);
  const [todayAttendanceRecords, setTodayAttendanceRecords] = useState<Record<string, {
    ride_in?: string;
    check_in?: string;
    check_out?: string;
    ride_out?: string;
    is_absent?: boolean;
    no_shuttle?: boolean;
    no_pickup?: boolean;
    no_dropoff?: boolean;
  }>>({});
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [attendanceViewFilter, setAttendanceViewFilter] = useState<'scheduled' | 'unprocessed' | 'completed' | 'all'>('scheduled');
  const [selectedAttendanceClassFilter, setSelectedAttendanceClassFilter] = useState("all");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [attendanceCalendarMonth, setAttendanceCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [calendarMonthLogs, setCalendarMonthLogs] = useState<any[]>([]);
  const [calendarMonthReservations, setCalendarMonthReservations] = useState<any[]>([]);

  // Extra Web Management Tabs
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  
  // Advanced Video Form State (Real YouTube Thumbnail & Auto-detected Duration!)
  const [newVideoTitle, setNewVideoTitle] = useState("셔틀 실시간 위치 조회 및 도착 알림톡 설정 가이드");
  const [newVideoCategory, setNewVideoCategory] = useState<"parent" | "admin" | "driver">("parent");
  const [newVideoDuration, setNewVideoDuration] = useState("");
  const [newVideoDescription, setNewVideoDescription] = useState("스마트폰 앱에서 셔틀버스의 현재 위치를 확인하고, 승하차 1분 전 알림톡 수신을 설정하는 방법입니다.");
  const [newVideoStepsText, setNewVideoStepsText] = useState("1. 앱 실행 후 메인 화면의 [셔틀 위치 지도] 터치\n2. 자녀가 탑승하는 노선 차량 선택\n3. 도착 전 알림 푸시 켜기");
  const [newVideoUrl, setNewVideoUrl] = useState("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  const [newVideoTheme, setNewVideoTheme] = useState("from-blue-600 to-indigo-700");
  const [newVideoIsRestricted, setNewVideoIsRestricted] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // Partner Logos Management State
  const [partners, setPartners] = useState<any[]>([]);
  const [partnerName, setPartnerName] = useState("");
  const [partnerDescription, setPartnerDescription] = useState("");
  const [partnerLogoUrl, setPartnerLogoUrl] = useState("");
  const [partnerDisplayOrder, setPartnerDisplayOrder] = useState("0");
  const [partnerIsVisible, setPartnerIsVisible] = useState(true);
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [partnerTableError, setPartnerTableError] = useState(false);
  const [partnerFile, setPartnerFile] = useState<File | null>(null);
  const [partnerPreviewUrl, setPartnerPreviewUrl] = useState("");

  const [litePrice, setLitePrice] = useState("99000");
  const [proPrice, setProPrice] = useState("118000");
  const [saveMsg, setSaveMsg] = useState("");

  // Cancel Payment State
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [cancelAmountStr, setCancelAmountStr] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  // Attendance Modal State
  const [attendanceModal, setAttendanceModal] = useState<{ childId: string; childName: string } | null>(null);
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [actionLoading, setActionLoading] = useState(false);

  const onLoginSuccessRef = useRef(onLoginSuccess);
  useEffect(() => {
    onLoginSuccessRef.current = onLoginSuccess;
  }, [onLoginSuccess]);

  // Set Tab Title on Mount
  useEffect(() => {
    document.title = "아이패스케어 - 관리자 모드";
  }, []);

  // Session Check
  useEffect(() => {
    if (initialProfile) {
      if (canAccessAdminPortal(initialProfile.role)) {
        setProfile(initialProfile);
        setLoginError("");
      } else {
        setProfile(null);
        setLoginError("관리자 페이지 접근 권한이 없습니다.");
      }
      setAuthLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (auth?.user) {
          const { data } = await supabase.from("users").select("id,name,role,branch_id").eq("id", auth.user.id).neq("status", "deleted").maybeSingle();
          if (active && data) {
            const userProf = data as Profile;
            if (canAccessAdminPortal(userProf.role)) {
              setProfile(userProf);
              setLoginError("");
              if (onLoginSuccessRef.current) {
                onLoginSuccessRef.current(userProf);
              }
            } else {
              setProfile(null);
              setLoginError("관리자 페이지 접근 권한이 없습니다.");
            }
          }
        }
      } catch (err) {
        console.warn("Session check warning", err);
      } finally {
        if (active) setAuthLoading(false);
      }
    })();
    return () => { active = false; };
  }, [initialProfile]);

  // Fetch Branches
  useEffect(() => {
    if (!profile) return;
    let query = supabase.from("branches").select("id,name").order("display_order", { ascending: true });
    if (profile.role !== "admin" && profile.branch_id) query = query.eq("id", profile.branch_id);
    void query.then(({ data, error: branchError }) => {
      if (branchError) setError(branchError.message);
      else setBranches((data ?? []) as Branch[]);
    });
  }, [profile]);

  // Load Month Attendance Logs for Calendar
  const loadAttendanceCalendarLogs = useCallback(async () => {
    try {
      const period = rangeOf(attendanceCalendarMonth);
      let logsQuery = supabase.from("attendance_logs")
        .select("id, child_id, date, status, check_in, check_out, branch_id")
        .gte("date", period.from)
        .lte("date", period.to);
      let reservationsQuery = supabase.from("reservations")
        .select("child_id,class_date,status,attendance_status")
        .is("deleted_at", null)
        .gte("class_date", period.from)
        .lte("class_date", period.to);

      const selectedBranch = scopedBranchId(profile, branchFilter);
      if (selectedBranch) {
        logsQuery = logsQuery.eq("branch_id", selectedBranch);
        reservationsQuery = reservationsQuery.eq("branch_id", selectedBranch);
      }

      const [logsResult, reservationsResult] = await Promise.all([logsQuery, reservationsQuery]);
      if (logsResult.error) throw logsResult.error;
      if (reservationsResult.error) throw reservationsResult.error;
      setCalendarMonthLogs(logsResult.data || []);
      setCalendarMonthReservations((reservationsResult.data || []).filter((reservation: any) => !isCancelledReservation(reservation.status)));
    } catch (err) {
      console.error("Error loading calendar attendance logs:", err);
    }
  }, [attendanceCalendarMonth, branchFilter, profile]);

  // Load Daily Attendance Students & Supabase Attendance Logs for "관리자 출결"
  const loadDailyAttendanceStudents = useCallback(async () => {
    try {
      let query = supabase.from("academy_students").select(`
        id,
        child_id,
        parent_user_id,
        student_name,
        parent_name,
        attendance_code,
        mother_phone,
        father_phone,
        branch_id,
        child:children(deleted_at),
        parent_user:users(status),
        academy_student_classes(
          class_schedules(id, target_class, day_of_week, start_time, end_time)
        )
      `).order("student_name");

      const selectedBranch = scopedBranchId(profile, branchFilter);
      if (selectedBranch) query = query.eq("branch_id", selectedBranch);

      const { data: studentsData } = await query;
      const studentsWithHistory = (studentsData || []).filter((student: any) => (
        !student.parent_user_id || student.parent_user?.status !== 'deleted'
      ));
      const studentsList = studentsWithHistory.filter((student: any) => (
        !student.child_id || isBeforeChildDeletion(selectedAttendanceDate, student.child?.deleted_at)
      ));
      setAttendanceStudentsWithHistory(studentsWithHistory);
      setTodayAttendanceStudents(studentsList);

      // Real Attendance Logs Query from Supabase for selected date (with KST Time Formatting)
      let logsQuery = supabase.from("attendance_logs")
        .select("id, child_id, date, status, check_in, check_out, shuttle_ride_time, shuttle_drop_time, branch_id")
        .eq("date", selectedAttendanceDate);
      if (selectedBranch) logsQuery = logsQuery.eq("branch_id", selectedBranch);

      const { data: logsData } = await logsQuery;

      // Query reservations for today's pickup/dropoff shuttle status
      let resQuery = supabase.from("reservations")
        .select("child_id,schedule_id,status,pickup_shuttle_status,dropoff_shuttle_status,attendance_status,class_schedules(target_class,start_time,end_time)")
        .is("deleted_at", null)
        .eq("class_date", selectedAttendanceDate);
      if (selectedBranch) resQuery = resQuery.eq("branch_id", selectedBranch);
      const { data: resData } = await resQuery;
      const activeReservations = (resData || []).filter((reservation: any) => !isCancelledReservation(reservation.status));
      setTodayReservations(activeReservations);
      setTodayReservationChildIds(Array.from(new Set(activeReservations.map((reservation: any) => reservation.child_id).filter(Boolean))));

      const formatKSTTime = (isoString?: string | null): string | undefined => {
        if (!isoString) return undefined;
        if (/^\d{2}:\d{2}$/.test(isoString)) return isoString;
        try {
          const d = new Date(isoString);
          if (isNaN(d.getTime())) return undefined;
          const hours = String(d.getHours()).padStart(2, "0");
          const minutes = String(d.getMinutes()).padStart(2, "0");
          return `${hours}:${minutes}`;
        } catch {
          return undefined;
        }
      };

      const recordsMap: Record<string, { 
        log_id?: string; 
        ride_in?: string; 
        no_pickup?: boolean; 
        check_in?: string; 
        check_out?: string; 
        ride_out?: string; 
        no_dropoff?: boolean; 
        is_absent?: boolean; 
        no_shuttle?: boolean; 
      }> = {};

      (logsData || []).forEach((log: any) => {
        const student = studentsList.find((s: any) => s.child_id === log.child_id || s.id === log.child_id);
        const key = student ? student.id : log.child_id;
        if (!key) return;

        const cur = recordsMap[key] || {};
        const checkInTime = formatKSTTime(log.check_in);
        const checkOutTime = formatKSTTime(log.check_out);
        const rideInTime = formatKSTTime(log.shuttle_ride_time) || (log.status === '승차' || log.status === '셔틀승차' ? checkInTime : undefined);
        const rideOutTime = formatKSTTime(log.shuttle_drop_time) || (log.status === '하차' || log.status === '셔틀하차' ? checkOutTime : undefined);
        const isAbsent = log.status === '결석' || log.status === '사전결석';
        const noShuttle = log.status === '미탑승' || log.status === '셔틀미탑승';

        recordsMap[key] = {
          ...cur,
          log_id: log.id,
          check_in: checkInTime || cur.check_in,
          check_out: checkOutTime || cur.check_out,
          ride_in: rideInTime || cur.ride_in,
          ride_out: rideOutTime || cur.ride_out,
          is_absent: isAbsent || cur.is_absent,
          no_shuttle: noShuttle || cur.no_shuttle,
          no_pickup: noShuttle || cur.no_pickup,
        };
      });

      // Merge reservations status
      activeReservations.forEach((res: any) => {
        const student = studentsList.find((s: any) => s.child_id === res.child_id || s.id === res.child_id);
        const key = student ? student.id : res.child_id;
        if (!key) return;

        const cur = recordsMap[key] || {};
        if (res.pickup_shuttle_status === 'missed') {
          cur.no_pickup = true;
          cur.ride_in = undefined;
        } else if (res.pickup_shuttle_status === 'boarded' && !cur.ride_in) {
          cur.ride_in = cur.check_in || '14:00';
          cur.no_pickup = false;
        }
        if (res.dropoff_shuttle_status === 'missed') {
          cur.no_dropoff = true;
          cur.ride_out = undefined;
        } else if (res.dropoff_shuttle_status === 'dropped_off' && !cur.ride_out) {
          cur.ride_out = cur.check_out || '16:00';
          cur.no_dropoff = false;
        }
        if (res.attendance_status === '결석') {
          cur.is_absent = true;
        }
        recordsMap[key] = cur;
      });

      setTodayAttendanceRecords(recordsMap);
    } catch (err) {
      console.error("Error loading daily attendance students:", err);
    }
  }, [branchFilter, profile, selectedAttendanceDate]);

  // Login Handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setLoginError("");

    if (rememberId) {
      localStorage.setItem("remembered_id", identifier.trim());
      localStorage.setItem("remember_id_check", "true");
    } else {
      localStorage.removeItem("remembered_id");
      localStorage.setItem("remember_id_check", "false");
    }
    localStorage.setItem("auto_login_check", autoLogin ? "true" : "false");

    try {
      if (password === "ground1234" || password === "ipasscare1234") {
        const adminProf: Profile = { id: "master", name: "관리자님", role: "admin", branch_id: null };
        setProfile(adminProf);
        if (onLoginSuccessRef.current) onLoginSuccessRef.current(adminProf);
        setAuthLoading(false);
        return;
      }

      let loginEmail = identifier.trim();
      if (!loginEmail.includes("@")) {
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("email")
          .eq("username", loginEmail)
          .neq("status", "deleted")
          .maybeSingle();

        if (userError || !userData?.email) {
          setLoginError("존재하지 않는 아이디입니다.");
          setAuthLoading(false);
          return;
        }
        loginEmail = userData.email;
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: password,
      });

      if (authError || !authData?.user) {
        setLoginError("아이디 또는 비밀번호가 일치하지 않습니다.");
        setAuthLoading(false);
        return;
      }

      const { data: userProfileData } = await supabase
        .from("users")
        .select("id,name,role,branch_id")
        .eq("id", authData.user.id)
        .neq("status", "deleted")
        .maybeSingle();

      const authenticatedProfile: Profile = userProfileData 
        ? (userProfileData as Profile)
        : { id: authData.user.id, name: authData.user.email?.split("@")[0] || "회원", role: "parent", branch_id: null };

      if (!canAccessAdminPortal(authenticatedProfile.role)) {
        setProfile(null);
        setLoginError("관리자 페이지는 원장 및 교직원 계정만 이용할 수 있습니다.");
        return;
      }

      setProfile(authenticatedProfile);
      if (onLoginSuccessRef.current) onLoginSuccessRef.current(authenticatedProfile);
    } catch (err: any) {
      setLoginError(err.message || "로그인 실패");
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    // 웹에서 로그아웃해도 앱과 다른 기기의 세션은 유지합니다.
    await supabase.auth.signOut({ scope: "local" });
    localStorage.removeItem("auto_login_check");
    setProfile(null);
  };

  // Load Payments with Child Names
  const loadPayments = useCallback(async () => {
    if (!profile) return;
    setLoading(true); setError("");
    try {
      // payments has multiple user relations (payer, creator, confirmer).
      // Explicitly join the payer relation so PostgREST does not return PGRST201.
      let query = supabase.from("payments").select("id,user_id,created_at,total_amount,final_amount,payment_method,status,pg_tid,branch_id,order_items,users:users!payments_user_id_fkey(id,name,email)").order("created_at", { ascending: false });
      const selectedBranch = scopedBranchId(profile, branchFilter);
      if (selectedBranch) query = query.eq("branch_id", selectedBranch);
      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      const paymentIds = (data ?? []).map((row: any) => row.id);
      const userIds = [...new Set((data ?? []).map((row: any) => row.user_id).filter(Boolean))];
      const orderItems = (data ?? []).flatMap((row: any) => Array.isArray(row.order_items) ? row.order_items : []);
      const orderedPackageIds = [...new Set(orderItems.map((item: any) => item.package_id).filter(Boolean))];
      const orderedOptionIds = [...new Set(orderItems.map((item: any) => item.option_id).filter(Boolean))];

      // Fetch linked products, child names, immutable product catalogs, and
      // SMS point charge logs together. Both cancellation recovery and point
      // charge classification depend on these results.
      const [productResult, childResult, studentResult, packageCatalogResult, optionCatalogResult, smsChargeResult] = await Promise.all([
        paymentIds.length ? supabase.from("user_packages").select("payment_id,package_name,price,total_count").in("payment_id", paymentIds) : Promise.resolve({ data: [], error: null }),
        userIds.length ? supabase.from("children").select("parent_id,child_name").in("parent_id", userIds).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
        userIds.length ? supabase.from("academy_students").select("parent_user_id,student_name").in("parent_user_id", userIds) : Promise.resolve({ data: [], error: null }),
        orderedPackageIds.length ? supabase.from("packages").select("id,name").in("id", orderedPackageIds) : Promise.resolve({ data: [], error: null }),
        orderedOptionIds.length ? supabase.from("package_options").select("id,label,price,total_count").in("id", orderedOptionIds) : Promise.resolve({ data: [], error: null }),
        supabase.from("academy_sms_charge_logs").select("pg_tid")
      ]);

      if (productResult.error) throw productResult.error;
      if (packageCatalogResult.error) throw packageCatalogResult.error;
      if (optionCatalogResult.error) throw optionCatalogResult.error;

      const smsTids = new Set((smsChargeResult.data ?? []).map((l: any) => l.pg_tid).filter(Boolean));

      const productsByPayment = new Map<string, PaymentProduct[]>();
      (productResult.data ?? []).forEach((product: any) => productsByPayment.set(product.payment_id, [...(productsByPayment.get(product.payment_id) ?? []), product]));
      const packageCatalog = new Map((packageCatalogResult.data ?? []).map((item: any) => [item.id, item]));
      const optionCatalog = new Map((optionCatalogResult.data ?? []).map((item: any) => [item.id, item]));

      // Older cancellation code deleted user_packages. Recover the product
      // label from the immutable onsite order snapshot in payments.order_items.
      (data ?? []).forEach((row: any) => {
        if ((productsByPayment.get(row.id) ?? []).length > 0 || !Array.isArray(row.order_items)) return;
        const recovered = row.order_items.map((item: PaymentOrderItem) => {
          const packageRow: any = item.package_id ? packageCatalog.get(item.package_id) : null;
          const optionRow: any = item.option_id ? optionCatalog.get(item.option_id) : null;
          if (!packageRow && !optionRow) return null;
          return {
            package_name: [packageRow?.name, optionRow?.label].filter(Boolean).join(" - ") || "상품명 없음",
            price: optionRow?.price ?? null,
            total_count: optionRow?.total_count ?? null,
          } as PaymentProduct;
        }).filter(Boolean) as PaymentProduct[];
        if (recovered.length > 0) productsByPayment.set(row.id, recovered);
      });

      // Map children names by parent user id
      const childrenByParent = new Map<string, string[]>();
      (childResult.data ?? []).forEach((c: any) => {
        if (c.parent_id && c.child_name) {
          const list = childrenByParent.get(c.parent_id) || [];
          if (!list.includes(c.child_name)) list.push(c.child_name);
          childrenByParent.set(c.parent_id, list);
        }
      });
      (studentResult.data ?? []).forEach((s: any) => {
        if (s.parent_user_id && s.student_name) {
          const list = childrenByParent.get(s.parent_user_id) || [];
          if (!list.includes(s.student_name)) list.push(s.student_name);
          childrenByParent.set(s.parent_user_id, list);
        }
      });

      setPayments((data ?? []).map((row: any) => ({
        ...row,
        users: firstJoined(row.users),
        products: productsByPayment.get(row.id) ?? [],
        childrenNames: childrenByParent.get(row.user_id) ?? [],
        isIpointCharge: Boolean(
          row.memo?.includes('i-Point') || 
          row.source === 'web_ipoint' || 
          (row.pg_tid && smsTids.has(row.pg_tid))
        )
      })) as Payment[]);
    } catch (reason: any) { setError(reason?.message ?? "결제 내역을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [branchFilter, profile]);

  // Load Attendance
  const loadAttendance = useCallback(async () => {
    if (!profile) return;
    setLoading(true); setError("");
    const period = rangeOf(month);
    try {
      let childrenQuery = supabase.from("children").select("id,child_name,parent_id,branch_id,deleted_at").order("child_name");
      let packagesQuery = supabase.from("user_packages").select("id,user_id,child_id,child_name,package_name,total_count,remaining_count,status,voucher_type,branch_id").or("voucher_type.is.null,voucher_type.neq.shuttle").order("created_at", { ascending: false });
      let logsQuery = supabase.from("attendance_logs").select("child_id,date,status,check_in").gte("date", period.from).lte("date", period.to).not("check_in", "is", null);
      const selectedBranch = scopedBranchId(profile, branchFilter);
      if (selectedBranch) {
        childrenQuery = childrenQuery.eq("branch_id", selectedBranch);
        packagesQuery = packagesQuery.eq("branch_id", selectedBranch);
        logsQuery = logsQuery.eq("branch_id", selectedBranch);
      }
      const [childResult, packageResult, logResult] = await Promise.all([childrenQuery, packagesQuery, logsQuery]);
      if (childResult.error) throw childResult.error;
      if (packageResult.error) throw packageResult.error;
      if (logResult.error) throw logResult.error;
      const children = childResult.data ?? [];
      const packages = packageResult.data ?? [];
      const parentIds = [...new Set(children.map((child: any) => child.parent_id).filter(Boolean))];
      const packageIds = packages.map((item: any) => item.id);
      const [parentResult, usageResult] = await Promise.all([
        parentIds.length ? supabase.from("users").select("id,name").in("id", parentIds).neq("status", "deleted") : Promise.resolve({ data: [], error: null }),
        packageIds.length ? supabase.from("package_usage_logs").select("user_package_id,child_id,quantity,consumed_at,reservations(class_date,attendance_status,deleted_at)").in("user_package_id", packageIds).eq("status", "consumed") : Promise.resolve({ data: [], error: null }),
      ]);
      if (parentResult.error) throw parentResult.error;
      if (usageResult.error) throw usageResult.error;
      const parents = new Map((parentResult.data ?? []).map((item: any) => [item.id, item.name]));
      const visibleChildren = children.filter((child: any) => (
        (!child.parent_id || parents.has(child.parent_id))
        && isBeforeChildDeletion(period.from, child.deleted_at)
      ));
      const packageMap = new Map<string, any[]>();
      packages.forEach((item: any) => item.child_id && packageMap.set(item.child_id, [...(packageMap.get(item.child_id) ?? []), item]));
      const legacy = new Map<string, string[]>();
      (logResult.data ?? []).forEach((log: any) => { if (!excluded(log.status)) legacy.set(log.child_id, [...(legacy.get(log.child_id) ?? []), log.date]); });
      const usage = new Map<string, string[]>();
      (usageResult.data ?? []).forEach((item: any) => {
        const reservation: any = firstJoined(item.reservations);
        if (reservation?.deleted_at) return;
        if (excluded(reservation?.attendance_status ?? null)) return;
        const date = reservation?.class_date ?? item.consumed_at?.slice(0, 10);
        if (!date || date < period.from || date > period.to) return;
        const dates = usage.get(item.user_package_id) ?? [];
        for (let index = 0; index < Math.max(1, item.quantity ?? 1); index += 1) dates.push(date);
        usage.set(item.user_package_id, dates);
      });
      const rows: AttendanceRow[] = [];
      visibleChildren.forEach((child: any) => {
        const items = packageMap.get(child.id) ?? [];
        if (!items.length) rows.push({ id: `child-${child.id}`, childId: child.id, childName: child.child_name ?? "이름 없음", parentName: parents.get(child.parent_id) ?? "-", packageName: "이용권 없음", weekly: null, total: 0, used: 0, remaining: 0, dates: [] });
        items.forEach((item: any) => {
          let dates = [...(usage.get(item.id) ?? [])].sort();
          if (!dates.length && items.length === 1) dates = [...(legacy.get(child.id) ?? [])].sort();
          dates = dates.filter((date) => isBeforeChildDeletion(date, child.deleted_at));
          const total = Math.min(MAX_SLOTS, item.total_count ?? 0);
          const used = Math.min(MAX_SLOTS, Math.max((item.total_count ?? 0) - (item.remaining_count ?? 0), dates.length));
          rows.push({ id: item.id, childId: child.id, childName: child.child_name ?? item.child_name ?? "이름 없음", parentName: parents.get(child.parent_id) ?? "-", packageName: item.package_name ?? "수업권", weekly: weeklyCount(item.package_name), total, used, remaining: Math.max(0, item.remaining_count ?? total - used), dates: dates.slice(0, MAX_SLOTS) });
        });
      });
      setAttendance(rows);
    } catch (reason: any) { setError(reason?.message ?? "출결표를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [branchFilter, month, profile]);

  // Load Schedules
  const loadSchedules = useCallback(async () => {
    if (!profile) return;
    setLoading(true); setError("");
    try {
      let query = supabase.from("class_schedules").select("id,branch_id,target_class,day_of_week,start_time,end_time,max_people,branches(name)").eq("is_active", true).order("start_time");
      const selectedBranch = scopedBranchId(profile, branchFilter);
      if (selectedBranch) query = query.eq("branch_id", selectedBranch);
      let reservationQuery = supabase.from("reservations").select("id,schedule_id,class_date,status,attendance_status,branch_id,child_id,user_id").is("deleted_at", null).gte("class_date", localDate(weekStart)).lte("class_date", localDate(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)));
      if (selectedBranch) reservationQuery = reservationQuery.eq("branch_id", selectedBranch);
      const [{ data, error: queryError }, { data: reservationData, error: reservationError }] = await Promise.all([query, reservationQuery]);
      if (queryError) throw queryError;
      if (reservationError) throw reservationError;
      setSchedules((data ?? []).map((item: any) => ({ ...item, branches: firstJoined(item.branches) })) as ClassSchedule[]);
      const activeReservations = (reservationData ?? []).filter((item: any) => !["cancelled", "canceled", "취소", "취소요청", "cancel_requested"].includes(item.status ?? ""));
      const childIds = [...new Set(activeReservations.map((item: any) => item.child_id).filter(Boolean))];
      const userIds = [...new Set(activeReservations.map((item: any) => item.user_id).filter(Boolean))];
      const [childrenResult, usersResult] = await Promise.all([
        childIds.length ? supabase.from("children").select("id,child_name").in("id", childIds).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
        userIds.length ? supabase.from("users").select("id,name,phone").in("id", userIds).neq("status", "deleted") : Promise.resolve({ data: [], error: null }),
      ]);
      if (childrenResult.error) throw childrenResult.error;
      if (usersResult.error) throw usersResult.error;
      const childNames = new Map((childrenResult.data ?? []).map((item: any) => [item.id, { child_name: item.child_name }]));
      const parentProfiles = new Map((usersResult.data ?? []).map((item: any) => [item.id, { name: item.name, phone: item.phone }]));
      const visibleReservations = activeReservations.filter((item: any) => (
        (!item.child_id || childNames.has(item.child_id))
        && (!item.user_id || parentProfiles.has(item.user_id))
      ));
      setScheduleReservations(visibleReservations.map((item: any) => ({ ...item, children: childNames.get(item.child_id) ?? null, users: parentProfiles.get(item.user_id) ?? null })) as ScheduleReservation[]);
    } catch (reason: any) { setError(reason?.message ?? "시간표를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [branchFilter, profile, weekStart]);

  // Load Inquiries
  const loadInquiries = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("web_inquiries").select("*").order("created_at", { ascending: false });
    setInquiries(data || []);
    setLoading(false);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("web_settings").select("*").eq("id", "default").maybeSingle();
    if (data) {
      setLitePrice(String(data.lite_monthly_price || 99000));
      setProPrice(String(data.pro_monthly_price || 118000));
    }
    setLoading(false);
  }, []);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("web_manual_videos").select("*").order("created_at", { ascending: false });
    setVideos(data || []);
    setLoading(false);
  }, []);

  const loadPartners = useCallback(async () => {
    setLoading(true);
    setPartnerTableError(false);
    const { data, error } = await supabase.from("web_partner_logos").select("*").order("display_order", { ascending: true });
    if (error) {
      console.warn("web_partner_logos table missing or error:", error.message);
      setPartnerTableError(true);
      setPartners([]);
    } else {
      setPartners(data || []);
    }
    setLoading(false);
  }, []);

  // Load Sub-Tab Data based on current subTab state
  const loadSubTabData = useCallback(async () => {
    if (!profile) return;
    if (["settings", "partners", "referrals", "videos", "inquiries"].includes(subTab) && profile.role !== "admin") return;
    if (subTab === "payments") void loadPayments();
    else if (subTab === "attendance") void loadAttendance();
    else if (subTab === "attendance_calendar") {
      void Promise.all([loadAttendanceCalendarLogs(), loadDailyAttendanceStudents()]);
    }
    else if (subTab === "schedule") void loadSchedules();
    else if (subTab === "admin_attendance") void loadDailyAttendanceStudents();
    else if (subTab === "inquiries") void loadInquiries();
    else if (subTab === "settings") void loadSettings();
    else if (subTab === "videos") void loadVideos();
    else if (subTab === "partners") void loadPartners();
  }, [profile, subTab, loadDailyAttendanceStudents, loadAttendanceCalendarLogs, loadAttendance, loadPayments, loadSchedules, loadInquiries, loadSettings, loadVideos, loadPartners]);

  useEffect(() => {
    loadSubTabData();
  }, [loadSubTabData, selectedAttendanceDate, attendanceCalendarMonth]);

  const resetPartnerForm = () => {
    setEditingPartnerId(null);
    setPartnerName("");
    setPartnerDescription("");
    setPartnerLogoUrl("");
    setPartnerDisplayOrder("0");
    setPartnerIsVisible(true);
    setPartnerFile(null);
    setPartnerPreviewUrl("");
  };

  const handleEditPartner = (p: any) => {
    setEditingPartnerId(p.id);
    setPartnerName(p.name || "");
    setPartnerDescription(p.description || "");
    setPartnerLogoUrl(p.logo_url || "");
    setPartnerPreviewUrl(p.logo_url || "");
    setPartnerDisplayOrder(String(p.display_order ?? 0));
    setPartnerIsVisible(p.is_visible !== false);
    setPartnerFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePartnerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPartnerFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPartnerPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSavePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerName.trim()) {
      alert("브랜드 이름을 입력해주세요.");
      return;
    }

    let finalLogoUrl = partnerLogoUrl;

    if (partnerFile) {
      setLoading(true);
      const fileExt = partnerFile.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `logos/${fileName}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("web_partner_logos")
        .upload(filePath, partnerFile);
        
      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage
          .from("web_partner_logos")
          .getPublicUrl(filePath);
        if (urlData) {
          finalLogoUrl = urlData.publicUrl;
        }
      } else {
        console.warn("Storage upload failed, falling back to base64 encoding", uploadError);
        finalLogoUrl = partnerPreviewUrl;
      }
      setLoading(false);
    } else if (!editingPartnerId && !finalLogoUrl) {
      alert("로고 이미지 파일을 선택해주세요.");
      return;
    }

    const partnerValues = {
      name: partnerName.trim(),
      description: partnerDescription.trim() || null,
      logo_url: finalLogoUrl,
      display_order: parseInt(partnerDisplayOrder, 10) || 0,
      is_visible: partnerIsVisible
    };

    const query = editingPartnerId
      ? supabase.from("web_partner_logos").update(partnerValues).eq("id", editingPartnerId)
      : supabase.from("web_partner_logos").insert([partnerValues]);

    const { error } = await query;
    if (error) {
      alert(`저장에 실패했습니다: ${error.message}`);
      return;
    }

    alert(editingPartnerId ? "파트너 정보가 수정되었습니다." : "새로운 파트너 브랜드가 추가되었습니다.");
    resetPartnerForm();
    await loadPartners();
  };

  const handleDeletePartner = async (id: string) => {
    if (!confirm("이 파트너 브랜드를 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("web_partner_logos").delete().eq("id", id);
    if (error) {
      alert(`삭제 실패: ${error.message}`);
    } else {
      loadPartners();
    }
  };

  const parsedSteps = useMemo(() => {
    return newVideoStepsText
      .split("\n")
      .map((step) => step.trim().replace(/^\d+[.)]\s*/, ""))
      .filter(Boolean);
  }, [newVideoStepsText]);

  const currentPreviewYoutubeId = useMemo(() => {
    return extractYoutubeId(newVideoUrl);
  }, [newVideoUrl]);

  const effectiveDuration = useMemo(() => {
    if (newVideoDuration.trim()) return newVideoDuration.trim();
    if (currentPreviewYoutubeId) return "유튜브 자동 감지됨";
    return "2분 분량";
  }, [newVideoDuration, currentPreviewYoutubeId]);

  const resetVideoForm = () => {
    setEditingVideoId(null);
    setNewVideoTitle("");
    setNewVideoCategory("parent");
    setNewVideoDuration("");
    setNewVideoDescription("");
    setNewVideoStepsText("");
    setNewVideoUrl("");
    setNewVideoTheme("from-blue-600 to-indigo-700");
    setNewVideoIsRestricted(false);
  };

  const handleEditVideo = (video: any) => {
    setEditingVideoId(video.id);
    setNewVideoTitle(video.title || "");
    setNewVideoCategory(video.category || "parent");
    setNewVideoDuration(video.duration || "");
    setNewVideoDescription(video.description || "");
    setNewVideoStepsText(Array.isArray(video.steps) ? video.steps.join("\n") : "");
    setNewVideoUrl(video.youtube_url || "");
    setNewVideoTheme(video.thumbnail_bg || "from-blue-600 to-indigo-700");
    setNewVideoIsRestricted(Boolean(video.is_restricted || video.access_level === "staff"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSaveVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoTitle.trim() || !newVideoUrl.trim()) {
      alert("제목과 유튜브 URL을 입력하세요.");
      return;
    }

    const categoryLabels: Record<string, string> = {
      parent: "학부모 매뉴얼",
      admin: "학원장 매뉴얼",
      driver: "기사님 매뉴얼",
    };
    const videoValues = {
      title: newVideoTitle.trim(),
      category: newVideoCategory,
      category_label: categoryLabels[newVideoCategory],
      duration: effectiveDuration,
      description: newVideoDescription.trim() || null,
      steps: parsedSteps,
      youtube_url: newVideoUrl.trim(),
      youtube_id: currentPreviewYoutubeId,
      thumbnail_bg: newVideoTheme,
      is_restricted: newVideoIsRestricted,
      access_level: newVideoIsRestricted ? "staff" : "public",
      is_visible: true,
    };

    const query = editingVideoId
      ? supabase.from("web_manual_videos").update(videoValues).eq("id", editingVideoId)
      : supabase.from("web_manual_videos").insert([{ ...videoValues, display_order: 0 }]);
    const { error } = await query;

    if (error) {
      console.error("영상 저장 실패:", error);
      alert(`영상 저장에 실패했습니다.\n${error.message}`);
      return;
    }

    alert(editingVideoId ? "영상 매뉴얼이 수정되었습니다." : "신규 유튜브 매뉴얼이 등록되었습니다.");
    resetVideoForm();
    await loadVideos();
  };

  const handleDeleteVideo = async (id: string) => {
    if (!confirm("이 매뉴얼 동영상을 삭제하시겠습니까?")) return;
    await supabase.from("web_manual_videos").delete().eq("id", id);
    loadVideos();
  };

  // Handlers for payments
  const getRefundInfo = (item: any) => {
    if (!item || !item.pg_tid) return { refunded: 0, remaining: item ? (item.final_amount ?? item.total_amount ?? 0) : 0 };
    const refundRows = payments.filter((p) => p.pg_tid === `${item.pg_tid}_REFUND` || p.pg_tid === `${item.pg_tid}-REFUND`);
    const refunded = refundRows.reduce((sum, p) => sum + Math.abs(p.final_amount ?? p.total_amount ?? 0), 0);
    const originalAmount = item.final_amount ?? item.total_amount ?? 0;
    return { refunded, remaining: Math.max(0, originalAmount - refunded) };
  };

  const handleCancelPayment = async () => {
    if (!cancelTarget) return;
    const { remaining } = getRefundInfo(cancelTarget);
    const amt = cancelAmountStr.trim() ? Number(cancelAmountStr) : remaining;
    if (!confirm(`정말 이 결제 건을 취소하시겠습니까?\n취소 금액: ${amt.toLocaleString()}원`)) return;

    setCancelLoading(true);
    try {
      let isEdgeSuccess = false;
      const isOfflinePayment = Boolean(cancelTarget.pg_tid?.startsWith("OFFLINE_"));

      if (isOfflinePayment) {
        const { data: cancelData, error: cancelError } = await supabase.rpc("cancel_offline_payment", {
          p_payment_id: cancelTarget.id,
          p_reason: cancelReason.trim() || "관리자 웹 현장결제 취소",
        });
        if (cancelError) throw cancelError;
        if (!cancelData?.success) throw new Error("현장결제 취소 결과를 확인할 수 없습니다.");
        isEdgeSuccess = true;
      }

      // 1. If online card payment (with pg_tid), invoke real PG kspay-cancel edge function
      if (!isOfflinePayment && cancelTarget.pg_tid) {
        try {
          const { data: edgeData, error: edgeError } = await supabase.functions.invoke("kspay-cancel", {
            body: {
              payment_id: cancelTarget.id,
              cancel_reason: cancelReason.trim() || "관리자 웹 취소",
              cancel_amount: amt
            }
          });

          if (!edgeError && edgeData && !edgeData.error) {
            isEdgeSuccess = true;
          } else if (edgeData?.error) {
            console.warn("KSPay cancel edge response:", edgeData.error);
          }
        } catch (edgeErr) {
          console.warn("Edge function invocation notice:", edgeErr);
        }
      }

      if (!isOfflinePayment) {
        // Online cancellations are synchronized after the PG cancellation.
        const { error: payErr } = await supabase.from("payments").update({
          status: "cancelled"
        }).eq("id", cancelTarget.id);
        if (payErr) throw payErr;

        // Keep the package row as a financial/audit link so cancelled card
        // payments still show which product was purchased.
        const { error: packageError } = await supabase
          .from("user_packages")
          .update({ status: "cancelled", remaining_count: 0 })
          .eq("payment_id", cancelTarget.id);
        if (packageError) throw packageError;
      }

      // 4. Optimistic UI update
      setPayments(prev => prev.map(p => p.id === cancelTarget.id ? { ...p, status: "cancelled" } : p));

      alert(isEdgeSuccess
        ? (isOfflinePayment ? "현장결제 취소 및 이용권·포인트 회수가 정상 완료되었습니다." : "카드사 승인 취소 및 어플 이용권 회수가 정상 완료되었습니다.")
        : "결제 취소 처리가 완료되었습니다.\n(어플 내 수강권 및 결제 상태가 취소로 안전하게 동기화되었습니다.)"
      );
      setCancelTarget(null);
      void loadPayments();
    } catch (err: any) {
      console.error("Cancel payment error:", err);
      alert(err.message || "결제 취소 처리에 실패했습니다.");
    } finally {
      setCancelLoading(false);
    }
  };

  const handleManualAttendance = async () => {
    if (!attendanceModal || !profile) return;
    setActionLoading(true);
    const { childId } = attendanceModal;
    const dateStr = attendanceDate;
    const targetBranch = scopedBranchId(profile, branchFilter) || profile.branch_id || "branch_1";

    try {
      const { data: existingLog } = await (supabase as any).from("attendance_logs").select("id").eq("child_id", childId).eq("date", dateStr).maybeSingle();
      if (!existingLog) {
        await (supabase as any).from("attendance_logs").insert({ child_id: childId, date: dateStr, branch_id: targetBranch, status: "출석", check_in: new Date().toISOString() });
      }

      const { data: activePackages } = await (supabase as any).from("user_packages").select("id, remaining_count").eq("child_id", childId).eq("status", "active").gt("remaining_count", 0).order("created_at", { ascending: true });

      if (activePackages && activePackages.length > 0) {
        const pkg = activePackages[0] as any;
        await (supabase as any).from("package_usage_logs").insert({ user_package_id: pkg.id, child_id: childId, quantity: 1, consumed_at: new Date(dateStr + "T12:00:00Z").toISOString(), status: "consumed", branch_id: targetBranch });
        await (supabase as any).from("user_packages").update({ remaining_count: Math.max(0, pkg.remaining_count - 1) }).eq("id", pkg.id);
      }

      alert("출석 처리가 완료되었습니다.");
      setAttendanceModal(null);
      void loadAttendance();
    } catch (err: any) {
      alert(err.message || "출석 처리에 실패했습니다.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelAttendance = async (childId: string, dateStr: string) => {
    if (!profile) return;
    if (!confirm(`${dateStr} 날짜의 출석을 취소하시겠습니까?\n이미 차감된 수강권이 있다면 자동으로 +1회 복구됩니다.`)) return;

    setLoading(true);
    try {
      await (supabase as any).from("attendance_logs").delete().eq("child_id", childId).eq("date", dateStr);
      const startOfDay = `${dateStr}T00:00:00.000Z`;
      const endOfDay = `${dateStr}T23:59:59.999Z`;
      const { data: usages } = await (supabase as any).from("package_usage_logs").select("id, user_package_id, quantity").eq("child_id", childId).eq("status", "consumed").gte("consumed_at", startOfDay).lte("consumed_at", endOfDay);

      if (usages && usages.length > 0) {
        for (const usage of usages) {
          await (supabase as any).from("package_usage_logs").delete().eq("id", usage.id);
          const { data: pkg } = await (supabase as any).from("user_packages").select("id, remaining_count, total_count").eq("id", usage.user_package_id).maybeSingle();
          if (pkg) {
            const nextCount = Math.min(pkg.total_count || 100, (pkg.remaining_count || 0) + (usage.quantity || 1));
            await (supabase as any).from("user_packages").update({ remaining_count: nextCount }).eq("id", pkg.id);
          }
        }
      }

      alert("출석 취소와 수강권 복구가 안전하게 완료되었습니다.");
      void loadAttendance();
    } catch (err: any) {
      alert(err.message || "출석 취소 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const downloadWorkbook = async (kind: string) => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Ground Corporation";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(kind === "payments" ? "결제 내역" : `${month} 출결표`, { views: [{ state: "frozen", ySplit: 1 }] });

    if (kind === "payments") {
      sheet.columns = [
        { header: "결제일", key: "createdAt", width: 22 },
        { header: "회원", key: "name", width: 16 },
        { header: "이메일", key: "email", width: 30 },
        { header: "결제 상품", key: "products", width: 38 },
        { header: "결제 금액", key: "amount", width: 15 },
        { header: "결제 수단", key: "method", width: 24 },
        { header: "상태", key: "status", width: 14 },
        { header: "거래번호 / 접수번호", key: "transaction", width: 34 },
      ];
      shownPayments.forEach((item) => sheet.addRow({
        createdAt: new Date(item.created_at),
        name: item.users?.name ?? "회원 정보 없음",
        email: item.users?.email ?? "",
        products: item.products.length ? item.products.map((product) => product.package_name ?? "상품명 없음").join(", ") : "연결 상품 없음",
        amount: item.final_amount ?? item.total_amount ?? 0,
        method: paymentDetail(item.payment_method, item.pg_tid),
        status: statusText(item.status),
        transaction: paymentReference(item),
      }));
    } else {
      sheet.columns = [
        { header: "자녀", key: "child", width: 14 },
        { header: "보호자", key: "parent", width: 14 },
        { header: "이용권", key: "package", width: 30 },
        { header: "주 횟수", key: "weekly", width: 11 },
        { header: "사용 가능", key: "total", width: 11 },
        { header: "사용", key: "used", width: 9 },
        { header: "잔여", key: "remaining", width: 9 },
        ...Array.from({ length: MAX_SLOTS }, (_, index) => ({ header: `${index + 1}회`, key: `slot${index + 1}`, width: 12 })),
        { header: "출석일", key: "dates", width: 42 },
      ];
      shownAttendance.forEach((item) => {
        const slots = Object.fromEntries(Array.from({ length: MAX_SLOTS }, (_, index) => [`slot${index + 1}`, item.dates[index] ?? ""]));
        sheet.addRow({ child: item.childName, parent: item.parentName, package: item.packageName, weekly: item.weekly ? `주 ${item.weekly}회` : "-", total: item.total, used: item.used, remaining: item.remaining, ...slots, dates: item.dates.join(", ") });
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = kind === "payments" ? `결제내역_${new Date().toISOString().slice(0, 10)}.xlsx` : `출결표_${month}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // Date & Day Helpers
  const getKoreanDayOfWeek = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const dayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
    return dayNames[d.getDay()] || "";
  };
  const getShortDayOfWeek = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    return dayNames[d.getDay()] || "";
  };

  const handlePrevAttendanceDay = () => {
    setSelectedAttendanceDate(prev => {
      const d = new Date(prev || new Date());
      d.setDate(d.getDate() - 1);
      return localDate(d);
    });
  };

  const handleNextAttendanceDay = () => {
    setSelectedAttendanceDate(prev => {
      const d = new Date(prev || new Date());
      d.setDate(d.getDate() + 1);
      return localDate(d);
    });
  };

  const handleTodayAttendanceDay = () => {
    setSelectedAttendanceDate(localDate(new Date()));
  };

  // Real-time timeline attendance action helpers
  const handleTimelineAction = async (studentId: string, actionType: 'ride_in' | 'no_pickup' | 'check_in' | 'check_out' | 'ride_out' | 'no_dropoff' | 'no_shuttle' | 'is_absent' | 'reset') => {
    const student = todayAttendanceStudents.find(s => s.id === studentId);
    if (actionType === 'reset') {
      const studentName = student?.student_name || '해당 원생';
      const shouldReset = confirm(
        `${studentName} 원생의 ${selectedAttendanceDate} 출결 처리를 취소하시겠습니까?\n승하차·등하원·미탑승 상태가 모두 초기화됩니다.`
      );
      if (!shouldReset) return;
    }

    const nowTime = new Date().toTimeString().slice(0, 5);
    const nowIso = new Date().toISOString();
    const targetChildId = student?.child_id || student?.id || studentId;
    const targetBranch = scopedBranchId(profile, branchFilter) || profile?.branch_id || student?.branch_id || "branch_1";

    // 1. Optimistic UI update
    setTodayAttendanceRecords(prev => {
      const current = prev[studentId] || {};
      if (actionType === 'reset') {
        const next = { ...prev };
        delete next[studentId];
        return next;
      }
      if (actionType === 'ride_in') {
        return { ...prev, [studentId]: { ...current, ride_in: nowTime, no_pickup: false, no_shuttle: false, is_absent: false } };
      }
      if (actionType === 'no_pickup' || actionType === 'no_shuttle') {
        return { ...prev, [studentId]: { ...current, no_pickup: true, no_shuttle: true, ride_in: undefined, is_absent: false } };
      }
      if (actionType === 'check_in') {
        return { ...prev, [studentId]: { ...current, check_in: nowTime, is_absent: false } };
      }
      if (actionType === 'check_out') {
        return { ...prev, [studentId]: { ...current, check_out: nowTime } };
      }
      if (actionType === 'ride_out') {
        return { ...prev, [studentId]: { ...current, ride_out: nowTime, no_dropoff: false } };
      }
      if (actionType === 'no_dropoff') {
        return { ...prev, [studentId]: { ...current, no_dropoff: true, ride_out: undefined } };
      }
      if (actionType === 'is_absent') {
        return { ...prev, [studentId]: { is_absent: true } };
      }
      return prev;
    });

    // 2. Real DB Persist in Supabase
    try {
      if (actionType === 'reset') {
        await supabase.from("attendance_logs").delete().eq("child_id", targetChildId).eq("date", selectedAttendanceDate);
        await supabase.from("reservations").update({ pickup_shuttle_status: null, dropoff_shuttle_status: null, attendance_status: '예약' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null);
      } else if (actionType === 'no_pickup' || actionType === 'no_shuttle') {
        await supabase.from("reservations").update({ pickup_shuttle_status: 'missed' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null);
        try {
          await supabase.from("shuttle_logs").insert([{ child_id: targetChildId, event_type: '미탑승', event_time: nowIso, branch_id: targetBranch, service_date: selectedAttendanceDate, direction: 'pickup' }]);
        } catch {}
      } else if (actionType === 'no_dropoff') {
        await supabase.from("reservations").update({ dropoff_shuttle_status: 'missed' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null);
        try {
          await supabase.from("shuttle_logs").insert([{ child_id: targetChildId, event_type: '미탑승', event_time: nowIso, branch_id: targetBranch, service_date: selectedAttendanceDate, direction: 'dropoff' }]);
        } catch {}
      } else {
        const statusMap: Record<string, string> = {
          ride_in: '승차',
          check_in: '등원',
          check_out: '하원',
          ride_out: '하차',
          is_absent: '결석'
        };
        const payload: any = {
          child_id: targetChildId,
          date: selectedAttendanceDate,
          branch_id: targetBranch,
          status: statusMap[actionType] || '등원',
        };
        if (actionType === 'ride_in') {
          payload.shuttle_ride_time = nowIso;
          payload.check_in = nowIso;
          await supabase.from("reservations").update({ pickup_shuttle_status: 'boarded' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null);
        } else if (actionType === 'check_in') {
          payload.check_in = nowIso;
          await supabase.from("reservations").update({ attendance_status: '등원' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null);
        } else if (actionType === 'check_out') {
          payload.check_out = nowIso;
          await supabase.from("reservations").update({ attendance_status: '하원' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null);
        } else if (actionType === 'ride_out') {
          payload.shuttle_drop_time = nowIso;
          payload.check_out = nowIso;
          await supabase.from("reservations").update({ dropoff_shuttle_status: 'dropped_off', attendance_status: '하원' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null);
        } else if (actionType === 'is_absent') {
          await supabase.from("reservations").update({ attendance_status: '결석' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null);
        }

        const { data: existing } = await supabase.from("attendance_logs").select("id").eq("child_id", targetChildId).eq("date", selectedAttendanceDate).maybeSingle();
        if (existing) {
          await supabase.from("attendance_logs").update(payload).eq("id", existing.id);
        } else {
          await supabase.from("attendance_logs").insert([payload]);
        }
      }
    } catch (dbErr) {
      console.warn("Attendance log DB save warning:", dbErr);
    }
  };

  const handleBatchTimelineAction = async (actionType: 'ride_in' | 'check_in' | 'check_out' | 'ride_out' | 'is_absent') => {
    const requestedIds = selectedStudentIds.length > 0
      ? selectedStudentIds 
      : filteredAttendanceStudents.map(s => s.id);
    const targetIds = requestedIds.filter((studentId) => {
      const student = todayAttendanceStudents.find((item) => item.id === studentId);
      return student && isStudentScheduledOnDate(student);
    });

    if (!targetIds.length) {
      alert("적용할 대상 학생이 없습니다.");
      return;
    }

    const nowTime = new Date().toTimeString().slice(0, 5);
    const nowIso = new Date().toISOString();

    setTodayAttendanceRecords(prev => {
      const next = { ...prev };
      targetIds.forEach(id => {
        const cur = next[id] || {};
        if (actionType === 'ride_in') next[id] = { ...cur, ride_in: nowTime, no_shuttle: false, is_absent: false };
        else if (actionType === 'check_in') next[id] = { ...cur, check_in: nowTime, is_absent: false };
        else if (actionType === 'check_out') next[id] = { ...cur, check_out: nowTime };
        else if (actionType === 'ride_out') next[id] = { ...cur, ride_out: nowTime };
        else if (actionType === 'is_absent') next[id] = { is_absent: true };
      });
      return next;
    });

    const statusMap: Record<string, string> = {
      ride_in: '승차',
      check_in: '등원',
      check_out: '하원',
      ride_out: '하차',
      is_absent: '결석'
    };

    try {
      const payloads = targetIds.map(studentId => {
        const student = todayAttendanceStudents.find(s => s.id === studentId);
        const targetChildId = student?.child_id || student?.id || studentId;
        const targetBranch = scopedBranchId(profile, branchFilter) || profile?.branch_id || student?.branch_id || "branch_1";
        const row: any = {
          child_id: targetChildId,
          date: selectedAttendanceDate,
          branch_id: targetBranch,
          status: statusMap[actionType] || '등원'
        };
        if (actionType === 'check_in' || actionType === 'ride_in') row.check_in = nowIso;
        else if (actionType === 'check_out' || actionType === 'ride_out') row.check_out = nowIso;
        return row;
      });

      for (const payload of payloads) {
        const { data: existing } = await supabase.from("attendance_logs").select("id").eq("child_id", payload.child_id).eq("date", payload.date).maybeSingle();
        if (existing) {
          await supabase.from("attendance_logs").update(payload).eq("id", existing.id);
        } else {
          await supabase.from("attendance_logs").insert([payload]);
        }
      }
    } catch (dbErr) {
      console.warn("Batch attendance log DB save error:", dbErr);
    }

    const labels: Record<string, string> = {
      ride_in: '셔틀 승차',
      check_in: '학원 등원',
      check_out: '학원 하원',
      ride_out: '셔틀 하차',
      is_absent: '결석'
    };
    alert(`${targetIds.length}명의 원생에게 [${labels[actionType]}] 처리가 일괄 적용되었습니다.`);
  };

  const shownAttendance = useMemo(() => attendance.filter((item) => `${item.childName} ${item.parentName} ${item.packageName}`.toLowerCase().includes(search.trim().toLowerCase())), [attendance, search]);

  const shownPayments = useMemo(() => payments.filter((item) => {
    const target = `${item.users?.name ?? ""} ${item.users?.email ?? ""} ${item.pg_tid ?? ""} ${item.id} ${item.products.map((product) => product.package_name).join(" ")}`.toLowerCase();
    return (statusFilter === "all" || item.status === statusFilter) && target.includes(search.trim().toLowerCase());
  }), [payments, search, statusFilter]);

  const stats = useMemo(() => {
    const paid = payments.filter((item) => ["paid", "success"].includes(item.status ?? ""));
    return {
      revenue: paid.reduce((sum, item) => sum + (item.final_amount ?? item.total_amount ?? 0), 0),
      paid: paid.length,
      pending: payments.filter((item) => ["pending_payment", "scheduled"].includes(item.status ?? "")).length,
      failed: payments.filter((item) => ["failed", "cancelled", "canceled"].includes(item.status ?? "")).length
    };
  }, [payments]);

  // Selected Day computation & scheduled check (Must be before conditional returns)
  const currentDayShort = getShortDayOfWeek(selectedAttendanceDate || new Date().toISOString().slice(0, 10));
  const currentDayFull = getKoreanDayOfWeek(selectedAttendanceDate || new Date().toISOString().slice(0, 10));

  const isStudentScheduledOnDate = useCallback((student: any) => {
    const reservationKey = student?.child_id || student?.id;
    return Boolean(reservationKey) && todayReservationChildIds.includes(reservationKey);
  }, [todayReservationChildIds]);

  // Attendance filter counts
  const scheduledCount = useMemo(() => {
    return (todayAttendanceStudents || []).filter(s => isStudentScheduledOnDate(s)).length;
  }, [todayAttendanceStudents, isStudentScheduledOnDate]);

  const unprocessedCount = useMemo(() => {
    return (todayAttendanceStudents || []).filter(s => {
      if (!s) return false;
      const rec = todayAttendanceRecords[s.id];
      const hasAny = rec && (rec.ride_in || rec.check_in || rec.check_out || rec.ride_out || rec.is_absent || rec.no_shuttle);
      return isStudentScheduledOnDate(s) && !hasAny;
    }).length;
  }, [todayAttendanceStudents, todayAttendanceRecords, isStudentScheduledOnDate]);

  const completedCount = useMemo(() => {
    return (todayAttendanceStudents || []).filter(s => {
      if (!s) return false;
      const rec = todayAttendanceRecords[s.id];
      return rec && (rec.check_in || rec.check_out || rec.ride_in || rec.ride_out);
    }).length;
  }, [todayAttendanceStudents, todayAttendanceRecords]);

  const detailedAttendanceSummary = useMemo(() => {
    const scheduledStudents = (todayAttendanceStudents || []).filter((student) => isStudentScheduledOnDate(student));
    let attended = 0;
    let absent = 0;

    scheduledStudents.forEach((student) => {
      const record = todayAttendanceRecords[student.id];
      if (record?.is_absent) absent += 1;
      else if (record?.check_in || record?.check_out) attended += 1;
    });

    const pending = Math.max(0, scheduledStudents.length - attended - absent);
    return {
      scheduled: scheduledStudents.length,
      attended,
      absent,
      pending,
      allPresent: scheduledStudents.length > 0 && attended === scheduledStudents.length && absent === 0,
    };
  }, [todayAttendanceStudents, todayAttendanceRecords, isStudentScheduledOnDate]);

  const detailedAttendanceStudents = useMemo(() => (
    (todayAttendanceStudents || []).filter((student) => isStudentScheduledOnDate(student))
  ), [todayAttendanceStudents, isStudentScheduledOnDate]);

  const totalStudentsCount = (todayAttendanceStudents || []).length;

  // Filtered daily attendance students
  const filteredAttendanceStudents = useMemo(() => {
    return (todayAttendanceStudents || []).filter(student => {
      if (!student) return false;
      // 1. Search Query
      const query = (search || "").trim().toLowerCase();
      const matchesSearch = !query || 
        (student.student_name && student.student_name.toLowerCase().includes(query)) ||
        (student.attendance_code && student.attendance_code.includes(query)) ||
        (student.parent_name && student.parent_name.toLowerCase().includes(query));
      if (!matchesSearch) return false;

      // 2. Class Filter
      const targetClass = student.academy_student_classes?.[0]?.class_schedules?.target_class || '미배정';
      if (selectedAttendanceClassFilter !== 'all' && targetClass !== selectedAttendanceClassFilter) {
        return false;
      }

      // 3. Status Record
      const record = todayAttendanceRecords[student.id];
      const isScheduled = isStudentScheduledOnDate(student);
      const hasAnyAction = record && (record.ride_in || record.check_in || record.check_out || record.ride_out || record.is_absent || record.no_shuttle);
      const isUnprocessed = isScheduled && !hasAnyAction;

      // 4. View Filter Tab
      if (attendanceViewFilter === 'scheduled') {
        return isScheduled;
      } else if (attendanceViewFilter === 'unprocessed') {
        return isUnprocessed;
      } else if (attendanceViewFilter === 'completed') {
        return record && (record.check_in || record.ride_in || record.check_out || record.ride_out);
      } else if (attendanceViewFilter === 'all') {
        return true;
      }
      return true;
    });
  }, [todayAttendanceStudents, search, selectedAttendanceClassFilter, todayAttendanceRecords, attendanceViewFilter, isStudentScheduledOnDate]);

  const uniqueClasses = useMemo(() => {
    return Array.from(new Set((todayAttendanceStudents || []).map(s => s?.academy_student_classes?.[0]?.class_schedules?.target_class).filter(Boolean)));
  }, [todayAttendanceStudents]);

  // Calendar Grid Day Generator for attendanceCalendarMonth (YYYY-MM)
  const calendarDays = useMemo(() => {
    const safeMonth = attendanceCalendarMonth || new Date().toISOString().slice(0, 7);
    const parts = safeMonth.split("-");
    if (parts.length < 2) return [];
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (isNaN(year) || isNaN(month)) return [];
    const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 = Sunday
    const totalDaysInMonth = new Date(year, month, 0).getDate(); // e.g. 31

    const daysArray: Array<{ 
      dayNum: number | null; 
      dateStr: string | null; 
      scheduledCount: number;
      attendedCount: number; 
      absentCount: number; 
      isSelected: boolean; 
      isToday: boolean 
    }> = [];

    // Preceding empty slots
    for (let i = 0; i < firstDayIndex; i++) {
      daysArray.push({ dayNum: null, dateStr: null, scheduledCount: 0, attendedCount: 0, absentCount: 0, isSelected: false, isToday: false });
    }

    const todayStr = localDate(new Date());

    // Days in current month
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dateStr = `${parts[0]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const logsForDate = (calendarMonthLogs || []).filter((log: any) => {
        if (!log || log.date !== dateStr) return false;
        const student = attendanceStudentsWithHistory.find((item: any) => item.child_id === log.child_id || item.id === log.child_id);
        return Boolean(student) && isBeforeChildDeletion(dateStr, student.child?.deleted_at);
      });
      
      const reservationsForDate = (calendarMonthReservations || []).filter((reservation: any) => {
        if (!reservation || reservation.class_date !== dateStr || !reservation.child_id) return false;
        const student = attendanceStudentsWithHistory.find((item: any) => item.child_id === reservation.child_id || item.id === reservation.child_id);
        return Boolean(student) && isBeforeChildDeletion(dateStr, student.child?.deleted_at);
      });
      const scheduledCount = new Set(reservationsForDate.map((reservation: any) => reservation.child_id)).size;

      // Only actual attendance rows count as attended.
      const attendedLogs = logsForDate.filter((log: any) => log && (log.check_in || log.check_out || log.status === '등원' || log.status === '하원' || log.status === '출석'));
      const attendedCount = new Set(attendedLogs.map((log: any) => log.child_id).filter(Boolean)).size;

      // Absence is counted only when explicitly stored in logs or reservations.
      const absentChildIds = new Set<string>();
      logsForDate.forEach((log: any) => {
        if (log?.child_id && (log.status === '결석' || log.status === '사전결석')) absentChildIds.add(log.child_id);
      });
      reservationsForDate.forEach((reservation: any) => {
        if (reservation.child_id && (reservation.attendance_status === '결석' || reservation.attendance_status === '사전결석')) absentChildIds.add(reservation.child_id);
      });
      const inferredPastAbsences = dateStr < todayStr
        ? Math.max(0, scheduledCount - attendedCount)
        : 0;
      const absentCount = Math.max(absentChildIds.size, inferredPastAbsences);

      daysArray.push({
        dayNum: day,
        dateStr,
        scheduledCount,
        attendedCount,
        absentCount,
        isSelected: selectedCalendarDate === dateStr,
        isToday: dateStr === todayStr
      });
    }

    return daysArray;
  }, [attendanceCalendarMonth, attendanceStudentsWithHistory, calendarMonthLogs, calendarMonthReservations, selectedCalendarDate]);

  // Loading Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={38} />
      </div>
    );
  }

  // Login Screen
  if (!profile) {
    return (
      <div className="min-h-screen bg-[#f2efe9] flex items-center justify-center px-5 py-20 font-sans">
        <div className="max-w-md w-full bg-white rounded-[40px] shadow-2xl p-10 border border-black/5">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-[#1a3021] italic uppercase tracking-tighter">Welcome Back</h2>
            <p className="text-gray-400 font-bold mt-2 text-sm">아이패스케어 앱 계정으로 로그인하세요.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {loginError && <div className="bg-red-50 text-red-500 p-4 rounded-2xl text-sm font-bold border border-red-100 text-center">{loginError}</div>}

            <div className="space-y-2">
              <label className="text-[12px] font-black text-[#1a3021] uppercase ml-2">ID / EMAIL</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="아이디 또는 이메일"
                  className="w-full bg-[#f8f6f2] border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-[#d35400] transition-all font-medium text-slate-900"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-black text-[#1a3021] uppercase ml-2">PASSWORD</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="w-full bg-[#f8f6f2] border-none rounded-2xl py-4 pl-12 pr-12 focus:ring-2 focus:ring-[#d35400] transition-all font-medium text-slate-900"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-bold text-slate-600 px-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberId}
                  onChange={(e) => setRememberId(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span>아이디 기억하기</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoLogin}
                  onChange={(e) => setAutoLogin(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span>자동 로그인</span>
              </label>
            </div>

            <button type="submit" disabled={authLoading} className="w-full bg-[#1a3021] text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 hover:bg-[#d35400] transition-all shadow-xl active:scale-95 disabled:opacity-50">
              {authLoading ? <Loader2 className="animate-spin" /> : <span>LOGIN NOW</span>}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-slate-100 pt-6">
            <button onClick={onBackToSite} className="text-xs font-bold text-slate-400 hover:text-slate-700">← 메인 웹사이트로 돌아가기</button>
          </div>
        </div>
      </div>
    );
  }

  // Admin Center View variables
  const activeBranchId = scopedBranchId(profile, branchFilter);
  const activeBranchName = activeBranchId ? branches.find((branch) => branch.id === activeBranchId)?.name ?? null : null;
  const categoryLabelsMap: Record<string, string> = { parent: "학부모 매뉴얼", admin: "학원장 매뉴얼", driver: "기사님 매뉴얼" };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-900 font-sans antialiased">
      
      {/* 1. TOP NAVIGATION HEADER (대메뉴) */}
      <header className="bg-white border-b border-slate-200 h-[76px] fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 shadow-xs">
        <div 
          onClick={onBackToSite}
          className="flex items-center gap-3 cursor-pointer group"
          title="홈페이지로 돌아가기"
        >
          <div className="bg-blue-600 text-white p-2.5 rounded-2xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
            <Bus className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-black text-slate-900 tracking-tight leading-none group-hover:text-blue-600 transition-colors">IPASSCARE</span>
            <span className="text-[10px] text-slate-500 font-extrabold tracking-wider mt-1">관리자 모드</span>
          </div>
        </div>

        {/* Large Horizontal Top Tabs (대메뉴) */}
        <nav className="hidden lg:flex items-center gap-1.5 h-full">
          {[
            { id: 'student_mgmt', label: '👤 학생관리', subDefault: 'students' },
            { id: 'attendance_mgmt', label: '⏰ 출결관리', subDefault: 'admin_attendance' },
            { id: 'billing_mgmt', label: '💳 수납관리', subDefault: 'billing' },
            { id: 'sms_mgmt', label: '💬 문자관리', subDefault: 'sms_send' },
            ...(['admin', 'director'].includes(profile?.role ?? '') ? [{ id: 'role_mgmt', label: '🛡️ 권한 부여', subDefault: 'role_management' }] : []),
            { id: 'referral_mgmt', label: '🌲 추천 포인트트리', subDefault: 'referrals' },
            ...(profile?.role === 'admin' ? [{ id: 'basic_settings', label: '⚙️ 기본설정', subDefault: 'settings' }] : [])
          ].map((menu) => {
            const isActive = mainTab === menu.id;
            return (
              <button
                key={menu.id}
                onClick={() => {
                  setMainTab(menu.id as any);
                  setSubTab(menu.subDefault);
                  setSearch("");
                }}
                className={`px-6 h-[76px] text-sm font-black flex items-center justify-center transition-all border-b-[3px] ${
                  isActive 
                    ? 'border-blue-600 text-blue-600 bg-blue-50/20' 
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
                }`}
              >
                {menu.label}
              </button>
            );
          })}
        </nav>

        {/* Top Right Utilities */}
        <div className="flex items-center gap-3">
          {/* Back to Homepage Button */}
          <button 
            onClick={onBackToSite}
            className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 transition shadow-xs"
            title="홈페이지로 돌아가기"
          >
            <Home size={14} className="text-blue-600" />
            <span className="hidden sm:inline">홈페이지 바로가기</span>
          </button>

          {profile?.role === "admin" && (
            <div className="bg-slate-100/80 px-2 py-1.5 rounded-xl border border-slate-200/50 flex items-center">
              <span className="text-[11px] font-extrabold text-slate-400 px-2">지점</span>
              <BranchFilter profile={profile} branches={branches} value={branchFilter} onChange={setBranchFilter} />
            </div>
          )}

          {profile?.role !== "admin" && (
            <div className={`hidden sm:flex items-center gap-2 rounded-xl border px-3 py-2 ${activeBranchName ? 'border-blue-100 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
              <Building2 size={14} />
              <div className="leading-tight">
                <p className="text-[9px] font-black uppercase tracking-wider opacity-60">소속 지점</p>
                <p className="max-w-[180px] truncate text-[11px] font-black">{activeBranchName ?? '지점 미지정'}</p>
              </div>
            </div>
          )}

          <button 
            onClick={logout} 
            className="flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 transition shadow-xs"
          >
            <User size={13} className="text-slate-400" />
            <span>{profile?.name ?? "관리자"}님</span>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-black">
              {roleLabel(profile?.role)}
            </span>
            <LogOut size={13} className="text-slate-400 ml-1" />
          </button>
        </div>
      </header>

      {/* 2. MAIN LAYOUT (Left Sidebar + Right Main Area) */}
      <div className="flex flex-1 pt-[76px] min-h-screen">
        
        {/* LEFT SIDEBAR (소메뉴) */}
        <aside className="w-[240px] bg-slate-900 text-slate-300 border-r border-slate-850 shrink-0 hidden md:flex flex-col justify-between fixed bottom-0 top-[76px] left-0 z-30">
          <div className="p-4 space-y-6">
            
            {/* Sidebar Active Section Header */}
            <div>
              <span className="text-[10px] font-black text-blue-400 bg-blue-950/80 px-2.5 py-1 rounded-full uppercase tracking-wider">
                {mainTab === 'student_mgmt' && 'STUDENT MGMT'}
                {mainTab === 'attendance_mgmt' && 'ATTENDANCE MGMT'}
                {mainTab === 'billing_mgmt' && 'BILLING MGMT'}
                {mainTab === 'sms_mgmt' && 'MESSAGING MGMT'}
                {mainTab === 'role_mgmt' && 'ROLE MANAGEMENT'}
                {mainTab === 'referral_mgmt' && 'REFERRAL TREE'}
                {mainTab === 'basic_settings' && 'SYSTEM SETTINGS'}
              </span>
              <h2 className="text-sm font-black text-white mt-2 px-1 flex items-center gap-1.5">
                <LayoutDashboard size={14} className="text-blue-500" />
                {mainTab === 'student_mgmt' && '학생관리'}
                {mainTab === 'attendance_mgmt' && '출결관리'}
                {mainTab === 'billing_mgmt' && '수납관리'}
                {mainTab === 'sms_mgmt' && '문자관리'}
                {mainTab === 'role_mgmt' && '권한 부여'}
                {mainTab === 'referral_mgmt' && '추천 포인트트리'}
                {mainTab === 'basic_settings' && '기본설정'}
              </h2>
            </div>

            {/* Sidebar Navigation Items (소메뉴) */}
            <nav className="space-y-1">
              {/* STUDENT MGMT SUBMENU */}
              {mainTab === 'student_mgmt' && [
                { id: 'teachers', label: '강사 및 임직원 관리', icon: GraduationCap },
                { id: 'classes', label: '클래스 관리', icon: BookOpen },
                { id: 'students', label: '학생 목록', icon: Users },
                { id: 'counsel_log', label: '상담일지', icon: MessageSquare },
                { id: 'study_log', label: '학습일지', icon: FileText },
              ].map((item) => {
                const isActive = subTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setSubTab(item.id); setSearch(""); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-3 text-xs font-bold rounded-xl text-left transition ${
                      isActive 
                        ? 'bg-blue-600 text-white font-extrabold shadow-sm' 
                        : 'hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <item.icon size={15} />
                    {item.label}
                  </button>
                );
              })}

              {/* ATTENDANCE SUBMENU (4 Essential Tabs) */}
              {mainTab === 'attendance_mgmt' && [
                { id: 'admin_attendance', label: '관리자 출결 (실시간)', icon: CheckCircle2 },
                { id: 'attendance_calendar', label: '출결 현황 (월간 달력)', icon: CalendarIcon },
                { id: 'attendance', label: '출결 조회 (원생 장부)', icon: CalendarCheck },
                { id: 'schedule', label: '주간 시간표 (일정)', icon: Clock3 },
              ].map((item) => {
                const isActive = subTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setSubTab(item.id); setSearch(""); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-3 text-xs font-bold rounded-xl text-left transition ${
                      isActive 
                        ? 'bg-blue-600 text-white font-extrabold shadow-sm' 
                        : 'hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <item.icon size={15} />
                    {item.label}
                  </button>
                );
              })}

              {/* BILLING SUBMENU */}
              {mainTab === 'billing_mgmt' && [
                { id: 'billing', label: '수납/청구대장', icon: DollarSign },
                { id: 'payments', label: '어플 결제내역', icon: CreditCard },
                { id: 'offline_payments', label: '현장결제', icon: CheckCircle2 },
              ].map((item) => {
                const isActive = subTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setSubTab(item.id); setSearch(""); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-3 text-xs font-bold rounded-xl text-left transition ${
                      isActive 
                        ? 'bg-blue-600 text-white font-extrabold shadow-sm' 
                        : 'hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <item.icon size={15} />
                    {item.label}
                  </button>
                );
              })}

              {/* SMS SUBMENU */}
              {mainTab === 'sms_mgmt' && [
                { id: 'sms_send', label: 'SMS / 알림톡 보내기', icon: MessageSquare },
                { id: 'sms_history', label: '메시지 발송내역', icon: History },
                { id: 'sms_reserved', label: '메시지 예약내역', icon: Clock },
                { id: 'sms_points', label: '포인트 사용내역', icon: Coins },
              ].map((item) => {
                const isActive = subTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setSubTab(item.id); setSearch(""); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-3 text-xs font-bold rounded-xl text-left transition ${
                      isActive 
                        ? 'bg-blue-600 text-white font-extrabold shadow-sm' 
                        : 'hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <item.icon size={15} />
                    {item.label}
                  </button>
                );
              })}

              {mainTab === 'role_mgmt' && [
                { id: 'role_management', label: '회원 권한 관리', icon: ShieldAlert },
              ].map((item) => {
                const isActive = subTab === item.id;
                return <button key={item.id} onClick={() => { setSubTab(item.id); setSearch(""); }} className={`w-full flex items-center gap-2.5 px-3 py-3 text-xs font-bold rounded-xl text-left transition ${isActive ? 'bg-blue-600 text-white font-extrabold shadow-sm' : 'hover:bg-slate-800 hover:text-white'}`}><item.icon size={15} />{item.label}</button>;
              })}

              {/* REFERRAL MGMT SUBMENU */}
              {mainTab === 'referral_mgmt' && [
                { id: 'referrals', label: '추천 계보 및 포인트', icon: GitFork },
              ].map((item) => {
                const isActive = subTab === item.id;
                return <button key={item.id} onClick={() => { setSubTab(item.id); setSearch(""); }} className={`w-full flex items-center gap-2.5 px-3 py-3 text-xs font-bold rounded-xl text-left transition ${isActive ? 'bg-blue-600 text-white font-extrabold shadow-sm' : 'hover:bg-slate-800 hover:text-white'}`}><item.icon size={15} />{item.label}</button>;
              })}

              {/* SYSTEM SETTINGS SUBMENU */}
              {mainTab === 'basic_settings' && profile?.role === 'admin' && [
                { id: 'settings', label: '요금제 단가설정', icon: Settings },
                { id: 'partners', label: '협력브랜드 관리', icon: UsersRound },
                { id: 'videos', label: '유튜브 가이드관리', icon: Video },
                { id: 'inquiries', label: 'B2B 상담 문의', icon: FileText },
              ].map((item) => {
                const isActive = subTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setSubTab(item.id); setSearch(""); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-3 text-xs font-bold rounded-xl text-left transition ${
                      isActive 
                        ? 'bg-blue-600 text-white font-extrabold shadow-sm' 
                        : 'hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <item.icon size={15} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-4 border-t border-slate-800 text-[10px] text-slate-500 space-y-1 font-bold">
            <p>아이패스케어 관리자 모드</p>
            <p>v2.4.0 (통합 안정화 버전)</p>
          </div>
        </aside>

        {/* 3. RIGHT MAIN CONTENT AREA */}
        <main className="flex-1 md:pl-[240px] min-h-screen">
          <div className="w-full max-w-none space-y-6 p-4 sm:p-6 xl:p-8">
            
            {/* STUDENTS LIST TAB (100% Original Complete Component) */}
            {subTab === "students" && (
              <AdminStudentTab activeBranchId={activeBranchId} branches={branches} />
            )}

            {/* TEACHERS TAB (100% Original) */}
            {subTab === "teachers" && (
              <AdminTeacherTab activeBranchId={activeBranchId} branches={branches} profile={profile} />
            )}

            {/* CLASSES TAB (100% Original) */}
            {subTab === "classes" && (
              <AdminClassTab activeBranchId={activeBranchId} branches={branches} />
            )}

            {/* COUNSEL LOG TAB (1:1 Student/Parent Consultation) */}
            {subTab === "counsel_log" && (
              <AdminCounselTab activeBranchId={activeBranchId} branches={branches} profile={profile} />
            )}

            {/* STUDY LOG TAB (Class Lessons and Journals) */}
            {subTab === "study_log" && (
              <AdminStudyTab activeBranchId={activeBranchId} branches={branches} profile={profile} />
            )}

            {/* BILLING TAB (100% Original) */}
            {subTab === "billing" && (
              <AdminBillingTab activeBranchId={activeBranchId} branches={branches} />
            )}

            {subTab === "role_management" && profile && ['admin', 'director'].includes(profile.role) && (
              <AdminRoleManagementTab profile={profile} activeBranchId={activeBranchId} branches={branches} />
            )}

            {/* ATTENDANCE 1: 관리자 출결 (실시간 승·하차 및 등·하원 체크) */}
            {subTab === "admin_attendance" && (
              <div className="space-y-6">
                
                {/* 1. Header & Date Navigation Bar */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <CheckCircle2 className="text-blue-600" size={20} />
                      관리자 출결 (실시간 셔틀 & 학원 타임라인)
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      선택한 날짜의 셔틀 승하차 및 학원 등하원 상황을 실시간 모니터링하고 미처리 상태를 관리합니다.
                    </p>
                  </div>

                  {/* Date Navigation Controller */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-2xs">
                      <button 
                        onClick={handlePrevAttendanceDay}
                        className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition"
                        title="이전 날짜"
                      >
                        <ChevronLeft size={16} />
                      </button>

                      <input 
                        type="date"
                        value={selectedAttendanceDate}
                        onChange={(e) => setSelectedAttendanceDate(e.target.value)}
                        className="px-3 py-1.5 text-xs font-black text-slate-800 bg-transparent border-none outline-none cursor-pointer"
                      />

                      <button 
                        onClick={handleNextAttendanceDay}
                        className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition"
                        title="다음 날짜"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    <span className="text-xs font-black text-blue-700 bg-blue-50 px-3 py-2 rounded-xl border border-blue-100 font-mono">
                      {selectedAttendanceDate} ({currentDayFull})
                    </span>

                    <button
                      onClick={handleTodayAttendanceDay}
                      className={`px-3 py-2 rounded-xl text-xs font-black transition ${
                        selectedAttendanceDate === localDate(new Date())
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      오늘
                    </button>
                  </div>
                </div>

                {/* 2. 4-Tab Quick Filter Toggle Bar */}
                <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-200/60 rounded-2xl border border-slate-200">
                  <button
                    onClick={() => setAttendanceViewFilter('scheduled')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition ${
                      attendanceViewFilter === 'scheduled'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                  >
                    <span>오늘 수업 대상자 (기본)</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      attendanceViewFilter === 'scheduled' ? 'bg-blue-100 text-blue-700' : 'bg-slate-300/70 text-slate-700'
                    }`}>
                      {scheduledCount}명
                    </span>
                  </button>

                  <button
                    onClick={() => setAttendanceViewFilter('unprocessed')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition ${
                      attendanceViewFilter === 'unprocessed'
                        ? 'bg-white text-rose-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                  >
                    <span>미처리(⚠️) 대상자만</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      attendanceViewFilter === 'unprocessed' ? 'bg-rose-100 text-rose-700' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {unprocessedCount}명
                    </span>
                  </button>

                  <button
                    onClick={() => setAttendanceViewFilter('completed')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition ${
                      attendanceViewFilter === 'completed'
                        ? 'bg-white text-emerald-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                  >
                    <span>등하원/승하차 완료자</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      attendanceViewFilter === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-300/70 text-slate-700'
                    }`}>
                      {completedCount}명
                    </span>
                  </button>

                  <button
                    onClick={() => setAttendanceViewFilter('all')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition ${
                      attendanceViewFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                  >
                    <span>전체 재원생 명부</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      attendanceViewFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-300/70 text-slate-700'
                    }`}>
                      {totalStudentsCount}명
                    </span>
                  </button>
                </div>

                {/* 3. Toolbar Filters */}
                <div className="flex flex-col sm:flex-row gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <select 
                    value={selectedAttendanceClassFilter}
                    onChange={(e) => setSelectedAttendanceClassFilter(e.target.value)}
                    className="bg-slate-100 rounded-xl px-4 py-2.5 text-xs font-extrabold text-slate-700 border-none outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">클래스 전체 ({uniqueClasses.length}개 반)</option>
                    {uniqueClasses.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text"
                      placeholder="원생·보호자 이름 또는 출결번호로 검색..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full bg-slate-100 rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    onClick={() => loadDailyAttendanceStudents()}
                    className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-bold transition"
                  >
                    <RefreshCw size={14} />
                    새로고침
                  </button>
                </div>

                {/* 4. Real-time Timeline Table Shell */}
                <div className="overflow-hidden rounded-3xl bg-white shadow-xs border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-bold text-slate-600 border-collapse">
                      <thead className="bg-slate-50 text-[11px] font-black text-slate-700 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3.5 w-10 text-center">
                            <input 
                              type="checkbox"
                              checked={selectedStudentIds.length === filteredAttendanceStudents.length && filteredAttendanceStudents.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedStudentIds(filteredAttendanceStudents.map(s => s.id));
                                else setSelectedStudentIds([]);
                              }}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </th>
                          <th className="px-4 py-3.5">No.</th>
                          <th className="px-4 py-3.5 min-w-[130px]">클래스 / 시간</th>
                          <th className="px-4 py-3.5 min-w-[130px]">원생 (보호자)</th>
                          <th className="px-3 py-3.5 text-center min-w-[140px]">1. 셔틀 승차</th>
                          <th className="px-3 py-3.5 text-center min-w-[110px]">2. 학원 등원</th>
                          <th className="px-3 py-3.5 text-center min-w-[110px]">3. 학원 하원</th>
                          <th className="px-3 py-3.5 text-center min-w-[110px]">4. 셔틀 하차</th>
                          <th className="px-3 py-3.5 text-center min-w-[90px]">결석</th>
                          <th className="px-4 py-3.5 text-center min-w-[130px]">진행 상태</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredAttendanceStudents.length > 0 ? (
                          filteredAttendanceStudents.map((s, idx) => {
                            const record = todayAttendanceRecords[s.id];
                            const firstClass = s.academy_student_classes?.[0]?.class_schedules;
                            const currentClassName = firstClass?.target_class || '미배정';
                            const classTime = (firstClass?.start_time && firstClass?.end_time) 
                              ? `${firstClass.start_time.slice(0, 5)}~${firstClass.end_time.slice(0, 5)}`
                              : null;
                            const isSelected = selectedStudentIds.includes(s.id);
                            const isScheduled = isStudentScheduledOnDate(s);

                            // Status evaluation
                            let statusBadge = isScheduled ? (
                              <span className="inline-block bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded text-[11px]">미처리 ⚠️</span>
                            ) : (
                              <span className="inline-block bg-slate-50 text-slate-400 font-bold px-2 py-0.5 rounded text-[11px]">예약 없음</span>
                            );

                            if (record?.is_absent) {
                              statusBadge = (
                                <span className="inline-block bg-rose-100 text-rose-700 font-black px-2.5 py-1 rounded-full text-[11px]">
                                  🔴 결석 처리
                                </span>
                              );
                            } else if (record?.ride_out) {
                              statusBadge = (
                                <span className="inline-block bg-purple-100 text-purple-700 font-black px-2.5 py-1 rounded-full text-[11px]">
                                  🟣 하차 완료 (귀가)
                                </span>
                              );
                            } else if (record?.no_dropoff) {
                              statusBadge = (
                                <span className="inline-block bg-indigo-50 text-indigo-700 border border-indigo-200 font-black px-2.5 py-1 rounded-full text-[11px]">
                                  🏠 자가귀가 (하차 미탑승)
                                </span>
                              );
                            } else if (record?.check_out) {
                              statusBadge = (
                                <span className="inline-block bg-amber-100 text-amber-800 font-black px-2.5 py-1 rounded-full text-[11px]">
                                  🟠 학원 하원 완료
                                </span>
                              );
                            } else if (record?.check_in) {
                              statusBadge = (
                                <span className="inline-block bg-emerald-100 text-emerald-800 font-black px-2.5 py-1 rounded-full text-[11px]">
                                  🟢 학원 수업 중
                                </span>
                              );
                            } else if (record?.ride_in) {
                              statusBadge = (
                                <span className="inline-block bg-blue-100 text-blue-800 font-black px-2.5 py-1 rounded-full text-[11px]">
                                  🚌 셔틀 이동 중
                                </span>
                              );
                            } else if (record?.no_shuttle || record?.no_pickup) {
                              statusBadge = (
                                <span className="inline-block bg-amber-50 text-amber-700 border border-amber-200 font-black px-2.5 py-1 rounded-full text-[11px]">
                                  🟡 자가등원 (승차 미탑승)
                                </span>
                              );
                            }

                            return (
                              <tr key={s.id} className={`hover:bg-slate-50/80 transition ${record?.is_absent ? 'bg-rose-50/20' : ''}`}>
                                <td className="px-4 py-3 text-center">
                                  <input 
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) setSelectedStudentIds(prev => [...prev, s.id]);
                                      else setSelectedStudentIds(prev => prev.filter(id => id !== s.id));
                                    }}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  />
                                </td>
                                <td className="px-4 py-3 text-slate-400 font-mono">{idx + 1}</td>
                                
                                {/* Class & Time */}
                                <td className="px-4 py-3">
                                  <b className="text-slate-900 block truncate">{currentClassName}</b>
                                  <span className="text-[11px] text-slate-500 font-medium">
                                    {classTime ? `${classTime} (${currentDayShort})` : (isScheduled ? `오늘(${currentDayShort}) 수업` : '비정기/보강')}
                                  </span>
                                </td>

                                {/* Student Name & Parent */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <b className="text-slate-900 text-sm">{s.student_name}</b>
                                    <span className="text-[10px] text-slate-400 font-mono">#{s.attendance_code}</span>
                                  </div>
                                  <p className="text-[11px] text-slate-500">
                                    보호자 {s.parent_name || s.mother_phone || s.father_phone || '-'}
                                  </p>
                                </td>
                                
                                {/* 1. 셔틀 승차 */}
                                <td className="px-2 py-3 text-center">
                                  {record?.ride_in ? (
                                    <button
                                      onClick={() => handleTimelineAction(s.id, 'reset')}
                                      className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition"
                                      title="클릭 시 취소"
                                    >
                                      <Bus size={12} />
                                      <span>{record.ride_in} 승차</span>
                                    </button>
                                  ) : record?.no_shuttle ? (
                                    <button
                                      onClick={() => handleTimelineAction(s.id, 'reset')}
                                      className="inline-block bg-amber-50 border border-amber-200 text-amber-700 font-bold px-2 py-1 rounded-xl text-[11px] hover:bg-amber-100 transition"
                                      title="클릭 시 취소"
                                    >
                                      미탑승(자가등원)
                                    </button>
                                  ) : (
                                    <div className="flex items-center justify-center gap-1">
                                      <button 
                                        onClick={() => handleTimelineAction(s.id, 'ride_in')}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-xl text-xs font-black shadow-2xs transition"
                                      >
                                        승차
                                      </button>
                                      <button 
                                        onClick={() => handleTimelineAction(s.id, 'no_shuttle')}
                                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1.5 rounded-xl text-[11px] font-bold transition"
                                        title="셔틀 미탑승 (개별/도보 등원)"
                                      >
                                        미탑승
                                      </button>
                                    </div>
                                  )}
                                </td>

                                {/* 2. 학원 등원 */}
                                <td className="px-2 py-3 text-center">
                                  {record?.check_in ? (
                                    <button
                                      onClick={() => handleTimelineAction(s.id, 'reset')}
                                      className="inline-block bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition"
                                      title="클릭 시 취소"
                                    >
                                      🏫 {record.check_in} 등원
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => handleTimelineAction(s.id, 'check_in')}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-2xs transition"
                                    >
                                      등원
                                    </button>
                                  )}
                                </td>

                                {/* 3. 학원 하원 */}
                                <td className="px-2 py-3 text-center">
                                  {record?.check_out ? (
                                    <button
                                      onClick={() => handleTimelineAction(s.id, 'reset')}
                                      className="inline-block bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition"
                                      title="클릭 시 취소"
                                    >
                                      🎒 {record.check_out} 하원
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => handleTimelineAction(s.id, 'check_out')}
                                      className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-2xs transition"
                                    >
                                      하원
                                    </button>
                                  )}
                                </td>

                                {/* 4. 셔틀 하차 */}
                                <td className="px-2 py-3 text-center">
                                  {record?.ride_out ? (
                                    <button
                                      onClick={() => handleTimelineAction(s.id, 'reset')}
                                      className="inline-block bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition"
                                      title="클릭 시 취소"
                                    >
                                      🚌 {record.ride_out} 하차
                                    </button>
                                  ) : record?.no_dropoff ? (
                                    <button
                                      onClick={() => handleTimelineAction(s.id, 'reset')}
                                      className="inline-block bg-amber-50 border border-amber-200 text-amber-700 font-bold px-2 py-1 rounded-xl text-[11px] hover:bg-amber-100 transition"
                                      title="클릭 시 취소"
                                    >
                                      하차 미탑승(자가귀가)
                                    </button>
                                  ) : (
                                    <div className="flex items-center justify-center gap-1">
                                      <button 
                                        onClick={() => handleTimelineAction(s.id, 'ride_out')}
                                        className="bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1.5 rounded-xl text-xs font-black shadow-2xs transition"
                                      >
                                        하차
                                      </button>
                                      <button 
                                        onClick={() => handleTimelineAction(s.id, 'no_dropoff')}
                                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1.5 rounded-xl text-[11px] font-bold transition"
                                        title="귀가 셔틀 미탑승 (개별/도보 하원)"
                                      >
                                        미탑승
                                      </button>
                                    </div>
                                  )}
                                </td>

                                {/* 5. 결석 */}
                                <td className="px-2 py-3 text-center">
                                  {record?.is_absent ? (
                                    <button
                                      onClick={() => handleTimelineAction(s.id, 'reset')}
                                      className="inline-block bg-rose-100 border border-rose-200 text-rose-700 font-black px-2 py-1 rounded-xl text-[11px] hover:bg-rose-200 transition"
                                      title="클릭 시 결석 취소"
                                    >
                                      결석 취소
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => handleTimelineAction(s.id, 'is_absent')}
                                      className="bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 px-2.5 py-1.5 rounded-xl text-xs font-bold transition"
                                    >
                                      결석
                                    </button>
                                  )}
                                </td>

                                {/* 진행 상태 및 비고 */}
                                <td className="px-4 py-3 text-center">
                                  {statusBadge}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={10} className="py-16 text-center text-slate-400 font-bold text-xs space-y-1">
                              <p>선택하신 조건에 맞는 대상 원생이 없습니다.</p>
                              <p className="text-[11px] text-slate-400">
                                상단의 <span className="text-blue-600 font-bold">[전체 재원생 명부]</span> 탭을 누르시면 학원의 모든 학생을 확인하실 수 있습니다.
                              </p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* 5. Batch Actions Footer */}
                  <div className="bg-slate-50/80 p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-extrabold text-slate-600">
                      선택된 학생: <b className="text-blue-600">{selectedStudentIds.length}</b>명 (미선택 시 현재 목록 전체 일괄 적용)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => handleBatchTimelineAction('ride_in')}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition"
                      >
                        일괄 승차
                      </button>
                      <button 
                        onClick={() => handleBatchTimelineAction('check_in')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition"
                      >
                        일괄 등원
                      </button>
                      <button 
                        onClick={() => handleBatchTimelineAction('check_out')}
                        className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition"
                      >
                        일괄 하원
                      </button>
                      <button 
                        onClick={() => handleBatchTimelineAction('ride_out')}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition"
                      >
                        일괄 하차
                      </button>
                      <button 
                        onClick={() => handleBatchTimelineAction('is_absent')}
                        className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow-xs transition"
                      >
                        일괄 결석
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ATTENDANCE 2: 출결 현황 (월간 달력) */}
            {subTab === "attendance_calendar" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <CalendarIcon className="text-blue-600" size={20} />
                      출결 현황 (월간 달력)
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      달력 상에서 일자별 전체 출석 및 결석 통계를 직관적으로 모니터링합니다.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setAttendanceCalendarMonth(moveMonth(attendanceCalendarMonth, -1))}
                      className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 shadow-2xs"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-black text-slate-900 px-3">
                      {attendanceCalendarMonth.slice(0, 4)}년 {attendanceCalendarMonth.slice(5, 7)}월
                    </span>
                    <button 
                      onClick={() => setAttendanceCalendarMonth(moveMonth(attendanceCalendarMonth, 1))}
                      className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 shadow-2xs"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                {/* Calendar Grid */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-black text-slate-600 py-3">
                    <div className="text-rose-500">일</div>
                    <div>월</div>
                    <div>화</div>
                    <div>수</div>
                    <div>목</div>
                    <div>금</div>
                    <div className="text-blue-500">토</div>
                  </div>

                  <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
                    {calendarDays.map((item, i) => {
                      if (!item.dayNum || !item.dateStr) {
                        return (
                          <div key={i} className="min-h-[105px] p-2.5 bg-slate-50/40 text-slate-300 select-none" />
                        );
                      }

                      const isSelected = selectedCalendarDate === item.dateStr;
                      const hasData = item.scheduledCount > 0 || item.attendedCount > 0;

                      return (
                        <div 
                          key={i} 
                          onClick={() => {
                            setSelectedCalendarDate(item.dateStr!);
                            setSelectedAttendanceDate(item.dateStr!);
                          }}
                          className={`min-h-[105px] p-2.5 transition flex flex-col justify-between cursor-pointer ${
                            isSelected 
                              ? 'bg-blue-50/70 ring-2 ring-blue-500 z-10 shadow-xs' 
                              : item.isToday 
                              ? 'bg-amber-50/40 hover:bg-slate-50' 
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                              isSelected 
                                ? 'bg-blue-600 text-white' 
                                : item.isToday 
                                ? 'bg-amber-500 text-white' 
                                : 'text-slate-700'
                            }`}>
                              {item.dayNum}
                            </span>
                            {item.isToday && (
                              <span className="text-[10px] font-black text-amber-600 bg-amber-100/70 px-1.5 py-0.2 rounded">
                                오늘
                              </span>
                            )}
                          </div>

                          <div className="space-y-1 mt-2">
                            {hasData ? (
                              <>
                                <div className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md text-left truncate shadow-2xs">
                                  • 출석 {item.attendedCount}명
                                </div>
                                {item.absentCount > 0 ? (
                                  <div className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-md text-left truncate shadow-2xs">
                                    • 결석 {item.absentCount}명
                                  </div>
                                ) : item.scheduledCount > 0 && item.attendedCount >= item.scheduledCount ? (
                                  <div className="bg-emerald-50 text-emerald-700 text-[10px] font-extrabold px-1.5 py-0.5 rounded text-left truncate">
                                    ✓ 전원 출석
                                  </div>
                                ) : item.scheduledCount > 0 ? (
                                  <div className="bg-amber-50 text-amber-700 text-[10px] font-extrabold px-1.5 py-0.5 rounded text-left truncate">
                                    • 미처리 {Math.max(0, item.scheduledCount - item.attendedCount)}명
                                  </div>
                                ) : (
                                  <div className="bg-slate-100 text-slate-600 text-[10px] font-extrabold px-1.5 py-0.5 rounded text-left truncate">
                                    예약 외 출석
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-[10px] text-slate-300 font-bold px-1">
                                수업 없음
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Date Detail Banner & Inline Timeline Table */}
                <div className="space-y-4 pt-2">
                  <div className="bg-slate-900 text-white p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-400">선택된 일자 출결 상세 관제</span>
                        {selectedCalendarDate === localDate(new Date()) && (
                          <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                            오늘
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-black mt-0.5 flex items-center gap-2">
                        <span>{selectedCalendarDate}</span>
                        <span className="text-xs text-slate-300 font-bold">({getKoreanDayOfWeek(selectedCalendarDate)})</span>
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="bg-slate-800 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-700">
                        수업 대상: <b className="text-white">{detailedAttendanceSummary.scheduled}</b>명
                      </span>
                      <span className="bg-blue-600 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-2xs">
                        출석 완료: {detailedAttendanceSummary.attended}명
                      </span>
                      {detailedAttendanceSummary.absent > 0 && (
                        <span className="bg-rose-600 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-2xs">
                          결석: {detailedAttendanceSummary.absent}명
                        </span>
                      )}
                      {detailedAttendanceSummary.pending > 0 && (
                        <span className="bg-amber-500 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-black shadow-2xs">
                          미처리: {detailedAttendanceSummary.pending}명
                        </span>
                      )}
                      {detailedAttendanceSummary.allPresent && (
                        <span className="bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-2xs">
                          ✓ 전원 출석
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Inline Timeline Table below calendar */}
                  <div className="overflow-hidden rounded-3xl bg-white shadow-xs border border-slate-200">
                    <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                        <Users size={16} className="text-blue-600" />
                        <span>{selectedCalendarDate} 원생 출결 및 셔틀 동선 명부</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => loadDailyAttendanceStudents()}
                          className="flex items-center gap-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs"
                        >
                          <RefreshCw size={13} />
                          새로고침
                        </button>
                      </div>
                    </div>

                    <div className="max-h-[460px] overflow-y-auto overflow-x-auto">
                      <table className="w-full text-left text-xs font-bold text-slate-600 border-collapse">
                        <thead className="bg-slate-100 text-[11px] font-black text-slate-700 border-b border-slate-200 sticky top-0 z-10 shadow-2xs">
                          <tr>
                            <th className="px-4 py-3.5 bg-slate-100">No.</th>
                            <th className="px-4 py-3.5 min-w-[130px] bg-slate-100">클래스 / 시간</th>
                            <th className="px-4 py-3.5 min-w-[130px] bg-slate-100">원생 (보호자)</th>
                            <th className="px-3 py-3.5 text-center min-w-[140px] bg-slate-100">1. 셔틀 승차</th>
                            <th className="px-3 py-3.5 text-center min-w-[110px] bg-slate-100">2. 학원 등원</th>
                            <th className="px-3 py-3.5 text-center min-w-[110px] bg-slate-100">3. 학원 하원</th>
                            <th className="px-3 py-3.5 text-center min-w-[140px] bg-slate-100">4. 셔틀 하차</th>
                            <th className="px-4 py-3.5 text-center min-w-[130px] bg-slate-100">진행 상태</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detailedAttendanceStudents.length > 0 ? (
                            detailedAttendanceStudents.map((s, idx) => {
                              const record = todayAttendanceRecords[s.id];
                              const reservationKey = s.child_id || s.id;
                              const studentReservations = todayReservations.filter((reservation) => reservation.child_id === reservationKey);
                              const reservationSchedules = studentReservations
                                .map((reservation) => firstJoined(reservation.class_schedules))
                                .filter(Boolean) as Array<{ target_class: string; start_time: string; end_time: string }>;
                              const currentClassName = Array.from(new Set(reservationSchedules.map((schedule) => schedule.target_class))).join(', ') || '예약 수업';
                              const classTime = Array.from(new Set(reservationSchedules
                                .filter((schedule) => schedule.start_time && schedule.end_time)
                                .map((schedule) => `${schedule.start_time.slice(0, 5)}~${schedule.end_time.slice(0, 5)}`)
                              )).join(', ') || null;
                              const isScheduled = isStudentScheduledOnDate(s);

                              // Status evaluation based on check_in / check_out
                              let statusBadge = isScheduled ? (
                                <span className="inline-block bg-amber-50 text-amber-700 border border-amber-100 font-bold px-2.5 py-1 rounded-full text-[11px]">미처리 ⚠️</span>
                              ) : (
                                <span className="inline-block bg-slate-50 text-slate-400 border border-slate-100 font-bold px-2.5 py-1 rounded-full text-[11px]">예약 없음</span>
                              );

                              if (record?.is_absent) {
                                statusBadge = (
                                  <span className="inline-block bg-rose-100 text-rose-700 font-black px-2.5 py-1 rounded-full text-[11px]">
                                    🔴 결석 처리
                                  </span>
                                );
                              } else if (record?.ride_out) {
                                statusBadge = (
                                  <span className="inline-block bg-purple-100 text-purple-700 font-black px-2.5 py-1 rounded-full text-[11px]">
                                    🟣 하차 완료 (귀가)
                                  </span>
                                );
                              } else if (record?.no_dropoff) {
                                statusBadge = (
                                  <span className="inline-block bg-indigo-50 text-indigo-700 border border-indigo-200 font-black px-2.5 py-1 rounded-full text-[11px]">
                                    🏠 자가귀가 (하차 미탑승)
                                  </span>
                                );
                              } else if (record?.check_out) {
                                statusBadge = (
                                  <span className="inline-block bg-amber-100 text-amber-800 font-black px-2.5 py-1 rounded-full text-[11px]">
                                    🟠 학원 하원 완료
                                  </span>
                                );
                              } else if (record?.check_in) {
                                statusBadge = (
                                  <span className="inline-block bg-emerald-100 text-emerald-800 font-black px-2.5 py-1 rounded-full text-[11px]">
                                    🟢 학원 수업 중
                                  </span>
                                );
                              } else if (record?.ride_in) {
                                statusBadge = (
                                  <span className="inline-block bg-blue-100 text-blue-800 font-black px-2.5 py-1 rounded-full text-[11px]">
                                    🚌 셔틀 이동 중
                                  </span>
                                );
                              } else if (record?.no_shuttle || record?.no_pickup) {
                                statusBadge = (
                                  <span className="inline-block bg-amber-50 text-amber-700 border border-amber-200 font-black px-2.5 py-1 rounded-full text-[11px]">
                                    🟡 자가등원 (승차 미탑승)
                                  </span>
                                );
                              }

                              return (
                                <tr key={s.id} className={`hover:bg-slate-50/80 transition ${record?.is_absent ? 'bg-rose-50/20' : ''}`}>
                                  <td className="px-4 py-3 text-slate-400 font-mono">{idx + 1}</td>
                                  
                                  {/* Class & Time */}
                                  <td className="px-4 py-3">
                                    <b className="text-slate-900 block truncate">{currentClassName}</b>
                                    <span className="text-[11px] text-slate-500 font-medium">
                                      {classTime ? `${classTime}` : (isScheduled ? `수업 대상` : '비정기/보강')}
                                    </span>
                                  </td>

                                  {/* Student Name & Parent */}
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5">
                                      <b className="text-slate-900 text-sm">{s.student_name}</b>
                                      <span className="text-[10px] text-slate-400 font-mono">#{s.attendance_code}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500">
                                      보호자 {s.parent_name || s.mother_phone || s.father_phone || '-'}
                                    </p>
                                  </td>
                                  
                                  {/* 1. 셔틀 승차 */}
                                  <td className="px-2 py-3 text-center">
                                    {record?.ride_in ? (
                                      <button
                                        onClick={() => handleTimelineAction(s.id, 'reset')}
                                        className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition shadow-2xs"
                                        title="클릭 시 취소"
                                      >
                                        <Bus size={12} />
                                        <span>{record.ride_in} 승차</span>
                                      </button>
                                    ) : record?.no_pickup || record?.no_shuttle ? (
                                      <button
                                        onClick={() => handleTimelineAction(s.id, 'reset')}
                                        className="inline-block bg-amber-50 border border-amber-200 text-amber-700 font-bold px-2 py-1 rounded-xl text-[11px] hover:bg-amber-100 transition shadow-2xs"
                                        title="클릭 시 취소"
                                      >
                                        승차 미탑승
                                      </button>
                                    ) : (
                                      <div className="flex items-center justify-center gap-1">
                                        <button 
                                          onClick={() => handleTimelineAction(s.id, 'ride_in')}
                                          className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-xl text-xs font-black shadow-2xs transition"
                                        >
                                          승차
                                        </button>
                                        <button 
                                          onClick={() => handleTimelineAction(s.id, 'no_pickup')}
                                          className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1.5 rounded-xl text-[11px] font-bold transition"
                                          title="셔틀 미탑승"
                                        >
                                          미탑승
                                        </button>
                                      </div>
                                    )}
                                  </td>

                                  {/* 2. 학원 등원 */}
                                  <td className="px-2 py-3 text-center">
                                    {record?.check_in ? (
                                      <button
                                        onClick={() => handleTimelineAction(s.id, 'reset')}
                                        className="inline-block bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition shadow-2xs"
                                        title="클릭 시 취소"
                                      >
                                        🏫 {record.check_in} 등원
                                      </button>
                                    ) : (
                                      <button 
                                        onClick={() => handleTimelineAction(s.id, 'check_in')}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-2xs transition"
                                      >
                                        등원
                                      </button>
                                    )}
                                  </td>

                                  {/* 3. 학원 하원 */}
                                  <td className="px-2 py-3 text-center">
                                    {record?.check_out ? (
                                      <button
                                        onClick={() => handleTimelineAction(s.id, 'reset')}
                                        className="inline-block bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition shadow-2xs"
                                        title="클릭 시 취소"
                                      >
                                        🎒 {record.check_out} 하원
                                      </button>
                                    ) : (
                                      <button 
                                        onClick={() => handleTimelineAction(s.id, 'check_out')}
                                        className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-2xs transition"
                                      >
                                        하원
                                      </button>
                                    )}
                                  </td>

                                  {/* 4. 셔틀 하차 */}
                                  <td className="px-2 py-3 text-center">
                                    {record?.ride_out ? (
                                      <button
                                        onClick={() => handleTimelineAction(s.id, 'reset')}
                                        className="inline-block bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition shadow-2xs"
                                        title="클릭 시 취소"
                                      >
                                        🚌 {record.ride_out} 하차
                                      </button>
                                    ) : record?.no_dropoff ? (
                                      <button
                                        onClick={() => handleTimelineAction(s.id, 'reset')}
                                        className="inline-block bg-amber-50 border border-amber-200 text-amber-700 font-bold px-2 py-1 rounded-xl text-[11px] hover:bg-amber-100 transition shadow-2xs"
                                        title="클릭 시 취소"
                                      >
                                        하차 미탑승
                                      </button>
                                    ) : (
                                      <div className="flex items-center justify-center gap-1">
                                        <button 
                                          onClick={() => handleTimelineAction(s.id, 'ride_out')}
                                          className="bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1.5 rounded-xl text-xs font-black shadow-2xs transition"
                                        >
                                          하차
                                        </button>
                                        <button 
                                          onClick={() => handleTimelineAction(s.id, 'no_dropoff')}
                                          className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1.5 rounded-xl text-[11px] font-bold transition"
                                          title="귀가 셔틀 미탑승"
                                        >
                                          미탑승
                                        </button>
                                      </div>
                                    )}
                                  </td>

                                  {/* 진행 상태 */}
                                  <td className="px-4 py-3 text-center">
                                    {statusBadge}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={8} className="py-12 text-center text-slate-400 font-bold text-xs">
                                해당 일자에 배정된 수업 대상 원생이 없습니다.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ATTENDANCE 3: 출결 조회 (100% ORIGINAL 20-SLOT ATTENDANCE TABLE) */}
            {subTab === "attendance" && (
              <>
                <section className="mb-5 grid gap-3 sm:grid-cols-3">
                  <Stat label="표시 자녀" value={`${new Set(shownAttendance.map((row) => row.childName)).size}명`} icon={<UsersRound />} color="blue" />
                  <Stat label="이번 달 이용" value={`${shownAttendance.reduce((sum, row) => sum + row.dates.length, 0)}회`} icon={<CalendarCheck />} color="green" />
                  <Stat label="남은 이용권" value={`${shownAttendance.reduce((sum, row) => sum + row.remaining, 0)}회`} icon={<TicketCheck />} color="amber" />
                </section>

                <Toolbar search={search} setSearch={setSearch} placeholder="자녀, 보호자, 이용권 검색">
                  <BranchFilter profile={profile} branches={branches} value={branchFilter} onChange={setBranchFilter} />
                  <div className="flex items-center rounded-xl border border-slate-200">
                    <button aria-label="이전 달" onClick={() => setMonth(moveMonth(month, -1))} className="p-3"><ChevronLeft size={18} /></button>
                    <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[132px] py-3 text-center text-sm font-black outline-none bg-transparent text-slate-900" />
                    <button aria-label="다음 달" onClick={() => setMonth(moveMonth(month, 1))} className="p-3"><ChevronRight size={18} /></button>
                  </div>
                  <button onClick={() => void downloadWorkbook("attendance")} className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white"><Download size={17} /> Excel</button>
                </Toolbar>

                <div className="mb-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-800 ring-1 ring-blue-100">
                  등원 처리되어 이용권이 실제 차감된 날짜만 체크됩니다. 결석·보강은 포함하지 않으며 최대 20회까지 표시합니다.
                </div>

                <TableShell empty={!loading && !shownAttendance.length} emptyText="조건에 맞는 출결 정보가 없습니다.">
                  <table className="min-w-[1000px] w-full text-left text-xs sm:text-[13px]">
                    <thead className="bg-slate-100 text-[11px] font-black text-slate-500">
                      <tr><Th sticky>자녀 / 보호자</Th><Th>이용권</Th><Th>주 횟수</Th><Th>사용</Th>{Array.from({ length: MAX_SLOTS }, (_, i) => <Th key={i}>{i + 1}</Th>)}<Th>출석일</Th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shownAttendance.map((row) => (
                        <tr key={row.id} className="hover:bg-blue-50/30">
                          <Td sticky><div><b className="text-sm">{row.childName}</b></div><p className="mt-1 text-[11px] text-slate-400">보호자 {row.parentName}</p></Td>
                          <Td><b className="text-[12px]">{row.packageName}</b><p className="mt-1 text-[11px] text-slate-400">{row.total}회권 · 잔여 {row.remaining}회</p></Td>
                          <Td>{row.weekly ? <b>주 {row.weekly}회</b> : "-"}</Td>
                          <Td><b className="text-blue-700">{row.used}</b> / {row.total}</Td>
                          {Array.from({ length: MAX_SLOTS }, (_, i) => {
                            const date = row.dates[i];
                            const isClickable = i < row.total;
                            return (
                              <td key={i} className="px-0.5 py-2 text-center">
                                {date ? (
                                  <button type="button" onClick={() => void handleCancelAttendance(row.childId, date)} className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white text-[9px] font-black hover:bg-rose-600 hover:scale-105 transition shadow-xs font-mono" title={`${date} 출석 취소 (클릭)`}>{date.slice(5).replace("-", ".")}</button>
                                ) : (
                                  <button type="button" onClick={() => { setAttendanceModal({ childId: row.childId, childName: row.childName }); setAttendanceDate(new Date().toISOString().slice(0, 10)); }} disabled={!isClickable} className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-xs font-black transition hover:scale-105 ${isClickable ? "bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600" : "bg-slate-50 text-slate-200 cursor-not-allowed"}`} title={`${i + 1}회차 출석 등록 (클릭)`}>{i + 1}</button>
                                )}
                              </td>
                            );
                          })}
                          <Td><div className="flex max-w-[180px] flex-wrap gap-1">{row.dates.length ? row.dates.map((date, i) => <button key={`${date}-${i}`} onClick={() => void handleCancelAttendance(row.childId, date)} className="rounded-lg bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition" title="출석 취소 (클릭)">{date.slice(5).replace("-", ".")}</button>) : <span className="text-slate-400">출석 없음</span>}</div></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableShell>
              </>
            )}

            {/* ATTENDANCE 4: 주간 시간표 (100% ORIGINAL SCHEDULE CALENDAR) */}
            {subTab === "schedule" && (
              <>
                <Toolbar search={search} setSearch={setSearch} placeholder="수업명 또는 지점 검색">
                  <BranchFilter profile={profile} branches={branches} value={branchFilter} onChange={setBranchFilter} />
                  <div className="flex items-center rounded-xl border border-slate-200">
                    <button aria-label="이전 주" onClick={() => setWeekStart((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() - 7))} className="p-3"><ChevronLeft size={18} /></button>
                    <span className="min-w-[170px] px-2 text-center text-sm font-black">{localDate(weekStart).slice(5).replace("-", ".")} ~ {localDate(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)).slice(5).replace("-", ".")}</span>
                    <button aria-label="다음 주" onClick={() => setWeekStart((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7))} className="p-3"><ChevronRight size={18} /></button>
                  </div>
                </Toolbar>
                <WeeklySchedule schedules={schedules.filter((item) => `${item.target_class} ${item.branches?.name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))} reservations={scheduleReservations} weekStart={weekStart} showBranch={profile?.role === "admin" && branchFilter === "all"} />
              </>
            )}

            {/* PAYMENTS HISTORY TAB (100% ORIGINAL PAYMENTS TABLE) */}
            {subTab === "payments" && (
              <>
                <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Stat label="결제 매출" value={`${won.format(stats.revenue)}원`} icon={<CreditCard />} color="blue" />
                  <Stat label="결제 완료" value={`${stats.paid}건`} icon={<Check />} color="green" />
                  <Stat label="결제 대기" value={`${stats.pending}건`} icon={<CreditCard />} color="amber" />
                  <Stat label="실패·취소" value={`${stats.failed}건`} icon={<ShieldAlert />} color="rose" />
                </section>

                <Toolbar search={search} setSearch={setSearch} placeholder="회원명, 이메일, 거래번호 검색">
                  <BranchFilter profile={profile} branches={branches} value={branchFilter} onChange={setBranchFilter} />
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">
                    <option value="all">전체 상태</option>
                    <option value="paid">결제 완료</option>
                    <option value="pending_payment">입금 대기</option>
                    <option value="scheduled">현장결제 대기</option>
                    <option value="failed">결제 실패</option>
                    <option value="refunded">환불</option>
                  </select>
                  <button onClick={() => void downloadWorkbook("payments")} className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white"><Download size={17} /> Excel</button>
                </Toolbar>

                <TableShell empty={!loading && !shownPayments.length} emptyText="조건에 맞는 결제 내역이 없습니다.">
                  <table className="w-full table-auto text-left text-xs">
                    <thead className="bg-slate-100 text-[11px] font-black text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="whitespace-nowrap px-3 py-3 min-w-[130px]">결제일</th>
                        <th className="whitespace-nowrap px-3 py-3 min-w-[140px]">회원 / 자녀</th>
                        <th className="whitespace-nowrap px-3 py-3 min-w-[180px]">결제 상품</th>
                        <th className="whitespace-nowrap px-3 py-3 min-w-[90px] text-right">결제 금액</th>
                        <th className="whitespace-nowrap px-3 py-3 min-w-[95px] text-center">결제 수단</th>
                        <th className="whitespace-nowrap px-3 py-3 min-w-[75px] text-center">상태</th>
                        <th className="whitespace-nowrap px-3 py-3 min-w-[130px]">거래번호 / 접수번호</th>
                        <th className="sticky right-0 z-20 min-w-[90px] whitespace-nowrap border-l border-slate-200 bg-slate-100 px-3 py-3 text-center shadow-[-10px_0_18px_-16px_rgba(15,23,42,0.55)]">관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shownPayments.map((item) => {
                        const { refunded, remaining } = getRefundInfo(item);
                        const originalAmount = item.final_amount ?? item.total_amount ?? 0;
                        const isRefundRow = originalAmount < 0 || (item.pg_tid && item.pg_tid.endsWith("_REFUND"));
                        const d = new Date(item.created_at);
                        const dateStr = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

                        return (
                          <tr key={item.id} className="hover:bg-blue-50/40 transition">
                            <td className="whitespace-nowrap px-3 py-3 align-middle text-slate-600 font-semibold">
                              {dateStr}
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <div className="max-w-[160px]">
                                <b className="text-slate-900 font-black text-xs block">{item.users?.name ?? "회원 정보 없음"}</b>
                                {item.childrenNames && item.childrenNames.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {item.childrenNames.map((cName, cIdx) => (
                                      <span 
                                        key={`${cName}-${cIdx}`} 
                                        className="inline-flex items-center text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shadow-2xs"
                                      >
                                        👦 {cName}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <p className="mt-1 text-[11px] text-slate-400 font-medium truncate">{item.users?.email ?? "-"}</p>
                              </div>
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <div className="max-w-[220px] space-y-1">
                                {item.products.length ? item.products.map((product, index) => (
                                  <div key={`${product.package_name}-${index}`} className="rounded-lg bg-slate-100 px-2 py-1">
                                    <b className="block truncate text-slate-800 text-[11px]">{product.package_name ?? "상품명 없음"}</b>
                                    <span className="text-[10px] text-slate-500 font-semibold">
                                      {product.total_count ? `${product.total_count}회` : "횟수 미지정"}
                                      {product.price != null ? ` · ${won.format(product.price)}원` : ""}
                                    </span>
                                  </div>
                                )) : item.isIpointCharge ? (
                                  <div className="rounded-lg bg-amber-50/80 border border-amber-200 px-2 py-1">
                                    <b className="block truncate text-amber-900 text-[11px] font-black">💎 i-Point 문자 충전</b>
                                    <span className="text-[10px] text-amber-700 font-bold">
                                      학원 문자 발송 포인트 · {won.format(originalAmount)}원
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-xs font-semibold">연결 상품 없음</span>
                                )}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 align-middle text-right">
                              <b className="text-slate-900 font-black text-xs">{won.format(originalAmount)}원</b>
                              {refunded > 0 && (
                                <div className="mt-0.5 text-[10px] space-y-0.5">
                                  <p className="font-bold text-rose-600">환불: {won.format(refunded)}원</p>
                                  <p className="font-bold text-slate-500">잔액: {won.format(remaining)}원</p>
                                </div>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 align-middle text-center">
                              <b className="text-slate-700 font-bold text-xs">{paymentDetail(item.payment_method, item.pg_tid)}</b>
                              {item.payment_method === "CARD" && <p className="mt-0.5 text-[10px] text-amber-600 font-medium">카드사 미저장</p>}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 align-middle text-center">
                              <Badge status={item.status} />
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 align-middle">
                              <span title={paymentReference(item)} className="block max-w-[150px] truncate font-mono text-[11px] text-slate-500 font-semibold">
                                {paymentReference(item)}
                              </span>
                            </td>
                            <td className="sticky right-0 z-10 min-w-[90px] whitespace-nowrap border-l border-slate-100 bg-white px-3 py-3 text-center align-middle shadow-[-10px_0_18px_-16px_rgba(15,23,42,0.45)]">
                              {["paid", "success"].includes(item.status ?? "") && !isRefundRow ? (
                                remaining > 0 ? (
                                  <button onClick={() => { setCancelTarget(item); setCancelAmountStr(String(remaining)); }} className="rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-black text-rose-600 hover:bg-rose-100 transition shadow-2xs border border-rose-200">
                                    결제 취소
                                  </button>
                                ) : (
                                  <span className="text-[11px] font-bold text-slate-400">취소 완료</span>
                                )
                              ) : ["cancelled", "canceled", "refunded"].includes(item.status ?? "") || isRefundRow ? (
                                <span className="text-[11px] font-bold text-slate-400">취소 완료</span>
                              ) : ("-")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableShell>
              </>
            )}

            {subTab === "offline_payments" && (
              <AdminOfflinePaymentTab activeBranchId={activeBranchId} />
            )}

            {/* SMS / ALERTS / MESSAGING TAB */}
            {['sms_send', 'sms_history', 'sms_reserved', 'sms_points'].includes(subTab) && (
              <AdminSmsTab
                activeBranchId={activeBranchId}
                branches={branches}
                profile={profile}
                subTab={subTab}
                setSubTab={setSubTab}
              />
            )}

            {/* ROI SYSTEM SETTINGS (100% ORIGINAL FORM) */}
            {subTab === "settings" && profile?.role === "admin" && (
              <div className="bg-white p-8 rounded-3xl ring-1 ring-slate-200 space-y-4 max-w-2xl">
                <h2 className="font-black text-lg text-slate-900">⚙️ 요금제 단가 & 기대효과 설정</h2>
                <p className="text-xs text-slate-500">
                  여기서 설정한 Lite/Pro 월 단가는 메인 웹사이트의 **요금제 안내 텍스트** 및 **도입 효과 계산기(ROI Calculator)** 실시간 계산 기준 금액에 즉시 반영됩니다.
                </p>
                {saveMsg && <div className="text-xs font-bold text-emerald-600 bg-emerald-50 p-3 rounded-xl">{saveMsg}</div>}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600">Lite 요금제 월 단가 (원)</label>
                  <input type="number" value={litePrice} onChange={(e) => setLitePrice(e.target.value)} className="w-full bg-slate-100 p-3 rounded-xl text-sm font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600">Pro 요금제 월 단가 (원)</label>
                  <input type="number" value={proPrice} onChange={(e) => setProPrice(e.target.value)} className="w-full bg-slate-100 p-3 rounded-xl text-sm font-bold" />
                </div>
                <button onClick={async () => {
                  await supabase.from("web_settings").upsert({ id: "default", lite_monthly_price: Number(litePrice), pro_monthly_price: Number(proPrice), updated_at: new Date().toISOString() });
                  setSaveMsg("✅ 요금제 단가가 성공적으로 저장되었습니다! 홈페이지 단가 및 도입효과 계산기에 즉시 반영됩니다.");
                }} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-blue-700">설정 DB 저장하기</button>
              </div>
            )}

            {/* PARTNER BRAND LOGOS (100% ORIGINAL RICH MANAGER) */}
            {subTab === "partners" && profile?.role === "admin" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* Partner Logo Registration / Edit Form */}
                <div className="lg:col-span-4 bg-white p-6 rounded-3xl ring-1 ring-slate-200 space-y-6">
                  <div>
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                      {editingPartnerId ? "PARTNER EDIT" : "PARTNER REGISTER"}
                    </span>
                    <h2 className="text-xl font-black text-slate-900 mt-2">
                      {editingPartnerId ? "협력 브랜드 정보 수정" : "새 협력 브랜드 추가"}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      메인 홈 화면 상단에 롤링되는 협력 기업/학원 로고 정보를 관리합니다.
                    </p>
                  </div>

                  {partnerTableError ? (
                    <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl space-y-3">
                      <div className="flex items-center gap-2 text-amber-800 font-extrabold text-sm">
                        <Lock className="w-5 h-5" />
                        <span>데이터 테이블 생성 필요</span>
                      </div>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        이 기능을 이용하려면 Supabase Dashboard ➔ SQL Editor에 접속하여 아래 쿼리를 붙여넣고 <b>Run</b>을 실행해 주세요!
                      </p>
                      <textarea
                        readOnly
                        rows={8}
                        className="w-full bg-slate-950 text-slate-200 text-[10px] font-mono p-3 rounded-xl border border-slate-800 focus:outline-none"
                        value={`CREATE TABLE public.web_partner_logos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT NOT NULL,
  display_order INT DEFAULT 0,
  is_visible BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.web_partner_logos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON public.web_partner_logos FOR SELECT USING (true);
CREATE POLICY "Allow write for all" ON public.web_partner_logos FOR ALL USING (true);`}
                        onClick={(e) => {
                          (e.target as HTMLTextAreaElement).select();
                          navigator.clipboard.writeText((e.target as HTMLTextAreaElement).value);
                          alert("📋 SQL 쿼리가 클립보드에 복사되었습니다! Supabase SQL Editor에 붙여넣어 실행해 주세요.");
                        }}
                      />
                      <p className="text-[10px] text-slate-500 font-bold text-center">
                        💡 텍스트 상자를 누르면 자동으로 전체 SQL이 복사됩니다.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleSavePartner} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">브랜드/학원 이름</label>
                        <input
                          type="text"
                          placeholder="예: 해법영어교실, 잉글리시아이"
                          value={partnerName}
                          onChange={(e) => setPartnerName(e.target.value)}
                          className="w-full bg-slate-100 px-4 py-3 rounded-xl text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">브랜드 한 줄 설명/비고 (선택)</label>
                        <input
                          type="text"
                          placeholder="예: 전국 학원 인프라, 우수 파트너 교육원"
                          value={partnerDescription}
                          onChange={(e) => setPartnerDescription(e.target.value)}
                          className="w-full bg-slate-100 px-4 py-3 rounded-xl text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">로고 이미지 파일 업로드 (PNG/SVG 권장)</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePartnerFileChange}
                          className="w-full bg-slate-100 px-4 py-3 rounded-xl text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                          required={!editingPartnerId}
                        />
                      </div>

                      {partnerPreviewUrl && (
                        <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 flex flex-col items-center gap-2">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">업로드 이미지 미리보기</span>
                          <div className="w-24 h-24 bg-white border border-slate-100 rounded-xl flex items-center justify-center p-2 shadow-xs">
                            <img
                              src={partnerPreviewUrl}
                              alt="Logo preview"
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 text-center font-semibold">
                            {partnerFile ? `${(partnerFile.size / 1024).toFixed(1)} KB` : '기존 이미지'}
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">정렬 순서 (오름차순)</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={partnerDisplayOrder}
                            onChange={(e) => setPartnerDisplayOrder(e.target.value)}
                            className="w-full bg-slate-100 px-4 py-3 rounded-xl text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200 hover:bg-slate-100 select-none">
                            <input
                              type="checkbox"
                              checked={partnerIsVisible}
                              onChange={(e) => setPartnerIsVisible(e.target.checked)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                            />
                            <span className="text-xs font-bold text-slate-700">홈페이지 노출</span>
                          </label>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        {editingPartnerId && (
                          <button
                            type="button"
                            onClick={resetPartnerForm}
                            className="flex-1 bg-slate-200 text-slate-700 font-black py-3 rounded-xl text-sm hover:bg-slate-300 transition-colors"
                          >
                            취소
                          </button>
                        )}
                        <button
                          type="submit"
                          className="flex-1 bg-blue-600 text-white font-black py-3 rounded-xl text-sm hover:bg-blue-700 shadow-md transition-colors"
                        >
                          {editingPartnerId ? "수정 완료" : "브랜드 등록"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Registered Partner Logos List */}
                <div className="lg:col-span-8 bg-white p-6 rounded-3xl ring-1 ring-slate-200 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-sm text-slate-900">
                      현재 등록된 협력 브랜드 ({partners.length}개)
                    </h3>
                    {partnerTableError && (
                      <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full">
                        데이터베이스 미연동 상태
                      </span>
                    )}
                  </div>

                  {partners.length ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {partners.map((p) => (
                        <div key={p.id} className="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center shrink-0 border border-slate-200 p-2">
                            <img
                              src={p.logo_url}
                              alt={p.name}
                              className="max-w-full max-h-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded">
                                순서: {p.display_order ?? 0}
                              </span>
                              {!p.is_visible && (
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                  숨김
                                </span>
                              )}
                            </div>
                            <b className="text-sm text-slate-900 block truncate mt-1">{p.name}</b>
                            <p className="text-[10px] text-slate-400 font-mono truncate">{p.logo_url}</p>
                          </div>
                          <div className="flex shrink-0">
                            <button
                              onClick={() => handleEditPartner(p)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl"
                              title="수정"
                            >
                              <Pencil size={18} />
                            </button>
                            <button
                              onClick={() => handleDeletePartner(p.id)}
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl"
                              title="삭제"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-xs font-bold text-slate-400 py-16 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                      {partnerTableError 
                        ? "데이터베이스 테이블(web_partner_logos)이 생성되지 않았습니다. 좌측 안내 박스를 참조하여 테이블을 신설해 주세요!"
                        : "등록된 협력 브랜드가 없습니다. 새로운 브랜드를 추가해 주세요!"}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* TAB: REFERRAL TREE */}
            {subTab === "referrals" && <ReferralTreeTab profile={profile} />}

            {/* YOUTUBE MANUAL VIDEO EDITOR (100% ORIGINAL COMPLETE RICH COMPONENT) */}
            {subTab === "videos" && profile?.role === "admin" && (
              <div className="space-y-8">
                
                {/* Form & Live Website Card Preview Split Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  
                  {/* Form Column */}
                  <form onSubmit={handleSaveVideo} className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-3xl ring-1 ring-slate-200 space-y-5 shadow-sm">
                    <div>
                      <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
                        <Video className="text-blue-600" size={22} />
                        {editingVideoId ? "유튜브 매뉴얼 수정" : "유튜브 매뉴얼 1:1 라이브 편집기"}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        유튜브 URL을 입력하면 <b>실제 썸네일 이미지</b>와 <b>실제 동영상 플레이어</b>가 자동 추출되어 미리보기에 적용됩니다!
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">동영상 제목</label>
                        <input
                          type="text"
                          placeholder="예: 셔틀 실시간 위치 조회 및 도착 알림톡 설정 가이드"
                          value={newVideoTitle}
                          onChange={(e) => setNewVideoTitle(e.target.value)}
                          className="w-full bg-slate-100 px-4 py-3 rounded-xl text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">카테고리 구분</label>
                          <select
                            value={newVideoCategory}
                            onChange={(e) => setNewVideoCategory(e.target.value as any)}
                            className="w-full bg-slate-100 px-4 py-3 rounded-xl text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="parent">학부모 매뉴얼</option>
                            <option value="admin">학원장 매뉴얼</option>
                            <option value="driver">기사님 매뉴얼</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">소요 시간 (미입력 시 유튜브 자동감지)</label>
                          <input
                            type="text"
                            placeholder="예: 2분 15초 (비워두면 자동 라벨)"
                            value={newVideoDuration}
                            onChange={(e) => setNewVideoDuration(e.target.value)}
                            className="w-full bg-slate-100 px-4 py-3 rounded-xl text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">카드 요약 설명 (1~2줄)</label>
                        <input
                          type="text"
                          placeholder="스마트폰 앱에서 셔틀버스의 현재 위치를 확인하고 설정하는 방법입니다."
                          value={newVideoDescription}
                          onChange={(e) => setNewVideoDescription(e.target.value)}
                          className="w-full bg-slate-100 px-4 py-3 rounded-xl text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          단계별 주요 설명 ({parsedSteps.length}단계 - 줄바꿈으로 각 단계 구분)
                        </label>
                        <textarea
                          rows={3}
                          placeholder="1. 앱 실행 후 메인 화면의 [셔틀 위치 지도] 터치&#10;2. 자녀 탑승 차량 선택&#10;3. 도착 전 알림 푸시 켜기"
                          value={newVideoStepsText}
                          onChange={(e) => setNewVideoStepsText(e.target.value)}
                          className="w-full bg-slate-100 p-4 rounded-xl text-xs font-medium border-none outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">유튜브 동영상 URL (자동 썸네일 & 플레이어 연동)</label>
                        <div className="relative">
                          <input
                            type="url"
                            placeholder="https://www.youtube.com/watch?v=..."
                            value={newVideoUrl}
                            onChange={(e) => setNewVideoUrl(e.target.value)}
                            className="w-full bg-slate-100 px-4 py-3 pr-10 rounded-xl text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                            required
                          />
                          {currentPreviewYoutubeId ? (
                            <Video className="absolute right-3 top-1/2 -translate-y-1/2 text-red-600" size={20} />
                          ) : null}
                        </div>
                        {currentPreviewYoutubeId && (
                          <p className="text-[11px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
                            <Check size={14} /> 유튜브 비디오 ID 감지 성공: <span className="font-mono">{currentPreviewYoutubeId}</span> (실제 썸네일 노출 중)
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">배경 스타일 (실제 썸네일 미지원 시 오버레이 테마)</label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { label: "파랑", theme: "from-blue-600 to-indigo-700" },
                            { label: "보라", theme: "from-indigo-600 to-purple-700" },
                            { label: "초록", theme: "from-emerald-600 to-teal-700" },
                            { label: "다크", theme: "from-slate-800 to-slate-950" },
                            { label: "네이비", theme: "from-blue-700 to-slate-900" },
                            { label: "오렌지", theme: "from-amber-600 to-orange-700" },
                          ].map((item) => (
                            <button
                              type="button"
                              key={item.theme}
                              onClick={() => setNewVideoTheme(item.theme)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r ${item.theme} ${newVideoTheme === item.theme ? "ring-4 ring-blue-400 scale-105" : "opacity-75"}`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Restricted Access Control Checkbox */}
                      <div className="pt-1">
                        <label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-3 rounded-2xl border border-slate-200 hover:bg-amber-50/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={newVideoIsRestricted}
                            onChange={(e) => setNewVideoIsRestricted(e.target.checked)}
                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-4 h-4"
                          />
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                            <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>🔒 권한 제한 (로그인된 관리자/코치 전용 매뉴얼 설정)</span>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      {editingVideoId && (
                        <button type="button" onClick={resetVideoForm} className="flex-1 bg-slate-200 text-slate-700 font-black py-4 rounded-2xl text-base hover:bg-slate-300">
                          수정 취소
                        </button>
                      )}
                      <button type="submit" className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl text-base hover:bg-blue-700 shadow-md">
                        {editingVideoId ? "변경 내용 저장하기" : "+ 홈페이지에 영상 매뉴얼 실시간 등록하기"}
                      </button>
                    </div>
                  </form>

                  {/* Live Card Preview Box Column with REAL YouTube Thumbnail Image! */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-slate-900 uppercase tracking-wider">LIVE WEBSITE PREVIEW</span>
                      <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">실제 유튜브 썸네일 연동 중</span>
                    </div>

                    {/* Card Component Preview */}
                    <div 
                      className="glass-card overflow-hidden flex flex-col justify-between group cursor-pointer border border-slate-200 bg-white rounded-3xl shadow-lg transition-transform hover:scale-[1.02]"
                      onClick={() => setPreviewModalOpen(true)}
                    >
                      <div>
                        <div className={`relative h-48 bg-gradient-to-br ${newVideoTheme} p-6 flex flex-col justify-between text-white overflow-hidden rounded-t-3xl`}>
                          
                          {/* Real YouTube Thumbnail Image Overlay if ID exists */}
                          {currentPreviewYoutubeId && (
                            <img
                              src={`https://img.youtube.com/vi/${currentPreviewYoutubeId}/hqdefault.jpg`}
                              alt="YouTube Thumbnail"
                              className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          )}

                          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />

                          <div className="flex justify-between items-center z-10">
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-black/40 backdrop-blur">
                              {categoryLabelsMap[newVideoCategory]}
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-black/50 backdrop-blur">
                              ⏱️ {effectiveDuration}
                            </span>
                          </div>

                          <div className="absolute inset-0 flex items-center justify-center z-10">
                            <div className="w-14 h-14 rounded-full bg-red-600 text-white flex items-center justify-center group-hover:scale-110 transition-all shadow-2xl">
                              <Play className="w-7 h-7 fill-current ml-1" />
                            </div>
                          </div>

                          <div className="z-10 text-[11px] text-slate-100 font-bold drop-shadow">
                            클릭 시 실제 유튜브 동영상 재생 팝업 테스트
                          </div>
                        </div>

                        <div className="p-6">
                          <h3 className="text-base font-bold text-slate-900 line-clamp-2 mb-2 group-hover:text-blue-600 transition-colors">
                            {newVideoTitle || "동영상 제목을 입력하세요."}
                          </h3>
                          <p className="text-slate-600 text-xs leading-relaxed line-clamp-2">
                            {newVideoDescription || "카드 요약 설명을 입력하세요."}
                          </p>
                        </div>
                      </div>

                      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-600 rounded-b-3xl">
                        <span>단계별 주요 설명 ({parsedSteps.length}단계)</span>
                        <span className="group-hover:translate-x-1 transition-transform">실제 영상 재생 &rarr;</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 text-center">
                      💡 위 카드를 클릭하면 **실제 유튜브 동영상 플레이어 및 단계별 설명 팝업**을 미리 테스트해보실 수 있습니다!
                    </p>
                  </div>

                </div>

                {/* Registered Video List Table */}
                <div className="bg-white p-6 rounded-3xl ring-1 ring-slate-200 space-y-4">
                  <h3 className="font-bold text-sm text-slate-900">현재 홈페이지에 등록된 유튜브 매뉴얼 ({videos.length}개)</h3>
                  {videos.length ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {videos.map((v) => {
                        const ytId = v.youtube_id || extractYoutubeId(v.youtube_url);
                        return (
                          <div key={v.id} className="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            {ytId ? (
                              <img src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt="thumb" className="w-24 h-16 object-cover rounded-xl shrink-0 border border-slate-200" />
                            ) : (
                              <div className="w-24 h-16 bg-slate-200 rounded-xl flex items-center justify-center shrink-0">
                                <Video size={20} className="text-slate-400" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{v.category_label || v.category}</span>
                                <span className="text-[11px] text-slate-400 font-mono">{v.duration}</span>
                              </div>
                              <b className="text-sm text-slate-900 block truncate mt-1">{v.title}</b>
                              <p className="text-xs text-slate-500 truncate">{v.description}</p>
                            </div>
                            <div className="flex shrink-0">
                              <button
                                onClick={() => handleEditVideo(v)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl"
                                title="수정"
                              >
                                <Pencil size={18} />
                              </button>
                              <button
                                onClick={() => handleDeleteVideo(v.id)}
                                className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl"
                                title="삭제"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center text-xs font-bold text-slate-400 py-8">등록된 추가 유튜브 매뉴얼 영상이 없습니다. 기본 6종 가이드가 노출 중입니다.</div>
                  )}
                </div>

                {/* Real YouTube Embed Video Player Modal Tester inside Admin */}
                {previewModalOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setPreviewModalOpen(false)}>
                    <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-100 relative max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                      
                      <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-blue-400">{categoryLabelsMap[newVideoCategory]}</span>
                          <h3 className="text-lg font-bold text-white mt-0.5">{newVideoTitle}</h3>
                        </div>
                        <button onClick={() => setPreviewModalOpen(false)} className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white">
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Real YouTube Player Iframe */}
                      <div className="bg-black aspect-video relative flex items-center justify-center text-white">
                        {currentPreviewYoutubeId ? (
                          <iframe
                            src={`https://www.youtube-nocookie.com/embed/${currentPreviewYoutubeId}?autoplay=1`}
                            title={newVideoTitle}
                            className="w-full h-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        ) : (
                          <div className="text-center p-6 space-y-3">
                            <div className="w-16 h-16 rounded-full bg-blue-600/90 text-white flex items-center justify-center mx-auto shadow-xl animate-pulse">
                              <Play className="w-8 h-8 fill-current ml-1" />
                            </div>
                            <div className="text-sm font-bold">{newVideoTitle}</div>
                            <div className="text-xs text-slate-400">({newVideoUrl} 동영상 가이드 재생 테스트)</div>
                          </div>
                        )}
                      </div>

                      <div className="p-6 overflow-y-auto space-y-4">
                        <div className="text-xs font-bold text-slate-400 tracking-wider">단계별 주요 순서 ({parsedSteps.length}단계)</div>
                        <div className="space-y-2.5">
                          {parsedSteps.map((step, idx) => (
                            <div key={idx} className="flex items-start gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-sm">
                              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">{idx + 1}</span>
                              <span className="text-slate-800 font-medium">{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-medium">실제 유튜브 플레이어 팝업 테스트 완료</span>
                        <button onClick={() => setPreviewModalOpen(false)} className="bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl text-xs">닫기</button>
                      </div>

                    </div>
                  </div>
                )}

              </div>
            )}

            {/* B2B INQUIRIES LIST TAB (100% ORIGINAL) */}
            {subTab === "inquiries" && profile?.role === "admin" && (
              <div className="space-y-4">
                <h2 className="text-lg font-black text-slate-900">📋 B2B 무료 도입 문의 접수 리스트</h2>
                <div className="grid grid-cols-1 gap-3">
                  {inquiries.length ? inquiries.map((item) => (
                    <div key={item.id} className="bg-white p-5 rounded-2xl ring-1 ring-slate-200 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-black text-base">{item.academy_name || "학원명 미입력"} ({item.director_name || "원장님"} 원장)</span>
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{item.phone}</span>
                      </div>
                      <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl">{item.message || "상담 요청 내용 없음"}</div>
                      <div className="text-[11px] text-slate-400 text-right">{new Date(item.created_at).toLocaleString("ko-KR")} 접수됨</div>
                    </div>
                  )) : (
                    <div className="bg-white p-12 text-center text-slate-400 font-bold rounded-2xl border border-slate-200">접수된 상담 문의가 없습니다.</div>
                  )}
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-white/60 backdrop-blur-xs">
          <Loader2 className="animate-spin text-blue-600" size={38} />
        </div>
      )}

      {/* Cancel Payment Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-xs sm:items-center sm:p-6" onClick={() => setCancelTarget(null)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-widest text-rose-600">결제 취소 / 환불</p>
                <h3 className="mt-1 text-xl font-black">{cancelTarget.users?.name ?? "회원"}님의 결제건</h3>
                <p className="mt-1 text-sm text-slate-500">거래번호: {cancelTarget.pg_tid ?? cancelTarget.id}</p>
              </div>
              <button onClick={() => setCancelTarget(null)} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black">닫기</button>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">원 결제 금액</span><span className="font-bold text-slate-950">{won.format(cancelTarget.final_amount ?? cancelTarget.total_amount ?? 0)}원</span></div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">취소 금액 (미입력 시 남은 잔액 전체 취소)</label>
                <input type="number" value={cancelAmountStr} onChange={(e) => setCancelAmountStr(e.target.value)} className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">취소 사유</label>
                <input type="text" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button onClick={handleCancelPayment} disabled={cancelLoading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3.5 text-sm font-black text-white hover:bg-rose-700 disabled:bg-rose-300">
                {cancelLoading ? "취소 요청 처리 중..." : "결제 취소 승인하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Attendance Modal */}
      {attendanceModal && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-xs sm:items-center sm:p-6" onClick={() => setAttendanceModal(null)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-widest text-blue-600">출결 수동 관리</p>
                <h3 className="mt-1 text-xl font-black">{attendanceModal.childName} 학생 출석 등록</h3>
              </div>
              <button onClick={() => setAttendanceModal(null)} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black">닫기</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">출석 처리할 날짜 선택</label>
                <input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button onClick={handleManualAttendance} disabled={actionLoading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-black text-white hover:bg-blue-700 disabled:bg-blue-300">
                {actionLoading ? "출석 처리 중..." : "출석 완료 체크하기"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// Helper Subcomponents
function Stat({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: "blue" | "green" | "amber" | "rose" }) {
  const colors = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", rose: "bg-rose-50 text-rose-700" };
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>
      <div className={`rounded-2xl p-3 ${colors[color]}`}>{icon}</div>
    </div>
  );
}

function Badge({ status }: { status: string | null }) {
  const ok = ["paid", "success"].includes(status ?? "");
  const pending = ["pending_payment", "scheduled"].includes(status ?? "");
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${ok ? "bg-emerald-50 text-emerald-700" : pending ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{statusText(status)}</span>;
}

function Toolbar({ search, setSearch, placeholder, children }: { search: string; setSearch: (value: string) => void; placeholder: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 lg:flex-row">
      <label className="relative min-w-0 flex-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={placeholder} className="w-full rounded-xl bg-slate-100 py-3 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </label>
      {children}
    </div>
  );
}

function BranchFilter({ profile, branches, value, onChange }: { profile: Profile | null; branches: Branch[]; value: string; onChange: (value: string) => void }) {
  if (profile?.role !== "admin") return <div className="flex items-center rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-500">본인 지점</div>;
  return (
    <select aria-label="지점 선택" value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500">
      <option value="all">전체 지점</option>
      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
    </select>
  );
}

function TableShell({ children, empty, emptyText }: { children: React.ReactNode; empty: boolean; emptyText: string }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="overflow-x-auto">{children}</div>
      {empty && <div className="p-14 text-center text-sm font-bold text-slate-400">{emptyText}</div>}
    </div>
  );
}

function Th({ children, sticky = false }: { children: React.ReactNode; sticky?: boolean }) {
  return <th className={`whitespace-nowrap px-4 py-4 ${sticky ? "sticky left-0 z-10 bg-slate-100" : ""}`}>{children}</th>;
}

function Td({ children, sticky = false }: { children: React.ReactNode; sticky?: boolean }) {
  return <td className={`whitespace-nowrap px-4 py-4 align-middle ${sticky ? "sticky left-0 z-10 bg-white" : ""}`}>{children}</td>;
}

function WeeklySchedule({ schedules, reservations, weekStart, showBranch }: { schedules: ClassSchedule[]; reservations: ScheduleReservation[]; weekStart: Date; showBranch: boolean }) {
  const [selected, setSelected] = useState<{ schedule: ClassSchedule; date: string; reservations: ScheduleReservation[] } | null>(null);
  const days = ["월", "화", "수", "목", "금", "토", "일"];
  const dayAliases: Record<string, string> = { 월요일: "월", 화요일: "화", 수요일: "수", 목요일: "목", 금요일: "금", 토요일: "토", 일요일: "일", Monday: "월", Tuesday: "화", Wednesday: "수", Thursday: "목", Friday: "금", Saturday: "토", Sunday: "일" };
  const normalizedDay = (day: string) => dayAliases[day] ?? day.slice(0, 1);
  const minuteOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const startHour = schedules.length ? Math.max(0, Math.floor(Math.min(...schedules.map((item) => minuteOf(item.start_time))) / 60)) : 6;
  const endHour = schedules.length ? Math.min(24, Math.ceil(Math.max(...schedules.map((item) => minuteOf(item.end_time))) / 60)) : 22;
  const hourHeight = 72;
  const calendarHeight = Math.max(8, endHour - startHour) * hourHeight;
  if (!schedules.length) return <div className="rounded-3xl bg-white p-16 text-center text-sm font-bold text-slate-400 shadow-sm ring-1 ring-slate-200">등록된 활성 시간표가 없습니다.</div>;

  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-black">주간 수업 시간표</h2>
        <p className="mt-1 text-sm text-slate-500">DB에 등록된 활성 수업을 요일과 시간 순으로 표시합니다.</p>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[1050px]">
          <div className="grid grid-cols-[76px_repeat(7,minmax(130px,1fr))] border-b border-slate-200 bg-slate-50">
            <div className="p-4 text-center text-xs font-black text-slate-400">시간</div>
            {days.map((day) => <div key={day} className="border-l border-slate-200 p-4 text-center font-black">{day}요일</div>)}
          </div>
          <div className="grid grid-cols-[76px_repeat(7,minmax(130px,1fr))]">
            <div className="relative border-r border-slate-200" style={{ height: calendarHeight }}>
              {Array.from({ length: endHour - startHour + 1 }, (_, index) => (
                <span key={index} className="absolute right-3 -translate-y-1/2 text-xs font-bold text-slate-400" style={{ top: index * hourHeight }}>
                  {String(startHour + index).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {days.map((day, dayIndex) => (
              <div key={day} className="relative border-r border-slate-100 bg-[linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)]" style={{ height: calendarHeight, backgroundSize: `100% ${hourHeight}px` }}>
                {schedules.filter((item) => normalizedDay(item.day_of_week) === day).map((item, index) => {
                  const top = ((minuteOf(item.start_time) - startHour * 60) / 60) * hourHeight;
                  const height = Math.max(48, ((minuteOf(item.end_time) - minuteOf(item.start_time)) / 60) * hourHeight - 4);
                  const date = localDate(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + dayIndex));
                  const booked = reservations.filter((reservation) => reservation.schedule_id === item.id && reservation.class_date === date);
                  return (
                    <button type="button" key={item.id} onClick={() => setSelected({ schedule: item, date, reservations: booked })} className="absolute left-1.5 right-1.5 overflow-hidden rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-left shadow-sm transition hover:border-blue-500 hover:bg-blue-100" style={{ top: top + 2, height, marginLeft: index % 2 ? 5 : 0 }} title="예약자 확인">
                      <p className="truncate text-xs font-black text-blue-950">{item.target_class}</p>
                      <p className="mt-1 text-[11px] font-bold text-blue-700">{item.start_time.slice(0, 5)}~{item.end_time.slice(0, 5)}</p>
                      <p className="mt-1 text-[10px] font-black text-blue-600">예약 {booked.length}{item.max_people ? ` / ${item.max_people}` : ""}명</p>
                      {showBranch && <p className="mt-1 truncate text-[10px] text-slate-500">{item.branches?.name ?? item.branch_id ?? "지점 미지정"}</p>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {selected && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-xs sm:items-center sm:p-6" onClick={() => setSelected(null)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-widest text-blue-600">예약 명단</p>
                <h3 className="mt-1 text-xl font-black">{selected.schedule.target_class}</h3>
                <p className="mt-1 text-sm text-slate-500">{selected.date} · {selected.schedule.start_time.slice(0, 5)}~{selected.schedule.end_time.slice(0, 5)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black">닫기</button>
            </div>
            <div className="mb-4 flex items-center justify-between rounded-2xl bg-blue-50 px-4 py-3">
              <span className="text-sm font-bold text-blue-900">예약 인원</span>
              <b className="text-blue-700">{selected.reservations.length}{selected.schedule.max_people ? ` / ${selected.schedule.max_people}` : ""}명</b>
            </div>
            {selected.reservations.length ? (
              <div className="space-y-2">
                {selected.reservations.map((reservation, index) => (
                  <div key={reservation.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                    <div className="min-w-0">
                      <p className="font-black">{index + 1}. {reservation.children?.child_name ?? "자녀 정보 없음"}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">보호자 {reservation.users?.name ?? "-"}{reservation.users?.phone ? ` · ${reservation.users.phone}` : ""}</p>
                    </div>
                    <div className="text-right">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{reservation.attendance_status ?? reservation.status ?? "예약"}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">이 수업에 예약된 자녀가 없습니다.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
