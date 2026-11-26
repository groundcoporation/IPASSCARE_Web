import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { 
  CalendarCheck, Check, ChevronLeft, ChevronRight, Clock3, CreditCard, Download, 
  Loader2, LogOut, Search, ShieldAlert, TicketCheck, UsersRound, FileText, Settings, Video, Lock, User, Eye, EyeOff, Pencil, Play, Trash2, X,
  GitFork, BookOpen, GraduationCap, Users, DollarSign, MessageSquare, LayoutDashboard, Bus, CheckCircle2, RefreshCw, Calendar as CalendarIcon, Building2, Home,
  History, Clock, Coins, Bell, Megaphone
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { AppError, formatError, logError, normalizeError } from "../../errors/appError";
import { handleError } from "../../errors/handleError";
import { loadActiveAppSchedulesByChild } from "../../lib/adminScheduleAssignments";
import { ATTENDANCE_PAGE_SIZES, paginateAttendance, type AttendancePageSize } from "../../utils/attendancePagination";
import { firstJoined } from "../../utils/relations";
import { loadAttendanceLedger } from "./attendance/api/attendanceLedger";
import { MAX_SLOTS, kstDateKey, isBeforeChildDeletion, rangeOf, moveMonth } from "./attendance/model/ledgerRules";
import { loadDailyAttendance } from "./attendance/api/dailyAttendance";
import { loadCalendarAttendance } from "./attendance/api/calendarAttendance";
import { registerLedgerAttendance, cancelLedgerAttendance } from "./attendance/api/ledgerActions";
import { writeTimelineAction } from "./attendance/api/timelineAction";
import { writeBatchTimelineAction } from "./attendance/api/batchTimelineAction";
import { notifyTimelineAttendance } from "./attendance/api/timelineNotification";
import { cancelPayment } from "./billing/api/paymentCancellation";
import { loadPaymentHistory } from "./billing/api/paymentHistory";
import { loadWeeklySchedule } from "./classes/api/weeklySchedule";
import { loadAdminContentList, loadAdminSiteSettings } from "./site/api/contentReads";
import { saveAdminSiteSettings } from "./site/api/settingsWrite";
import { prepareSiteSettings } from "./site/model/settings";
import { saveAdminVideo, deleteAdminVideo } from "./site/api/videoWrites";
import { saveAdminPartner, deleteAdminPartner } from "./site/api/partnerWrites";
import { preparePartner, partnerFileExtension, isPartnerId } from "./site/model/partners";
import { extractYoutubeId, videoSteps, videoDuration, prepareVideo, isVideoId } from "./site/model/videos";
import type { ClassSchedule, ScheduleReservation } from "./classes/model/weeklySchedule";
import { WeeklySchedule } from "./classes/views/WeeklySchedule";
import { filterWeeklySchedules } from "./classes/model/scheduleDisplay";
import { paymentsForMonth, filterPayments, paymentStats, paymentRefundInfo, statusText, paymentDetail, paymentReference, type Payment } from "./billing/model/paymentHistory";
import { preparePaymentCancellation } from "./billing/model/paymentCancellation";
import { attendanceNotificationActions, type AttendanceNotificationAction, type TimelineAttendanceAction, type BatchAttendanceAction, type AttendanceConfirmation } from "./attendance/model/timelineActions";
import type { AttendanceRow, AttendanceSource } from "./attendance/types";
import { ReferralTreeTab } from "./referrals/views/ReferralTreeTab";
import { AdminStudentTab } from "./students/views/AdminStudentTab";
import { AdminTeacherTab } from "./teachers/views/AdminTeacherTab";
import { AdminClassTab } from "./classes/views/AdminClassTab";
import { AdminBillingTab } from "./billing/views/AdminBillingTab";
import { AdminOfflinePaymentTab } from "./billing/views/AdminOfflinePaymentTab";
import { AdminCounselTab } from "./journals/views/AdminCounselTab";
import { AdminStudyTab } from "./journals/views/AdminStudyTab";
import { AdminRoleManagementTab } from "./roles/views/AdminRoleManagementTab";
import { AdminSmsTab } from "./messages/views/AdminSmsTab";
import { AdminDashboardTab } from "./dashboard/views/AdminDashboardTab";
import { AdminNoticeTab } from "./notices/views/AdminNoticeTab";
import { AdminHqNoticeTab } from "./notices/views/AdminHqNoticeTab";
import { AdminShuttleTab } from "./shuttle/views/AdminShuttleTab";

const ATTENDANCE_SLOT_INDEXES = Array.from({ length: MAX_SLOTS }, (_, index) => index);
type Profile = { id: string; name: string | null; role: string; branch_id: string | null };
type Branch = { id: string; name: string };
type AttendanceSchedule = {
  id: string;
  target_class: string | null;
  day_of_week?: string | null;
  start_time: string | null;
  end_time: string | null;
};
type AttendanceScheduleStudent = {
  id: string;
  child_id?: string | null;
  academy_student_classes?: Array<{
    class_schedules?: AttendanceSchedule | AttendanceSchedule[] | null;
  }> | null;
};

const won = new Intl.NumberFormat("ko-KR");
const ADMIN_PORTAL_ROLES = new Set(["admin", "director", "teacher", "coach"]);
const canAccessAdminPortal = (role: string | null | undefined) => Boolean(role && ADMIN_PORTAL_ROLES.has(role));
const loadAdminProfile = async (userId: string): Promise<Profile> => {
  const { data, error } = await supabase.from("users").select("id,name,role,branch_id")
    .eq("id", userId).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!data || !canAccessAdminPortal(data.role)) throw new AppError("PERMISSION_DENIED");
  return data;
};
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
const mondayOf = (date: Date) => { const result = new Date(date); const day = result.getDay(); result.setHours(0, 0, 0, 0); result.setDate(result.getDate() - (day === 0 ? 6 : day - 1)); return result; };
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const attendanceActionPresentation: Record<TimelineAttendanceAction, {
  eyebrow: string;
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'indigo' | 'emerald' | 'amber' | 'rose';
}> = {
  ride_in: { eyebrow: '셔틀 출결', title: '승차 처리할까요?', description: '셔틀 승차 시각을 기록하고 학부모에게 승차 알림을 보냅니다.', confirmLabel: '승차 처리', tone: 'indigo' },
  check_in: { eyebrow: '학원 출결', title: '등원 처리할까요?', description: '학원 도착 시각을 기록하고 학부모에게 등원 알림을 보냅니다.', confirmLabel: '등원 처리', tone: 'emerald' },
  check_out: { eyebrow: '학원 출결', title: '하원 처리할까요?', description: '학원 출발 시각을 기록하고 학부모에게 하원 알림을 보냅니다.', confirmLabel: '하원 처리', tone: 'amber' },
  ride_out: { eyebrow: '셔틀 출결', title: '하차 처리할까요?', description: '셔틀 하차 시각을 기록하고 학부모에게 하차 알림을 보냅니다.', confirmLabel: '하차 처리', tone: 'indigo' },
  no_pickup: { eyebrow: '셔틀 출결', title: '승차 미탑승 처리할까요?', description: '선택한 원생을 승차 미탑승 상태로 기록합니다.', confirmLabel: '미탑승 처리', tone: 'amber' },
  no_shuttle: { eyebrow: '셔틀 출결', title: '승차 미탑승 처리할까요?', description: '선택한 원생을 승차 미탑승 상태로 기록합니다.', confirmLabel: '미탑승 처리', tone: 'amber' },
  no_dropoff: { eyebrow: '셔틀 출결', title: '하차 미탑승 처리할까요?', description: '선택한 원생을 하차 미탑승 상태로 기록합니다.', confirmLabel: '미탑승 처리', tone: 'amber' },
  is_absent: { eyebrow: '출결 상태', title: '결석 처리할까요?', description: '선택한 원생을 오늘 결석으로 기록합니다.', confirmLabel: '결석 처리', tone: 'rose' },
  reset: { eyebrow: '처리 초기화', title: '전체 기록을 초기화할까요?', description: '승하차·등하원·미탑승 상태를 모두 초기화합니다.', confirmLabel: '전체 초기화', tone: 'rose' },
  cancel_ride_in: { eyebrow: '처리 취소', title: '승차 처리를 취소할까요?', description: '승차 또는 승차 미탑승 기록을 취소합니다.', confirmLabel: '승차 취소', tone: 'rose' },
  cancel_check_in: { eyebrow: '처리 취소', title: '등원 처리를 취소할까요?', description: '기록된 등원 상태와 시각을 취소합니다.', confirmLabel: '등원 취소', tone: 'rose' },
  cancel_check_out: { eyebrow: '처리 취소', title: '하원 처리를 취소할까요?', description: '기록된 하원 상태와 시각을 취소합니다.', confirmLabel: '하원 취소', tone: 'rose' },
  cancel_ride_out: { eyebrow: '처리 취소', title: '하차 처리를 취소할까요?', description: '하차 또는 하차 미탑승 기록을 취소합니다.', confirmLabel: '하차 취소', tone: 'rose' },
  cancel_absent: { eyebrow: '처리 취소', title: '결석 처리를 취소할까요?', description: '기록된 결석 상태를 취소합니다.', confirmLabel: '결석 취소', tone: 'rose' },
};

const sendAttendanceNotification = (childId: string, branchId: string, serviceDate: string, action: AttendanceNotificationAction) =>
  notifyTimelineAttendance(childId, branchId, serviceDate, action, { client: supabase });


interface AdminPageProps {
  onBackToSite: () => void;
  onLoginSuccess?: (profile: Profile) => void;
  onLogout?: () => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onBackToSite, onLoginSuccess, onLogout }) => {
  // Authentication State
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const loginInFlight = useRef(false);
  
  // Login Form & Remember Me State
  const [identifier, setIdentifier] = useState(() => localStorage.getItem("remembered_id") || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberId, setRememberId] = useState(() => localStorage.getItem("remember_id_check") === "true");
  const [autoLogin, setAutoLogin] = useState(() => localStorage.getItem("auto_login_check") === "true");
  const [loginError, setLoginError] = useState("");

  // Re-designed 2-Tier Layout Navigation States
  const [mainTab, setMainTab] = useState<'dashboard' | 'student_mgmt' | 'attendance_mgmt' | 'shuttle_mgmt' | 'billing_mgmt' | 'sms_mgmt' | 'role_mgmt' | 'referral_mgmt' | 'basic_settings'>('dashboard');
  const [subTab, setSubTab] = useState<string>('dashboard_home');
  const [loading, setLoading] = useState(false);
  const [, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [month, setMonth] = useState(() => kstDateKey(new Date().toISOString())?.slice(0, 7) ?? localDate(new Date()).slice(0, 7));
  const [paymentMonth, setPaymentMonth] = useState(() => localDate(new Date()).slice(0, 7));
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState("all");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [attendancePageSize, setAttendancePageSize] = useState<AttendancePageSize>(20);
  const [attendancePage, setAttendancePage] = useState({ key: "", number: 1 });
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceLoadFailed, setAttendanceLoadFailed] = useState(false);
  const [attendanceLoadedKey, setAttendanceLoadedKey] = useState("");
  const attendanceQueryKey = JSON.stringify([profile?.id, branchFilter, month]);
  const attendancePending = attendanceLoading || attendanceLoadedKey !== attendanceQueryKey;
  const attendanceLoadRequest = useRef(0);
  const dailyLoadRequest = useRef(0);
  const calendarLoadRequest = useRef(0);
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
  const [attendanceConfirmation, setAttendanceConfirmation] = useState<AttendanceConfirmation | null>(null);
  const [attendanceActionBusy, setAttendanceActionBusy] = useState(false);
  const timelineInFlight = useRef(false);
  const timelineViewEpoch = useRef(0);
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
  const paymentCancelInFlight = useRef(false);
  const paymentViewEpoch = useRef(0);
  const cancelModalEpoch = useRef(0);
  const paymentReadRequest = useRef(0);
  const scheduleReadRequest = useRef(0);
  const contentReadRequest = useRef({ inquiries: 0, settings: 0, videos: 0, partners: 0 });
  const contentViewEpoch = useRef(0);
  const contentActiveView = useRef({ profile, subTab });
  contentActiveView.current = { profile, subTab };
  const [settingsReadReady, setSettingsReadReady] = useState(false);
  const settingsSaveInFlight = useRef(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const videoWriteInFlight = useRef(false);
  const videoReviewRequired = useRef(false);
  const videoReadReady = useRef(false);
  const [videoWriteBusy, setVideoWriteBusy] = useState(false);
  const partnerWriteInFlight = useRef(false);
  const partnerReviewRequired = useRef(false);
  const partnerReadReady = useRef(false);
  const [partnerWriteBusy, setPartnerWriteBusy] = useState(false);

  // Attendance Modal State
  const [attendanceModal, setAttendanceModal] = useState<{ childId: string; childName: string; packageId: string } | null>(null);
  const attendanceToday = kstDateKey(new Date().toISOString()) ?? "";
  const [attendanceDate, setAttendanceDate] = useState(() => kstDateKey(new Date().toISOString()) ?? "");
  const [actionLoading, setActionLoading] = useState(false);
  const manualAttendanceInFlight = useRef(false);
  const attendanceDialog = useRef<HTMLDialogElement>(null);
  const attendanceTitleId = useId();
  const attendanceDateId = useId();
  const ledgerCancelInFlight = useRef(false);
  const [ledgerCancelPending, setLedgerCancelPending] = useState(false);

  const onLoginSuccessRef = useRef(onLoginSuccess);
  useEffect(() => {
    onLoginSuccessRef.current = onLoginSuccess;
  }, [onLoginSuccess]);

  useEffect(() => {
    if (attendanceModal && attendanceDialog.current && !attendanceDialog.current.open) {
      attendanceDialog.current.showModal();
    }
  }, [attendanceModal]);

  // Set Tab Title on Mount
  useEffect(() => {
    document.title = "아이패스케어 - 관리자 모드";
  }, []);

  // Session Check
  useEffect(() => {
    let restoreAllowed = true;
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      restoreAllowed = false;
      setProfile(null);
      if (!loginInFlight.current) setAuthLoading(false);
      onLogout?.();
    });
    (async () => {
      try {
        const { data: auth, error } = await supabase.auth.getUser();
        if (error?.name === "AuthSessionMissingError") return;
        if (error) throw error;
        if (!auth.user || !restoreAllowed) return;
        const verifiedProfile = await loadAdminProfile(auth.user.id);
        if (!restoreAllowed) return;
        setProfile(verifiedProfile);
        setLoginError("");
        onLoginSuccessRef.current?.(verifiedProfile);
      } catch (error: unknown) {
        if (!restoreAllowed) return;
        const safeError = normalizeError(error, "AUTH_REQUIRED");
        logError(safeError, { operation: "admin.auth.restore" });
        setLoginError(formatError(safeError));
      } finally {
        if (mounted && !loginInFlight.current) setAuthLoading(false);
      }
    })();
    return () => { mounted = false; restoreAllowed = false; subscription.unsubscribe(); };
  }, [onLogout]);

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
    if (!profile) return;
    const request = ++calendarLoadRequest.current;
    try {
      if (profile.role !== "admin" && !profile.branch_id) throw new AppError("PERMISSION_DENIED");
      const data = await loadCalendarAttendance(scopedBranchId(profile, branchFilter), attendanceCalendarMonth, { client: supabase });
      if (request !== calendarLoadRequest.current) return;
      setCalendarMonthLogs(data.logs);
      setCalendarMonthReservations(data.reservations);
    } catch (error: unknown) {
      if (request !== calendarLoadRequest.current) return;
      setCalendarMonthLogs([]);
      setCalendarMonthReservations([]);
      await handleError(error, "ATTENDANCE_CALENDAR_LOAD_FAILED", { operation: "attendance.calendar.load" });
    }
  }, [attendanceCalendarMonth, branchFilter, profile]);

  // Load Daily Attendance Students & Supabase Attendance Logs for "관리자 출결"
const loadDailyAttendanceStudents = useCallback(async () => {
    if (!profile) return;
    const request = ++dailyLoadRequest.current;
    try {
      if (profile.role !== "admin" && !profile.branch_id) throw new AppError("PERMISSION_DENIED");
      const data = await loadDailyAttendance(scopedBranchId(profile, branchFilter), selectedAttendanceDate, {
        client: supabase, loadSchedules: loadActiveAppSchedulesByChild,
      });
      if (request !== dailyLoadRequest.current) return;
      setAttendanceStudentsWithHistory(data.studentsWithHistory);
      setTodayAttendanceStudents(data.studentsList);
      setTodayReservations(data.activeReservations);
      setTodayReservationChildIds(data.reservationChildIds);
      setTodayAttendanceRecords(data.recordsMap);
    } catch (error: unknown) {
      if (request !== dailyLoadRequest.current) return;
      setAttendanceStudentsWithHistory([]);
      setTodayAttendanceStudents([]);
      setTodayReservations([]);
      setTodayReservationChildIds([]);
      setTodayAttendanceRecords({});
      await handleError(error, "ATTENDANCE_DAILY_LOAD_FAILED", { operation: "attendance.daily.load" });
    }
  }, [branchFilter, profile, selectedAttendanceDate]);

  useEffect(() => () => { dailyLoadRequest.current += 1; timelineViewEpoch.current += 1; }, [branchFilter, profile, selectedAttendanceDate, subTab]);
  useEffect(() => () => { calendarLoadRequest.current += 1; }, [branchFilter, profile, attendanceCalendarMonth, subTab]);

  // Login Handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginInFlight.current) return;
    loginInFlight.current = true;
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
      let loginEmail = identifier.trim();
      if (!loginEmail.includes("@")) {
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("email")
          .eq("username", loginEmail)
          .neq("status", "deleted")
          .maybeSingle();

        if (userError) throw userError;
        if (!userData?.email) {
          setLoginError("[AUTH_REQUIRED] 아이디 또는 비밀번호를 확인해 주세요.");
          return;
        }
        loginEmail = userData.email;
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: password,
      });

      if (authError || !authData?.user) {
        setLoginError("[AUTH_REQUIRED] 아이디 또는 비밀번호를 확인해 주세요.");
        return;
      }

      let authenticatedProfile: Profile;
      try {
        authenticatedProfile = await loadAdminProfile(authData.user.id);
      } catch (error: unknown) {
        const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
        if (signOutError) logError(normalizeError(signOutError, "AUTH_REQUIRED"), { operation: "admin.auth.rejectedSignOut" });
        throw error;
      }

      setProfile(authenticatedProfile);
      if (onLoginSuccessRef.current) onLoginSuccessRef.current(authenticatedProfile);
    } catch (error: unknown) {
      setProfile(null);
      const safeError = normalizeError(error, "AUTH_REQUIRED");
      logError(safeError, { operation: "admin.auth.login" });
      setLoginError(formatError(safeError));
    } finally {
      loginInFlight.current = false;
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    // 웹에서 로그아웃해도 앱과 다른 기기의 세션은 유지합니다.
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      localStorage.removeItem("auto_login_check");
      setProfile(null);
      onLogout?.();
    } catch (error: unknown) {
      await handleError(error, "AUTH_REQUIRED", { operation: "admin.auth.logout" });
    }
  };

  // Load returned payment history; month filtering remains a pure display calculation.
  const loadPayments = useCallback(async (reportError = true) => {
    if (!profile) return;
    const request = ++paymentReadRequest.current;
    setLoading(true); setError("");
    try {
      if (profile.role !== 'admin' && !profile.branch_id) throw new AppError('PERMISSION_DENIED');
      const rows = await loadPaymentHistory(scopedBranchId(profile, branchFilter), { client: supabase });
      if (request === paymentReadRequest.current) setPayments(rows);
    } catch (reason: unknown) {
      if (request !== paymentReadRequest.current) return;
      setPayments([]);
      if (!reportError) throw new AppError('PAYMENT_CANCEL_REFRESH_FAILED', reason);
      await handleError(reason, 'PAYMENT_HISTORY_LOAD_FAILED', { operation: 'payment.history.load' });
    } finally { if (request === paymentReadRequest.current) setLoading(false); }
  }, [branchFilter, profile]);

  useEffect(() => () => {
    paymentViewEpoch.current += 1;
    paymentReadRequest.current += 1;
  }, [branchFilter, profile, paymentMonth, subTab]);

  // Load Attendance
  const loadAttendance = useCallback(async (reportError = true) => {
    if (!profile || !month) return;
    const request = ++attendanceLoadRequest.current;
    setAttendanceLoading(true);
    setAttendanceLoadFailed(false);
    try {
      if (profile.role !== "admin" && !profile.branch_id) throw new AppError("PERMISSION_DENIED");
      const rows = await loadAttendanceLedger(scopedBranchId(profile, branchFilter), month, { client: supabase });
      if (request === attendanceLoadRequest.current) setAttendance(rows);
    } catch (reason: unknown) {
      if (request !== attendanceLoadRequest.current) return;
      setAttendance([]);
      setAttendanceLoadFailed(true);
      if (!reportError) throw new AppError("ATT_LEDGER_REFRESH_FAILED", reason);
      await handleError(reason, "ATTENDANCE_LEDGER_LOAD_FAILED", { operation: "attendance.ledger.load" });
    } finally {
      if (request === attendanceLoadRequest.current) {
        setAttendanceLoadedKey(attendanceQueryKey);
        setAttendanceLoading(false);
      }
    }
  }, [attendanceQueryKey, branchFilter, month, profile]);

  useEffect(() => () => { attendanceLoadRequest.current += 1; }, [attendanceQueryKey, subTab]);

  // Load schedules and related people only after every read succeeds.
  const loadSchedules = useCallback(async () => {
    if (!profile) return;
    const request = ++scheduleReadRequest.current;
    setLoading(true); setError("");
    try {
      if (profile.role !== 'admin' && !profile.branch_id) throw new AppError('PERMISSION_DENIED');
      const result = await loadWeeklySchedule(scopedBranchId(profile, branchFilter),
        localDate(weekStart), localDate(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)),
        { client: supabase });
      if (request !== scheduleReadRequest.current) return;
      setSchedules(result.schedules);
      setScheduleReservations(result.reservations);
    } catch (error: unknown) {
      if (request !== scheduleReadRequest.current) return;
      setSchedules([]);
      setScheduleReservations([]);
      await handleError(error, 'SCHEDULE_LOAD_FAILED', { operation: 'schedule.week.load' });
    } finally {
      if (request === scheduleReadRequest.current) setLoading(false);
    }
  }, [branchFilter, profile, weekStart]);

  useEffect(() => () => { scheduleReadRequest.current += 1; }, [branchFilter, profile, weekStart, subTab]);

  // Admin content readers: independent sequences plus shared view invalidation.
  const loadInquiries = useCallback(async () => {
    if (!profile || contentActiveView.current.profile !== profile || contentActiveView.current.subTab !== 'inquiries') return;
    const view = contentViewEpoch.current;
    const request = ++contentReadRequest.current.inquiries;
    const isCurrent = () => view === contentViewEpoch.current && request === contentReadRequest.current.inquiries;
    setLoading(true);
    
    try {
      if (profile.role !== 'admin') throw new AppError('PERMISSION_DENIED');
      const result = await loadAdminContentList('inquiries', { client: supabase });
      if (!isCurrent()) return;
      setInquiries(result);
    } catch (error: unknown) {
      if (!isCurrent()) return;
      setInquiries([]);
      await handleError(error, 'ADMIN_CONTENT_LOAD_FAILED', { operation: 'admin.content.inquiries.load' });
    } finally { if (isCurrent()) setLoading(false); }
  }, [profile]);

  const loadSettings = useCallback(async () => {
    if (settingsSaveInFlight.current) return;
    if (!profile || contentActiveView.current.profile !== profile || contentActiveView.current.subTab !== 'settings') return;
    const view = contentViewEpoch.current;
    const request = ++contentReadRequest.current.settings;
    const isCurrent = () => view === contentViewEpoch.current && request === contentReadRequest.current.settings;
    setLoading(true);
    setSettingsReadReady(false); setSaveMsg("");
    try {
      if (profile.role !== 'admin') throw new AppError('PERMISSION_DENIED');
      const result = await loadAdminSiteSettings({ client: supabase });
      if (!isCurrent()) return;
      setLitePrice(result.litePrice); setProPrice(result.proPrice); setSettingsReadReady(true);
    } catch (error: unknown) {
      if (!isCurrent()) return;
      setSettingsReadReady(false);
      await handleError(error, 'ADMIN_CONTENT_LOAD_FAILED', { operation: 'admin.content.settings.load' });
    } finally { if (isCurrent()) setLoading(false); }
  }, [profile]);

  const handleSaveSettings = async () => {
    if (settingsSaveInFlight.current || !settingsReadReady || loading) return;
    const view = contentViewEpoch.current;
    const isCurrent = () => view === contentViewEpoch.current && contentActiveView.current.profile === profile && contentActiveView.current.subTab === 'settings';
    if (!isCurrent()) return;
    let acquired = false;
    try {
      if (profile?.role !== 'admin') throw new AppError('PERMISSION_DENIED');
      prepareSiteSettings(litePrice, proPrice);
      settingsSaveInFlight.current = true; acquired = true;
      contentReadRequest.current.settings += 1;
      setSettingsSaving(true); setSaveMsg('');
      const result = await saveAdminSiteSettings(litePrice, proPrice, { client: supabase });
      if (!isCurrent()) return;
      setLitePrice(String(result.litePrice)); setProPrice(String(result.proPrice));
      setSaveMsg('설정 저장 응답을 확인했습니다. 홈페이지 표시는 새로 조회해 확인해 주세요.');
    } catch (error: unknown) {
      if (!isCurrent()) return;
      if (acquired) setSettingsReadReady(false);
      await handleError(error, 'ADMIN_SETTINGS_SAVE_UNCONFIRMED', { operation: 'admin.settings.save' });
    } finally {
      if (acquired) {
        settingsSaveInFlight.current = false; setSettingsSaving(false);
        // A return to this tab during the write skipped its read; fetch once after release.
        if (!isCurrent()) await loadSettings();
      }
    }
  };

  const loadVideos = useCallback(async (reportError = true, afterWrite = false) => {
    if (videoWriteInFlight.current && !afterWrite) return;
    if (!profile || contentActiveView.current.profile !== profile || contentActiveView.current.subTab !== 'videos') return;
    const view = contentViewEpoch.current;
    const request = ++contentReadRequest.current.videos;
    const isCurrent = () => view === contentViewEpoch.current && request === contentReadRequest.current.videos;
    videoReadReady.current = false;
    setLoading(true);
    
    try {
      if (profile.role !== 'admin') throw new AppError('PERMISSION_DENIED');
      const result = await loadAdminContentList('videos', { client: supabase });
      if (!isCurrent()) return;
      setVideos(result);
      videoReadReady.current = true;
      videoReviewRequired.current = false;
    } catch (error: unknown) {
      if (!isCurrent()) return;
      setVideos([]);
      if (!reportError) throw new AppError('ADMIN_VIDEO_REFRESH_FAILED', error);
      await handleError(error, 'ADMIN_CONTENT_LOAD_FAILED', { operation: 'admin.content.videos.load' });
    } finally { if (isCurrent()) setLoading(false); }
  }, [profile]);

  const loadPartners = useCallback(async (reportError = true, afterWrite = false) => {
    if (partnerWriteInFlight.current && !afterWrite) return;
    if (!profile || contentActiveView.current.profile !== profile || contentActiveView.current.subTab !== 'partners') return;
    const view = contentViewEpoch.current;
    const request = ++contentReadRequest.current.partners;
    const isCurrent = () => view === contentViewEpoch.current && request === contentReadRequest.current.partners;
    partnerReadReady.current = false;
    setLoading(true);
    setPartnerTableError(false);
    try {
      if (profile.role !== 'admin') throw new AppError('PERMISSION_DENIED');
      const result = await loadAdminContentList('partners', { client: supabase });
      if (!isCurrent()) return;
      setPartners(result);
      partnerReadReady.current = true; partnerReviewRequired.current = false;
    } catch (error: unknown) {
      if (!isCurrent()) return;
      setPartners([]); setPartnerTableError(true);
      if (!reportError) throw new AppError('ADMIN_PARTNER_REFRESH_FAILED', error);
      await handleError(error, 'ADMIN_CONTENT_LOAD_FAILED', { operation: 'admin.content.partners.load' });
    } finally { if (isCurrent()) setLoading(false); }
  }, [profile]);

  useEffect(() => () => {
    contentViewEpoch.current += 1;
    setSettingsReadReady(false);
    videoReadReady.current = false;
    partnerReadReady.current = false;
  }, [profile, subTab]);

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
  }, [loadSubTabData, selectedAttendanceDate, attendanceCalendarMonth, paymentMonth]);

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
    if (partnerWriteInFlight.current || partnerReviewRequired.current || !partnerReadReady.current) return;
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

  useEffect(() => () => {
    if (partnerPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(partnerPreviewUrl);
  }, [partnerPreviewUrl]);

  const handlePartnerFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (partnerWriteInFlight.current || partnerReviewRequired.current || !partnerReadReady.current) return;
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      partnerFileExtension(file);
      setPartnerFile(file);
      setPartnerPreviewUrl(URL.createObjectURL(file));
    } catch (error: unknown) {
      event.target.value = '';
      void handleError(error, 'ADMIN_PARTNER_INPUT_INVALID', { operation: 'admin.partner.preview' });
    }
  };

  const executePartnerWrite = async (mode: 'save' | 'delete', id: string | null) => {
    if (partnerWriteInFlight.current || partnerReviewRequired.current || !partnerReadReady.current || loading) return;
    const view = contentViewEpoch.current;
    const isCurrent = () => view === contentViewEpoch.current && contentActiveView.current.profile === profile && contentActiveView.current.subTab === 'partners';
    if (!isCurrent()) return;
    let acquired = false;
    try {
      if (profile?.role !== 'admin') throw new AppError('PERMISSION_DENIED');
      if (id !== null && !isPartnerId(id)) throw new AppError('ADMIN_PARTNER_INPUT_INVALID');
      const form = { name: partnerName, description: partnerDescription, logoUrl: partnerLogoUrl, order: partnerDisplayOrder, visible: partnerIsVisible, file: partnerFile };
      if (mode === 'save') preparePartner(form);
      else {
        if (!id || !partners.some(item => item.id === id)) throw new AppError('ADMIN_PARTNER_INPUT_INVALID');
        if (!confirm('이 파트너 브랜드를 삭제하시겠습니까? 로고 파일은 보존됩니다.')) return;
      }
      partnerWriteInFlight.current = true; acquired = true;
      contentReadRequest.current.partners += 1; setPartnerWriteBusy(true);
      if (mode === 'save') {
        const result = await saveAdminPartner(form, id, { client: supabase });
        if (result.issue) {
          if (isCurrent() && result.uploadedPath) {
            const code = result.stage === 'upload_unconfirmed' ? 'ADMIN_PARTNER_UPLOAD_UNCONFIRMED' : 'ADMIN_PARTNER_SAVE_PARTIAL';
            if (result.issue.code !== code) await handleError(new AppError(code), code, { operation: 'admin.partner.partial' });
          }
          throw result.issue;
        }
      } else await deleteAdminPartner(id!, { client: supabase });
      if (!isCurrent()) return;
      if (mode === 'save' || editingPartnerId === id) resetPartnerForm();
      alert(mode === 'save' ? '브랜드 저장 응답을 확인했습니다.' : '브랜드 삭제 응답을 확인했습니다. 로고 파일은 보존했습니다.');
      await loadPartners(false, true);
    } catch (error: unknown) {
      if (!isCurrent()) return;
      if (acquired) { partnerReviewRequired.current = true; partnerReadReady.current = false; }
      await handleError(error, 'ADMIN_PARTNER_WRITE_UNCONFIRMED', { operation: 'admin.partner.' + mode });
    } finally {
      if (acquired) {
        partnerWriteInFlight.current = false; setPartnerWriteBusy(false);
        if (!isCurrent()) await loadPartners();
      }
    }
  };
  const handleSavePartner = async (event: React.FormEvent) => { event.preventDefault(); await executePartnerWrite('save', editingPartnerId); };
  const handleDeletePartner = async (id: string) => { await executePartnerWrite('delete', id); };

  const parsedSteps = useMemo(() => {
    return videoSteps(newVideoStepsText);
  }, [newVideoStepsText]);

  const currentPreviewYoutubeId = useMemo(() => {
    return extractYoutubeId(newVideoUrl);
  }, [newVideoUrl]);

  const effectiveDuration = useMemo(() => {
    return videoDuration(newVideoDuration, currentPreviewYoutubeId);
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
    if (videoWriteInFlight.current || videoReviewRequired.current || !videoReadReady.current) return;
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

  const executeVideoWrite = async (mode: 'save' | 'delete', id: string | null) => {
    if (videoWriteInFlight.current || videoReviewRequired.current || !videoReadReady.current || loading) return;
    const view = contentViewEpoch.current;
    const isCurrent = () => view === contentViewEpoch.current && contentActiveView.current.profile === profile && contentActiveView.current.subTab === 'videos';
    if (!isCurrent()) return;
    let acquired = false;
    try {
      if (profile?.role !== 'admin') throw new AppError('PERMISSION_DENIED');
      if (id !== null && !isVideoId(id)) throw new AppError('ADMIN_VIDEO_INPUT_INVALID');
      const form = { title: newVideoTitle, category: newVideoCategory, duration: newVideoDuration,
        description: newVideoDescription, stepsText: newVideoStepsText, url: newVideoUrl,
        theme: newVideoTheme, restricted: newVideoIsRestricted };
      if (mode === 'save') prepareVideo(form);
      else {
        if (!id || !videos.some(item => item.id === id)) throw new AppError('ADMIN_VIDEO_INPUT_INVALID');
        if (!confirm('이 매뉴얼 동영상을 삭제하시겠습니까?')) return;
      }
      videoWriteInFlight.current = true; acquired = true;
      contentReadRequest.current.videos += 1;
      setVideoWriteBusy(true);
      if (mode === 'save') await saveAdminVideo(form, id, { client: supabase });
      else await deleteAdminVideo(id!, { client: supabase });
      if (!isCurrent()) return;
      if (mode === 'save' || editingVideoId === id) resetVideoForm();
      alert(mode === 'save' ? '영상 저장 응답을 확인했습니다.' : '영상 삭제 응답을 확인했습니다.');
      await loadVideos(false, true);
    } catch (error: unknown) {
      if (!isCurrent()) return;
      if (acquired) { videoReviewRequired.current = true; videoReadReady.current = false; }
      await handleError(error, 'ADMIN_VIDEO_WRITE_UNCONFIRMED', { operation: 'admin.video.' + mode });
    } finally {
      if (acquired) {
        videoWriteInFlight.current = false; setVideoWriteBusy(false);
        if (!isCurrent()) await loadVideos();
      }
    }
  };

  const handleSaveVideo = async (event: React.FormEvent) => {
    event.preventDefault();
    await executeVideoWrite('save', editingVideoId);
  };
  const handleDeleteVideo = async (id: string) => { await executeVideoWrite('delete', id); };

  // Handlers for payments
  const getRefundInfo = (item: Payment | null) => paymentRefundInfo(item, payments);

const handleCancelPayment = async () => {
    if (!cancelTarget || paymentCancelInFlight.current) return;
    const target = cancelTarget;
    const { remaining } = getRefundInfo(target);
    const amt = cancelAmountStr.trim() ? Number(cancelAmountStr) : remaining;
    const view = paymentViewEpoch.current;
    const form = cancelModalEpoch.current;
    let confirmed = false;
    let acquired = false;
    try {
      const plan = preparePaymentCancellation({ payment: target, amount: amt, remaining, reason: cancelReason });
      if (!confirm(plan.kind === 'offline'
        ? '현장결제 장부를 취소하시겠습니까? 미사용 이용권이 회수되며 실제 환불은 별도 확인해야 합니다.'
        : `서버에 카드 결제 전체 취소를 요청하시겠습니까?\n취소 금액: ${amt.toLocaleString()}원`)) return;
      if (paymentCancelInFlight.current) return;
      paymentCancelInFlight.current = true;
      acquired = true;
      setCancelLoading(true);
      const result = await cancelPayment({ payment: target, amount: amt, remaining, reason: cancelReason }, { client: supabase });
      confirmed = true;
      if (view === paymentViewEpoch.current && form === cancelModalEpoch.current) setCancelTarget(null);
      alert(result.kind === 'offline'
        ? result.alreadyCancelled ? '이미 취소된 현장결제 장부입니다. 실제 환불 여부는 별도로 확인해 주세요.'
          : '현장결제 장부 취소 응답을 확인했습니다. 실제 환불과 이용권 내역을 별도로 확인해 주세요.'
        : '서버의 카드 전체 취소 승인 응답을 확인했습니다. 원거래와 결제·이용권 반영 내역을 확인해 주세요.');
      if (view === paymentViewEpoch.current) await loadPayments(false);
    } catch (error: unknown) {
      const normalized = normalizeError(error, confirmed ? 'PAYMENT_CANCEL_REFRESH_FAILED' : 'PAYMENT_CANCEL_FAILED');
      if (normalized.code === 'PAYMENT_CANCEL_FAILED' && view === paymentViewEpoch.current && form === cancelModalEpoch.current) setCancelTarget(null);
      await handleError(normalized, 'PAYMENT_CANCEL_FAILED', { operation: 'payment.cancel', transactionId: target.id });
    } finally {
      if (acquired) {
        paymentCancelInFlight.current = false;
        setCancelLoading(false);
      }
    }
  };

  const handleManualAttendance = async () => {
    if (!attendanceModal || !profile || !attendanceDate.startsWith(`${month}-`) || manualAttendanceInFlight.current || ledgerCancelInFlight.current || timelineInFlight.current) return;
    manualAttendanceInFlight.current = true;
    const view = attendanceLoadRequest.current;
    setActionLoading(true);
    try {
      const result = await registerLedgerAttendance(attendanceModal.childId, attendanceDate, attendanceModal.packageId, { client: supabase });
      if (view === attendanceLoadRequest.current) attendanceDialog.current?.close();
      alert(result.alreadyRegistered ? "이미 등록된 출석입니다. 이용권은 추가로 차감하지 않았습니다." : "출석을 등록하고 이용권 1회를 차감했습니다.");
      if (view === attendanceLoadRequest.current) await loadAttendance(false);
    } catch (error: unknown) {
      const safeError = normalizeError(error, "ATT_LEDGER_WRITE_UNCONFIRMED");
      await handleError(safeError, "ATT_LEDGER_WRITE_UNCONFIRMED", { operation: "attendance.ledger.register" });
    } finally {
      manualAttendanceInFlight.current = false;
      setActionLoading(false);
    }
  };

  const handleCancelAttendance = async (row: AttendanceRow, dateStr: string, source: AttendanceSource | null) => {
    if (!profile || ledgerCancelInFlight.current || manualAttendanceInFlight.current || timelineInFlight.current) return;
    if (!confirm(`${dateStr} 출석을 취소하시겠습니까?\n연결된 이용권 차감 기록이 있으면 해당 횟수가 복구됩니다.`)) return;
    if (ledgerCancelInFlight.current || manualAttendanceInFlight.current || timelineInFlight.current) return;
    ledgerCancelInFlight.current = true;
    const view = attendanceLoadRequest.current;
    setLedgerCancelPending(true);
    try {
      const result = await cancelLedgerAttendance(row.childId, dateStr, row.id, source, { client: supabase });
      alert(result.restored > 0 ? `출석을 취소하고 이용권 ${result.restored}회를 복구했습니다.` : "출석을 취소했습니다.");
      if (view === attendanceLoadRequest.current) await loadAttendance(false);
    } catch (error: unknown) {
      await handleError(error, "ATT_LEDGER_WRITE_UNCONFIRMED", { operation: "attendance.ledger.cancel" });
    } finally {
      ledgerCancelInFlight.current = false;
      setLedgerCancelPending(false);
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
    anchor.download = kind === "payments" ? `결제내역_${paymentMonth}.xlsx` : `출결표_${month}.xlsx`;
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
const executeTimelineAction = async (
    studentId: string,
    actionType: TimelineAttendanceAction,
    sendNotification: boolean,
  ) => {
    const view = timelineViewEpoch.current;
    try {
      const student = todayAttendanceStudents.find(item => item.id === studentId);
      if (!student || !profile || (profile.role !== 'admin' && !profile.branch_id)) throw new AppError('PERMISSION_DENIED');
      const selectedBranch = scopedBranchId(profile, branchFilter);
      const targetBranch = selectedBranch || student.branch_id;
      if (!targetBranch || (selectedBranch && student.branch_id && selectedBranch !== student.branch_id)) throw new AppError('PERMISSION_DENIED');
      const targetChildId = student.child_id || student.id;
      const result = await writeTimelineAction({
        childId: targetChildId, branchId: targetBranch, date: selectedAttendanceDate, action: actionType,
        record: todayAttendanceRecords[studentId] || {},
      }, { client: supabase });
      if (result.issue) {
        if (result.completedSteps > 0 && result.issue.code !== 'ATT_TIMELINE_REVIEW_REQUIRED') {
          await handleError(new AppError('ATT_TIMELINE_REVIEW_REQUIRED'), 'ATT_TIMELINE_REVIEW_REQUIRED', { operation: 'attendance.timeline.partial' });
        }
        await handleError(result.issue, 'ATT_TIMELINE_REVIEW_REQUIRED', { operation: 'attendance.timeline.save' });
        if (view === timelineViewEpoch.current) await loadDailyAttendanceStudents();
        return;
      }
      if (sendNotification && attendanceNotificationActions.has(actionType as AttendanceNotificationAction)) {
        try {
          await sendAttendanceNotification(targetChildId, targetBranch, selectedAttendanceDate, actionType as AttendanceNotificationAction);
        } catch (error: unknown) {
          await handleError(new AppError('ATT_NOTIFICATION_FAILED', error), 'ATT_NOTIFICATION_FAILED', { operation: 'attendance.timeline.notify' });
        }
      }
      if (view === timelineViewEpoch.current) await loadDailyAttendanceStudents();
    } catch (error: unknown) {
      await handleError(error, 'ATT_TIMELINE_REVIEW_REQUIRED', { operation: 'attendance.timeline.save' });
      if (view === timelineViewEpoch.current) await loadDailyAttendanceStudents();
    }
  };

  const executeBatchTimelineAction = async (
    actionType: BatchAttendanceAction,
    sendNotification: boolean,
    targetIds: string[],
  ) => {
    const view = timelineViewEpoch.current;
    try {
      if (!profile || (profile.role !== 'admin' && !profile.branch_id)) throw new AppError('PERMISSION_DENIED');
      const selectedBranch = scopedBranchId(profile, branchFilter);
      const targets = targetIds.map(studentId => {
        const student = todayAttendanceStudents.find(item => item.id === studentId);
        if (!student || !isStudentScheduledOnDate(student)) throw new AppError('INPUT_INVALID');
        const branchId = selectedBranch || student.branch_id;
        if (!branchId || (selectedBranch && student.branch_id && selectedBranch !== student.branch_id)) throw new AppError('PERMISSION_DENIED');
        return { studentId, childId: student.child_id || student.id, branchId,
          record: { ...(todayAttendanceRecords[studentId] || {}) } };
      });
      const results = await writeBatchTimelineAction({
        targets, date: selectedAttendanceDate, action: actionType, sendNotification,
      }, { client: supabase, isCurrent: () => view === timelineViewEpoch.current });
      if (view !== timelineViewEpoch.current) return;
      const responded = results.filter(item => item.storage === 'responses_received').length;
      const review = results.filter(item => item.storage === 'review_required').length;
      const pending = results.filter(item => item.storage === 'not_attempted').length;
      const notified = results.filter(item => item.notification === 'response_received').length;
      const notifyReview = results.filter(item => item.notification === 'review_required').length;
      const notifyPending = results.filter(item => item.notification === 'not_attempted').length;
      alert(`일괄 출결 결과: 저장 응답 확인 ${responded}명 · 결과 확인 필요 ${review}명 · 미실행 ${pending}명\n저장 응답 확인은 실제 반영 행 수나 이용권 차감 완료를 보장하지 않습니다. 최신 내역을 확인해 주세요.${sendNotification && attendanceNotificationActions.has(actionType as AttendanceNotificationAction) ? `\n알림 응답 확인 ${notified}명 · 확인 필요 ${notifyReview}명 · 미요청 ${notifyPending}명 (기기 수신 보장 아님)` : ''}`);
      const storageIssue = results.find(item => item.issue)?.issue;
      if (storageIssue) {
        await handleError(new AppError('ATT_TIMELINE_REVIEW_REQUIRED'), 'ATT_TIMELINE_REVIEW_REQUIRED', { operation: 'attendance.timeline.batch-partial' });
        if (storageIssue.code !== 'ATT_TIMELINE_REVIEW_REQUIRED') await handleError(storageIssue, 'ATT_TIMELINE_REVIEW_REQUIRED', { operation: 'attendance.timeline.batch-save' });
      }
      if (notifyReview) await handleError(new AppError('ATT_NOTIFICATION_FAILED'), 'ATT_NOTIFICATION_FAILED', { operation: 'attendance.timeline.batch-notify' });
    } catch (error: unknown) {
      if (view === timelineViewEpoch.current) await handleError(error, 'ATT_TIMELINE_REVIEW_REQUIRED', { operation: 'attendance.timeline.batch-save' });
    } finally {
      if (view === timelineViewEpoch.current) await loadDailyAttendanceStudents();
    }
  };

  const getBatchAttendanceTargetIds = () => {
    const requestedIds = selectedStudentIds.length > 0
      ? selectedStudentIds
      : filteredAttendanceStudents.map((student) => student.id);
    return [...new Set(requestedIds)].filter((studentId) => {
      const student = todayAttendanceStudents.find((item) => item.id === studentId);
      return student && isStudentScheduledOnDate(student);
    });
  };

  const handleTimelineAction = (studentId: string, action: TimelineAttendanceAction) => {
    if (attendanceActionBusy || timelineInFlight.current) return;
    setAttendanceConfirmation({
      mode: 'single',
      studentId,
      action,
      sendNotification: attendanceNotificationActions.has(action as AttendanceNotificationAction),
    });
  };

  const handleBatchTimelineAction = (action: BatchAttendanceAction) => {
    if (attendanceActionBusy || timelineInFlight.current) return;
    const targetIds = getBatchAttendanceTargetIds();
    const targetCount = targetIds.length;
    if (!targetCount) {
      alert('적용할 대상 학생이 없습니다.');
      return;
    }
    setAttendanceConfirmation({
      mode: 'batch',
      action,
      targetCount,
      targetIds,
      sendNotification: attendanceNotificationActions.has(action as AttendanceNotificationAction),
    });
  };

  const confirmAttendanceAction = async () => {
    if (!attendanceConfirmation || attendanceActionBusy || timelineInFlight.current || manualAttendanceInFlight.current || ledgerCancelInFlight.current) return;
    timelineInFlight.current = true;
    const view = timelineViewEpoch.current;
    setAttendanceActionBusy(true);
    try {
      if (attendanceConfirmation.mode === 'single') {
        await executeTimelineAction(
          attendanceConfirmation.studentId,
          attendanceConfirmation.action,
          attendanceConfirmation.sendNotification,
        );
      } else {
        await executeBatchTimelineAction(
          attendanceConfirmation.action,
          attendanceConfirmation.sendNotification,
          attendanceConfirmation.targetIds,
        );
      }
      if (view === timelineViewEpoch.current) setAttendanceConfirmation(null);
    } finally {
      timelineInFlight.current = false;
      setAttendanceActionBusy(false);
    }
  };

  const shownAttendance = useMemo(() => attendance.filter((item) => `${item.childName} ${item.parentName} ${item.packageName}`.toLowerCase().includes(search.trim().toLowerCase())), [attendance, search]);
  const attendancePageKey = JSON.stringify([attendanceQueryKey, search.trim().toLowerCase(), attendancePageSize]);
  const attendanceView = paginateAttendance(shownAttendance, attendancePage.key === attendancePageKey ? attendancePage.number : 1, attendancePageSize);
  const goToAttendancePage = (number: number) => setAttendancePage({ key: attendancePageKey, number });

  const monthlyPayments = useMemo(() => paymentsForMonth(payments, paymentMonth), [paymentMonth, payments]);
  const shownPayments = useMemo(() => filterPayments(monthlyPayments, search, statusFilter), [monthlyPayments, search, statusFilter]);
  const stats = useMemo(() => paymentStats(monthlyPayments), [monthlyPayments]);
  const shownWeeklySchedules = useMemo(() => filterWeeklySchedules(schedules, search), [schedules, search]);

  // Selected Day computation & scheduled check (Must be before conditional returns)
  const currentDayShort = getShortDayOfWeek(selectedAttendanceDate || new Date().toISOString().slice(0, 10));
  const currentDayFull = getKoreanDayOfWeek(selectedAttendanceDate || new Date().toISOString().slice(0, 10));
  const isPastAttendanceDate = selectedAttendanceDate < localDate(new Date());

  const isStudentScheduledOnDate = useCallback((student: any) => {
    const reservationKey = student?.child_id || student?.id;
    return Boolean(reservationKey) && todayReservationChildIds.includes(reservationKey);
  }, [todayReservationChildIds]);

  // 출결 화면의 수업 정보는 원생에게 등록된 전체 시간표의 첫 항목이 아니라,
  // 선택한 날짜에 실제 생성된 예약이 가리키는 시간표를 기준으로 표시한다.
  const attendanceSchedulesByStudentId = useMemo(() => {
    const schedulesByStudent = new Map<string, AttendanceSchedule[]>();
    todayReservations.forEach((reservation) => {
      if (!reservation?.child_id) return;
      const schedule = firstJoined<AttendanceSchedule>(reservation.class_schedules ?? null);
      if (!schedule) return;
      const schedules = schedulesByStudent.get(reservation.child_id) || [];
      if (!schedules.some((item) => item.id === schedule.id)) schedules.push(schedule);
      schedulesByStudent.set(reservation.child_id, schedules);
    });
    schedulesByStudent.forEach((schedules) => schedules.sort((left, right) => (
      String(left?.start_time || '99:99').localeCompare(String(right?.start_time || '99:99'))
    )));
    return schedulesByStudent;
  }, [todayReservations]);

  const getAttendanceSchedules = useCallback((student: AttendanceScheduleStudent): AttendanceSchedule[] => {
    const reservationKey = student?.child_id || student?.id;
    const reservationSchedules = reservationKey ? attendanceSchedulesByStudentId.get(reservationKey) : undefined;
    if (reservationSchedules?.length) return reservationSchedules;

    // 앱 자녀는 날짜별 예약이 없으면 다른 요일의 수업을 대신 표시하지 않는다.
    if (student?.child_id) return [];

    // 앱 계정과 연결되지 않은 기존 원생만 선택 요일의 학원 시간표를 보조값으로 사용한다.
    return (student?.academy_student_classes || [])
      .map((item) => firstJoined(item?.class_schedules ?? null))
      .filter((schedule) => schedule !== null)
      .filter((schedule) => (
        schedule.day_of_week === currentDayShort || schedule.day_of_week === currentDayFull
      ))
      .sort((left, right) => String(left.start_time || '99:99').localeCompare(String(right.start_time || '99:99')));
  }, [attendanceSchedulesByStudentId, currentDayFull, currentDayShort]);

  // Attendance filter counts
  const scheduledCount = useMemo(() => {
    return (todayAttendanceStudents || []).filter(s => isStudentScheduledOnDate(s)).length;
  }, [todayAttendanceStudents, isStudentScheduledOnDate]);

  const unprocessedCount = useMemo(() => {
    return (todayAttendanceStudents || []).filter(s => {
      if (!s) return false;
      const rec = todayAttendanceRecords[s.id];
      const hasAny = rec && (rec.ride_in || rec.check_in || rec.check_out || rec.ride_out || rec.is_absent || rec.no_shuttle || rec.no_pickup || rec.no_dropoff);
      return isStudentScheduledOnDate(s) && !hasAny;
    }).length;
  }, [todayAttendanceStudents, todayAttendanceRecords, isStudentScheduledOnDate]);

  const completedCount = useMemo(() => {
    return (todayAttendanceStudents || []).filter(s => {
      if (!s) return false;
      const rec = todayAttendanceRecords[s.id];
      return rec && (rec.check_in || rec.check_out || rec.ride_in || rec.ride_out || rec.no_shuttle || rec.no_pickup || rec.no_dropoff);
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
      const attendanceSchedules = getAttendanceSchedules(student);
      if (selectedAttendanceClassFilter !== 'all' && !attendanceSchedules.some((schedule: any) => (
        schedule?.target_class === selectedAttendanceClassFilter
      ))) {
        return false;
      }

      // 3. Status Record
      const record = todayAttendanceRecords[student.id];
      const isScheduled = isStudentScheduledOnDate(student);
      const hasAnyAction = record && (record.ride_in || record.check_in || record.check_out || record.ride_out || record.is_absent || record.no_shuttle || record.no_pickup || record.no_dropoff);
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
    }).sort((left, right) => {
      const leftClass = getAttendanceSchedules(left)[0];
      const rightClass = getAttendanceSchedules(right)[0];
      const timeDiff = String(leftClass?.start_time || '99:99').localeCompare(String(rightClass?.start_time || '99:99'));
      if (timeDiff !== 0) return timeDiff;
      const classDiff = String(leftClass?.target_class || '미배정').localeCompare(String(rightClass?.target_class || '미배정'), 'ko-KR');
      if (classDiff !== 0) return classDiff;
      return String(left.student_name || '').localeCompare(String(right.student_name || ''), 'ko-KR');
    });
  }, [todayAttendanceStudents, search, selectedAttendanceClassFilter, todayAttendanceRecords, attendanceViewFilter, isStudentScheduledOnDate, getAttendanceSchedules]);

  const uniqueClasses = useMemo(() => {
    return Array.from(new Set((todayAttendanceStudents || []).flatMap((student) => (
      getAttendanceSchedules(student).map((schedule: any) => schedule?.target_class)
    )).filter(Boolean)));
  }, [todayAttendanceStudents, getAttendanceSchedules]);

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
  const attendanceConfirmationConfig = attendanceConfirmation
    ? attendanceActionPresentation[attendanceConfirmation.action]
    : null;
  const attendanceConfirmationStudent = attendanceConfirmation?.mode === 'single'
    ? todayAttendanceStudents.find((student) => student.id === attendanceConfirmation.studentId)
    : null;
  const attendanceConfirmationSubject = attendanceConfirmation?.mode === 'batch'
    ? `${attendanceConfirmation.targetCount}명 일괄 처리`
    : `${attendanceConfirmationStudent?.student_name || attendanceConfirmationStudent?.child_name || '해당 원생'} 원생`;
  const attendanceConfirmationSupportsNotification = Boolean(
    attendanceConfirmation && attendanceNotificationActions.has(attendanceConfirmation.action as AttendanceNotificationAction),
  );
  const attendanceConfirmationDescription = attendanceConfirmationSupportsNotification && attendanceConfirmation?.sendNotification === false
    ? '출결 상태와 처리 시각만 저장하며 학부모 알림은 발송하지 않습니다.'
    : attendanceConfirmationConfig?.description;

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-900 font-sans antialiased">
      
      {/* 1. TOP NAVIGATION HEADER (대메뉴) */}
      <header className="bg-white border-b border-slate-200 h-[76px] fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 xl:px-6 shadow-xs">
        <div 
          onClick={onBackToSite}
          className="flex items-center gap-2.5 cursor-pointer group shrink-0 mr-2 xl:mr-4"
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
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2 h-full">
          {[
            { id: 'dashboard', label: '대시보드', subDefault: 'dashboard_home' },
            { id: 'student_mgmt', label: '학생관리', subDefault: 'students' },
            { id: 'attendance_mgmt', label: '출결관리', subDefault: 'admin_attendance' },
            { id: 'shuttle_mgmt', label: '셔틀관리', subDefault: 'shuttle' },
            { id: 'billing_mgmt', label: '수납관리', subDefault: 'billing' },
            { id: 'sms_mgmt', label: '문자관리', subDefault: 'sms_send' },
            ...(['admin', 'director'].includes(profile?.role ?? '') ? [{ id: 'role_mgmt', label: '권한 부여', subDefault: 'role_management' }] : []),
            { id: 'referral_mgmt', label: '추천 포인트트리', subDefault: 'referrals' },
            ...(profile?.role === 'admin' ? [{ id: 'basic_settings', label: '기본설정', subDefault: 'settings' }] : [])
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
                className={`px-3.5 xl:px-4.5 py-2.5 rounded-xl text-[13.5px] xl:text-sm whitespace-nowrap tracking-tight flex items-center justify-center transition-all ${
                  isActive 
                    ? 'bg-blue-50 text-blue-600 font-black border border-blue-200/80 shadow-2xs' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-bold border border-transparent'
                }`}
              >
                {menu.label}
              </button>
            );
          })}
        </nav>

        {/* Top Right Utilities */}
        <div className="flex items-center gap-2 xl:gap-3 shrink-0 ml-2">
          {/* Back to Homepage Button */}
          <button 
            onClick={onBackToSite}
            className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 transition shadow-xs whitespace-nowrap"
            title="홈페이지로 돌아가기"
          >
            <Home size={14} className="text-blue-600" />
            <span className="hidden xl:inline">홈페이지</span>
          </button>

          {profile?.role === "admin" && (
            <div className="bg-slate-100/80 px-2 py-1.5 rounded-xl border border-slate-200/50 flex items-center shrink-0">
              <span className="text-[11px] font-extrabold text-slate-400 px-1.5">지점</span>
              <BranchFilter profile={profile} branches={branches} value={branchFilter} onChange={setBranchFilter} />
            </div>
          )}

          {profile?.role !== "admin" && (
            <div className={`hidden sm:flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 ${activeBranchName ? 'border-blue-100 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
              <Building2 size={13} />
              <div className="leading-tight">
                <p className="max-w-[120px] xl:max-w-[160px] truncate text-[11px] font-black">{activeBranchName ?? '지점 미지정'}</p>
              </div>
            </div>
          )}

          <button 
            onClick={logout} 
            className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 transition shadow-xs whitespace-nowrap"
          >
            <User size={13} className="text-slate-400" />
            <span className="hidden sm:inline">{profile?.name ?? "관리자"}님</span>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-black">
              {roleLabel(profile?.role)}
            </span>
            <LogOut size={13} className="text-slate-400 ml-0.5" />
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
                {mainTab === 'dashboard' && 'DASHBOARD'}
                {mainTab === 'student_mgmt' && 'STUDENT MGMT'}
                {mainTab === 'attendance_mgmt' && 'ATTENDANCE MGMT'}
                {mainTab === 'shuttle_mgmt' && 'SHUTTLE MGMT'}
                {mainTab === 'billing_mgmt' && 'BILLING MGMT'}
                {mainTab === 'sms_mgmt' && 'MESSAGING MGMT'}
                {mainTab === 'role_mgmt' && 'ROLE MANAGEMENT'}
                {mainTab === 'referral_mgmt' && 'REFERRAL TREE'}
                {mainTab === 'basic_settings' && 'SYSTEM SETTINGS'}
              </span>
              <h2 className="text-sm font-black text-white mt-2 px-1 flex items-center gap-1.5">
                <LayoutDashboard size={14} className="text-blue-500" />
                {mainTab === 'dashboard' && '통합 대시보드'}
                {mainTab === 'student_mgmt' && '학생관리'}
                {mainTab === 'attendance_mgmt' && '출결관리'}
                {mainTab === 'shuttle_mgmt' && '셔틀관리'}
                {mainTab === 'billing_mgmt' && '수납관리'}
                {mainTab === 'sms_mgmt' && '문자관리'}
                {mainTab === 'role_mgmt' && '권한 부여'}
                {mainTab === 'referral_mgmt' && '추천 포인트트리'}
                {mainTab === 'basic_settings' && '기본설정'}
              </h2>
            </div>

            {/* Sidebar Navigation Items (소메뉴) */}
            <nav className="space-y-1">
              {/* DASHBOARD SUBMENU */}
              {mainTab === 'dashboard' && [
                { id: 'dashboard_home', label: '학원 운영 현황 요약', icon: LayoutDashboard },
                { id: 'hq_notices', label: '본사 운영 공지 (웹 전용)', icon: Megaphone },
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

              {/* STUDENT MGMT SUBMENU */}
              {mainTab === 'student_mgmt' && [
                { id: 'notices', label: '학부모 공지사항 (앱 연동)', icon: Bell },
                { id: 'students', label: '학생 목록', icon: Users },
                { id: 'classes', label: '클래스 관리', icon: BookOpen },
                { id: 'teachers', label: '강사 및 임직원 관리', icon: GraduationCap },
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

              {mainTab === 'shuttle_mgmt' && [
                { id: 'shuttle', label: '셔틀 통합 관리', icon: Bus },
              ].map((item) => {
                const isActive = subTab === item.id;
                return <button key={item.id} onClick={() => { setSubTab(item.id); setSearch(""); }} className={`w-full flex items-center gap-2.5 px-3 py-3 text-xs font-bold rounded-xl text-left transition ${isActive ? 'bg-blue-600 text-white font-extrabold shadow-sm' : 'hover:bg-slate-800 hover:text-white'}`}><item.icon size={15} />{item.label}</button>;
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
            <p>v1.0.0 (공식 런칭 버전)</p>
          </div>
        </aside>

        {/* 3. RIGHT MAIN CONTENT AREA */}
        <main className="min-w-0 flex-1 md:pl-[240px] min-h-screen">
          <div className="w-full max-w-none space-y-6 p-4 sm:p-6 xl:p-8">
            
            {/* DASHBOARD TAB */}
            {subTab === "dashboard_home" && (
              <AdminDashboardTab
                profile={profile}
                activeBranchId={activeBranchId}
                branches={branches}
                onNavigateTab={(targetMain, targetSub) => {
                  setMainTab(targetMain as any);
                  if (targetSub) setSubTab(targetSub);
                  setSearch("");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            )}

            {/* HQ NOTICES FULL TAB */}
            {subTab === "hq_notices" && (
              <AdminHqNoticeTab profile={profile} />
            )}

            {/* STUDENTS LIST TAB (100% Original Complete Component) */}
            {subTab === "students" && (
              <AdminStudentTab activeBranchId={activeBranchId} branches={branches} />
            )}

            {subTab === "shuttle" && (
              <AdminShuttleTab activeBranchId={activeBranchId} profile={profile} />
            )}

            {/* TEACHERS TAB (100% Original) */}
            {subTab === "teachers" && (
              <AdminTeacherTab activeBranchId={activeBranchId} branches={branches} profile={profile} />
            )}

            {/* CLASSES TAB (100% Original) */}
            {subTab === "classes" && (
              <AdminClassTab activeBranchId={activeBranchId} branches={branches} profile={profile} />
            )}

            {/* PARENT NOTICES TAB (100% App Synced) */}
            {subTab === "notices" && (
              <AdminNoticeTab activeBranchId={activeBranchId} branches={branches} profile={profile} />
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
                            const attendanceSchedules = getAttendanceSchedules(s);
                            const currentClassName = Array.from(new Set(attendanceSchedules
                              .map((schedule: any) => schedule?.target_class)
                              .filter(Boolean)
                            )).join(', ') || (isStudentScheduledOnDate(s) ? '예약 수업' : '미배정');
                            const classTime = Array.from(new Set(attendanceSchedules
                              .filter((schedule: any) => schedule?.start_time && schedule?.end_time)
                              .map((schedule: any) => `${schedule.start_time.slice(0, 5)}~${schedule.end_time.slice(0, 5)}`)
                            )).join(', ') || null;
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
                            } else if (record?.check_in && isPastAttendanceDate) {
                              statusBadge = (
                                <span className="inline-block bg-rose-50 text-rose-700 border border-rose-200 font-black px-2.5 py-1 rounded-full text-[11px]">
                                  ⚠️ 하원 미처리
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
                                      onClick={() => handleTimelineAction(s.id, 'cancel_ride_in')}
                                      className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition"
                                      title="클릭 시 승차 취소"
                                    >
                                      <Bus size={12} />
                                      <span>{record.ride_in} 승차</span>
                                    </button>
                                  ) : (record?.no_shuttle || record?.no_pickup) ? (
                                    <button
                                      onClick={() => handleTimelineAction(s.id, 'cancel_ride_in')}
                                      className="inline-block bg-amber-50 border border-amber-200 text-amber-700 font-bold px-2 py-1 rounded-xl text-[11px] hover:bg-amber-100 transition"
                                      title="클릭 시 미탑승 취소"
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
                                      onClick={() => handleTimelineAction(s.id, 'cancel_check_in')}
                                      className="inline-block bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition"
                                      title="클릭 시 등원 취소"
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
                                      onClick={() => handleTimelineAction(s.id, 'cancel_check_out')}
                                      className="inline-block bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition"
                                      title="클릭 시 하원 취소"
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
                                      onClick={() => handleTimelineAction(s.id, 'cancel_ride_out')}
                                      className="inline-block bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition"
                                      title="클릭 시 하차 취소"
                                    >
                                      🚌 {record.ride_out} 하차
                                    </button>
                                  ) : record?.no_dropoff ? (
                                    <button
                                      onClick={() => handleTimelineAction(s.id, 'cancel_ride_out')}
                                      className="inline-block bg-amber-50 border border-amber-200 text-amber-700 font-bold px-2 py-1 rounded-xl text-[11px] hover:bg-amber-100 transition"
                                      title="클릭 시 하차 미탑승 취소"
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
                                      onClick={() => handleTimelineAction(s.id, 'cancel_absent')}
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
                              const reservationSchedules = getAttendanceSchedules(s);
                              const currentClassName = Array.from(new Set(reservationSchedules.map((schedule) => schedule.target_class))).join(', ') || '예약 수업';
                              const classTime = Array.from(new Set(reservationSchedules
                                .flatMap(({ start_time, end_time }) => start_time && end_time
                                  ? [`${start_time.slice(0, 5)}~${end_time.slice(0, 5)}`]
                                  : [])
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
                              } else if (record?.check_in && isPastAttendanceDate) {
                                statusBadge = (
                                  <span className="inline-block bg-rose-50 text-rose-700 border border-rose-200 font-black px-2.5 py-1 rounded-full text-[11px]">
                                    ⚠️ 하원 미처리
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
                                        onClick={() => handleTimelineAction(s.id, 'cancel_ride_in')}
                                        className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition shadow-2xs"
                                        title="클릭 시 승차 취소"
                                      >
                                        <Bus size={12} />
                                        <span>{record.ride_in} 승차</span>
                                      </button>
                                    ) : record?.no_pickup || record?.no_shuttle ? (
                                      <button
                                        onClick={() => handleTimelineAction(s.id, 'cancel_ride_in')}
                                        className="inline-block bg-amber-50 border border-amber-200 text-amber-700 font-bold px-2 py-1 rounded-xl text-[11px] hover:bg-amber-100 transition shadow-2xs"
                                        title="클릭 시 미탑승 취소"
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
                                        onClick={() => handleTimelineAction(s.id, 'cancel_check_in')}
                                        className="inline-block bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition shadow-2xs"
                                        title="클릭 시 등원 취소"
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
                                        onClick={() => handleTimelineAction(s.id, 'cancel_check_out')}
                                        className="inline-block bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition shadow-2xs"
                                        title="클릭 시 하원 취소"
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
                                        onClick={() => handleTimelineAction(s.id, 'cancel_ride_out')}
                                        className="inline-block bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-700 font-black px-2.5 py-1 rounded-xl text-xs font-mono transition shadow-2xs"
                                        title="클릭 시 하차 취소"
                                      >
                                        🚌 {record.ride_out} 하차
                                      </button>
                                    ) : record?.no_dropoff ? (
                                      <button
                                        onClick={() => handleTimelineAction(s.id, 'cancel_ride_out')}
                                        className="inline-block bg-amber-50 border border-amber-200 text-amber-700 font-bold px-2 py-1 rounded-xl text-[11px] hover:bg-amber-100 transition shadow-2xs"
                                        title="클릭 시 하차 미탑승 취소"
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

            {/* ATTENDANCE 3: 출결 조회 */}
            {subTab === "attendance" && (
              <>
                <section className="mb-5 grid gap-3 sm:grid-cols-3" aria-label="조회 결과 요약">
                  <Stat label="조회 원생" value={attendancePending || attendanceLoadFailed ? '—' : `${new Set(shownAttendance.map((row) => row.childId)).size}명`} icon={<UsersRound />} color="blue" />
                  <Stat label="이번 달 이용" value={attendancePending || attendanceLoadFailed ? '—' : `${shownAttendance.reduce((sum, row) => sum + row.dates.length, 0)}회`} icon={<CalendarCheck />} color="green" />
                  <Stat label="남은 이용권" value={attendancePending || attendanceLoadFailed ? '—' : `${shownAttendance.reduce((sum, row) => sum + row.remaining, 0)}회`} icon={<TicketCheck />} color="amber" />
                </section>

                <Toolbar search={search} setSearch={(value) => { setSearch(value); goToAttendancePage(1); }} placeholder="자녀, 보호자, 이용권 검색">
                  <BranchFilter profile={profile} branches={branches} value={branchFilter} onChange={(value) => { setBranchFilter(value); goToAttendancePage(1); }} />
                  <div className="flex items-center rounded-xl border border-slate-200">
                    <button aria-label="이전 달" onClick={() => { setMonth(moveMonth(month, -1)); goToAttendancePage(1); }} className="p-3"><ChevronLeft size={18} /></button>
                    <input type="month" aria-label="출결 조회 월" value={month} onChange={(e) => { if (e.target.value) { setMonth(e.target.value); goToAttendancePage(1); } }} className="w-[132px] py-3 text-center text-sm font-bold outline-none bg-transparent text-slate-900" />
                    <button aria-label="다음 달" onClick={() => { setMonth(moveMonth(month, 1)); goToAttendancePage(1); }} className="p-3"><ChevronRight size={18} /></button>
                  </div>
                  <button type="button" disabled={attendanceLoading} onClick={() => void loadAttendance()} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={attendanceLoading ? 'animate-spin' : undefined} /> 새로고침</button>
                  <button type="button" disabled={attendancePending || attendanceLoadFailed || !shownAttendance.length} onClick={() => void downloadWorkbook("attendance")} className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><Download size={17} /> Excel</button>
                </Toolbar>

                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="월별 출결 장부" aria-busy={attendancePending}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">월별 출결 장부</h2>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">표를 좌우로 밀어 1~{MAX_SLOTS}회차를 확인하세요. 이용권 차감 기록을 우선 표시하며 결석·보강은 제외합니다.</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    페이지당
                    <select value={attendancePageSize} onChange={(e) => { setAttendancePageSize(Number(e.target.value) as AttendancePageSize); goToAttendancePage(1); }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-semibold text-slate-800">
                      {ATTENDANCE_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}개</option>)}
                    </select>
                  </label>
                </div>

                {attendancePending ? (
                  <p className="px-4 py-12 text-center text-sm text-slate-500" role="status">출결 내역을 불러오는 중입니다.</p>
                ) : (
                <div className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500" role="region" aria-label="출결 조회 표, 가로 스크롤 가능" tabIndex={0}>
                  <table className="w-max min-w-full text-left text-xs sm:text-[13px]">
                    <caption className="sr-only">월별 원생 출결 및 이용권 현황</caption>
                    <thead className="bg-slate-50 text-[11px] font-bold text-slate-600">
                      <tr><Th sticky>자녀 / 보호자</Th><Th>이용권</Th><Th>주 횟수</Th><Th>사용</Th>{ATTENDANCE_SLOT_INDEXES.map((i) => <th key={i} scope="col" className="min-w-10 px-0.5 py-4 text-center">{i + 1}</th>)}<Th>출석 횟수</Th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {attendanceView.rows.map((row) => (
                        <tr key={row.id} className={`hover:bg-blue-50/30 ${row.withdrawalStatus === 'pending' ? 'bg-amber-50/20' : ''}`}>
                          <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-4 text-left align-middle font-normal">
                            <div className="flex items-center gap-1.5">
                              <b className="text-sm">{row.childName}</b>
                              {row.withdrawalStatus === 'pending' && (
                                <span className="inline-flex items-center text-[10px] font-black bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200 shadow-2xs">
                                  🟡 환불대기
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400">보호자 {row.parentName}</p>
                          </th>
                          <Td><b className="text-[12px]">{row.packageName}</b><p className="mt-1 text-[11px] text-slate-400">{row.total}회권 · 잔여 {row.remaining}회</p></Td>
                          <Td>{row.weekly ? <b>주 {row.weekly}회</b> : "-"}</Td>
                          <Td><b className="text-blue-700">{row.used}</b> / {row.total}</Td>
                          {ATTENDANCE_SLOT_INDEXES.map((i) => {
                            const date = row.dates[i];
                                const isClickable = i < row.total && month <= attendanceToday.slice(0, 7);
                            return (
                              <td key={i} className="px-0.5 py-2 text-center">
                                {date ? (
                                  <button type="button" disabled={ledgerCancelPending || actionLoading} onClick={() => void handleCancelAttendance(row, date, row.sources[i] ?? null)} aria-label={`${date.slice(5).replace("-", ".")} ${row.childName} ${i + 1}회차 출석 취소`} className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white text-[9px] font-black hover:bg-rose-600 hover:scale-105 transition shadow-xs font-mono disabled:opacity-50" title={`${date} 출석 취소`}>{date.slice(5).replace("-", ".")}</button>
                                ) : (
                                  <button type="button" onClick={() => { if (manualAttendanceInFlight.current || ledgerCancelInFlight.current) return; const today = kstDateKey(new Date().toISOString()) ?? ""; setAttendanceModal({ childId: row.childId, childName: row.childName, packageId: row.id }); setAttendanceDate(today.startsWith(`${month}-`) ? today : ""); }} disabled={!isClickable || ledgerCancelPending || actionLoading} aria-label={`${i + 1}회차 ${row.childName} 출석 등록`} className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-xs font-black transition hover:scale-105 ${isClickable ? "bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600" : "bg-slate-50 text-slate-200 cursor-not-allowed"}`} title={`${i + 1}회차 출석 등록`}>{i + 1}</button>
                                )}
                              </td>
                            );
                          })}
                          <Td><b className={`inline-block min-w-11 rounded-full px-2 py-1 text-center tabular-nums ${row.dates.length ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{row.dates.length}회</b></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!shownAttendance.length && <p className="px-4 py-12 text-center text-sm text-slate-500" role="status">{attendanceLoadFailed ? '출결 내역을 불러오지 못했습니다. 새로고침으로 다시 조회해 주세요.' : '조건에 맞는 출결 정보가 없습니다.'}</p>}
                </div>
                )}
                {!attendancePending && shownAttendance.length > 0 && (
                  <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-5">
                    <p className="text-xs tabular-nums text-slate-500" aria-live="polite">전체 {shownAttendance.length.toLocaleString()}개 중 {attendanceView.first.toLocaleString()}~{attendanceView.last.toLocaleString()}개</p>
                    <nav aria-label="출결 조회 페이지" className="flex items-center gap-2">
                      <button type="button" onClick={() => goToAttendancePage(attendanceView.page - 1)} disabled={attendanceView.page === 1} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={15} /> 이전</button>
                      <span className="min-w-12 text-center text-xs font-bold tabular-nums text-slate-700">{attendanceView.page} / {attendanceView.totalPages}</span>
                      <button type="button" onClick={() => goToAttendancePage(attendanceView.page + 1)} disabled={attendanceView.page === attendanceView.totalPages} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">다음 <ChevronRight size={15} /></button>
                    </nav>
                  </footer>
                )}
                </section>
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
                <WeeklySchedule key={JSON.stringify([profile?.id, branchFilter, localDate(weekStart), scheduleReadRequest.current])} schedules={shownWeeklySchedules} reservations={scheduleReservations} weekStart={weekStart} loading={loading} showBranch={profile?.role === "admin" && branchFilter === "all"} />
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

                <Toolbar search={search} setSearch={setSearch} placeholder="회원명, 자녀명, 이메일, 거래번호 검색">
                  <BranchFilter profile={profile} branches={branches} value={branchFilter} onChange={setBranchFilter} />
                  <div className="flex items-center rounded-xl border border-slate-200 bg-white">
                    <button aria-label="이전 결제 월" onClick={() => setPaymentMonth((current) => moveMonth(current, -1))} className="p-3 text-slate-600 hover:text-slate-950"><ChevronLeft size={18} /></button>
                    <input aria-label="결제 월 선택" type="month" value={paymentMonth} onChange={(e) => e.target.value && setPaymentMonth(e.target.value)} className="min-w-[145px] border-x border-slate-200 px-3 py-2.5 text-center text-sm font-black outline-none" />
                    <button aria-label="다음 결제 월" onClick={() => setPaymentMonth((current) => moveMonth(current, 1))} className="p-3 text-slate-600 hover:text-slate-950"><ChevronRight size={18} /></button>
                  </div>
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
                                  <button onClick={() => { if (paymentCancelInFlight.current) return; cancelModalEpoch.current += 1; setCancelTarget(item); setCancelAmountStr(String(remaining)); }} className="rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-black text-rose-600 hover:bg-rose-100 transition shadow-2xs border border-rose-200">
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
                  <input type="number" min="1" step="1" disabled={!settingsReadReady || settingsSaving} value={litePrice} onChange={(e) => { setLitePrice(e.target.value); setSaveMsg(''); }} className="w-full bg-slate-100 p-3 rounded-xl text-sm font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600">Pro 요금제 월 단가 (원)</label>
                  <input type="number" min="1" step="1" disabled={!settingsReadReady || settingsSaving} value={proPrice} onChange={(e) => { setProPrice(e.target.value); setSaveMsg(''); }} className="w-full bg-slate-100 p-3 rounded-xl text-sm font-bold" />
                </div>
                <button disabled={!settingsReadReady || loading || settingsSaving} onClick={handleSaveSettings} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50">{settingsSaving ? "저장 중..." : "설정 DB 저장하기"}</button>
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
                    <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl text-xs text-amber-800">
                      브랜드 목록을 불러오지 못했습니다. 조회 권한과 서버 배포 상태를 확인한 뒤 탭을 다시 열어 주세요. 임의로 테이블이나 권한을 변경하지 마세요.
                    </div>
                  ) : (
                    <form onSubmit={handleSavePartner} className="space-y-4">
                      <fieldset disabled={partnerWriteBusy || partnerReviewRequired.current || !partnerReadReady.current} className="contents">
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
                        <label className="block text-xs font-bold text-slate-700 mb-1">로고 이미지 (PNG/JPEG/SVG/WebP/GIF, 최대 10MB)</label>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
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
                      </fieldset>
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
                        목록 조회 실패
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
                              disabled={partnerWriteBusy || partnerReviewRequired.current || !partnerReadReady.current}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl"
                              title="수정"
                            >
                              <Pencil size={18} />
                            </button>
                            <button
                              onClick={() => handleDeletePartner(p.id)}
                              disabled={partnerWriteBusy || partnerReviewRequired.current || !partnerReadReady.current}
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
                    <fieldset disabled={videoWriteBusy || videoReviewRequired.current || !videoReadReady.current} className="contents">
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
                    </fieldset>
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
                                disabled={videoWriteBusy || videoReviewRequired.current || !videoReadReady.current}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl"
                                title="수정"
                              >
                                <Pencil size={18} />
                              </button>
                              <button
                                onClick={() => handleDeleteVideo(v.id)}
                                disabled={videoWriteBusy || videoReviewRequired.current || !videoReadReady.current}
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

      {/* Attendance Action Confirmation */}
      {attendanceConfirmation && attendanceConfirmationConfig && (
        <div
          className="fixed inset-0 z-[5000] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => !attendanceActionBusy && setAttendanceConfirmation(null)}
          role="presentation"
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-t-[2rem] bg-white shadow-[0_30px_100px_rgba(15,23,42,0.35)] sm:rounded-[2rem]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-confirm-title"
          >
            <div className={`h-1.5 w-full ${
              attendanceConfirmationConfig.tone === 'emerald' ? 'bg-emerald-500'
                : attendanceConfirmationConfig.tone === 'amber' ? 'bg-amber-400'
                  : attendanceConfirmationConfig.tone === 'rose' ? 'bg-rose-500'
                    : 'bg-indigo-600'
            }`} />
            <div className="p-6 sm:p-7">
              <div className="flex items-start gap-4">
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                  attendanceConfirmationConfig.tone === 'emerald' ? 'bg-emerald-50 text-emerald-600'
                    : attendanceConfirmationConfig.tone === 'amber' ? 'bg-amber-50 text-amber-600'
                      : attendanceConfirmationConfig.tone === 'rose' ? 'bg-rose-50 text-rose-600'
                        : 'bg-indigo-50 text-indigo-600'
                }`}>
                  {attendanceConfirmationConfig.tone === 'rose'
                    ? <ShieldAlert size={27} strokeWidth={2.4} />
                    : attendanceConfirmation.action === 'ride_in' || attendanceConfirmation.action === 'ride_out'
                      ? <Bus size={28} strokeWidth={2.4} />
                      : <CheckCircle2 size={28} strokeWidth={2.4} />}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className={`text-xs font-black tracking-[0.16em] ${
                    attendanceConfirmationConfig.tone === 'emerald' ? 'text-emerald-600'
                      : attendanceConfirmationConfig.tone === 'amber' ? 'text-amber-600'
                        : attendanceConfirmationConfig.tone === 'rose' ? 'text-rose-600'
                          : 'text-indigo-600'
                  }`}>
                    {attendanceConfirmationConfig.eyebrow}
                  </p>
                  <h3 id="attendance-confirm-title" className="mt-1.5 text-2xl font-black tracking-tight text-slate-950">
                    {attendanceConfirmationConfig.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAttendanceConfirmation(null)}
                  disabled={attendanceActionBusy}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:opacity-40"
                  aria-label="닫기"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-base font-black text-slate-900">{attendanceConfirmationSubject}</span>
                  <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-slate-600 ring-1 ring-slate-200">
                    {selectedAttendanceDate}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  {attendanceConfirmationDescription}
                </p>
              </div>

              {attendanceConfirmationSupportsNotification && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-black tracking-wide text-slate-500">학부모 알림 선택</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setAttendanceConfirmation((current) => current ? { ...current, sendNotification: true } : current)}
                      disabled={attendanceActionBusy}
                      className={`rounded-2xl border p-3.5 text-left transition ${
                        attendanceConfirmation.sendNotification
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/15'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${attendanceConfirmation.sendNotification ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <Bell size={18} />
                      </span>
                      <span className="mt-2.5 block text-sm font-black text-slate-900">알림 발송</span>
                      <span className="mt-1 block text-[11px] font-semibold leading-4 text-slate-500">저장 후 학부모에게 안내</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceConfirmation((current) => current ? { ...current, sendNotification: false } : current)}
                      disabled={attendanceActionBusy}
                      className={`rounded-2xl border p-3.5 text-left transition ${
                        !attendanceConfirmation.sendNotification
                          ? 'border-slate-700 bg-slate-100 ring-2 ring-slate-700/10'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${!attendanceConfirmation.sendNotification ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <Bell size={18} className="opacity-50" />
                      </span>
                      <span className="mt-2.5 block text-sm font-black text-slate-900">알림 없이 처리</span>
                      <span className="mt-1 block text-[11px] font-semibold leading-4 text-slate-500">출결 기록만 저장</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAttendanceConfirmation(null)}
                  disabled={attendanceActionBusy}
                  className="rounded-2xl bg-slate-100 py-3.5 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
                >
                  돌아가기
                </button>
                <button
                  type="button"
                  onClick={() => void confirmAttendanceAction()}
                  disabled={attendanceActionBusy}
                  className={`flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-white shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
                    attendanceConfirmationConfig.tone === 'emerald' ? 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700'
                      : attendanceConfirmationConfig.tone === 'amber' ? 'bg-amber-500 shadow-amber-500/20 hover:bg-amber-600'
                        : attendanceConfirmationConfig.tone === 'rose' ? 'bg-rose-600 shadow-rose-600/20 hover:bg-rose-700'
                          : 'bg-indigo-600 shadow-indigo-600/20 hover:bg-indigo-700'
                  }`}
                >
                  {attendanceActionBusy && <Loader2 size={17} className="animate-spin" />}
                  {attendanceActionBusy ? '처리 중...' : attendanceConfirmationConfig.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-white/60 backdrop-blur-xs">
          <Loader2 className="animate-spin text-blue-600" size={38} />
        </div>
      )}

      {/* Cancel Payment Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-xs sm:items-center sm:p-6" onClick={() => { if (!paymentCancelInFlight.current) { cancelModalEpoch.current += 1; setCancelTarget(null); } }}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-widest text-rose-600">결제 취소 / 환불</p>
                <h3 className="mt-1 text-xl font-black">{cancelTarget.users?.name ?? "회원"}님의 결제건</h3>
                <p className="mt-1 text-sm text-slate-500">거래번호: {cancelTarget.pg_tid ?? cancelTarget.id}</p>
              </div>
              <button onClick={() => { if (!paymentCancelInFlight.current) { cancelModalEpoch.current += 1; setCancelTarget(null); } }} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black">닫기</button>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">원 결제 금액</span><span className="font-bold text-slate-950">{won.format(cancelTarget.final_amount ?? cancelTarget.total_amount ?? 0)}원</span></div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">전체 취소 금액 (부분취소는 담당자 확인 필요)</label>
                <input type="number" readOnly={cancelLoading} value={cancelAmountStr} onChange={(e) => setCancelAmountStr(e.target.value)} className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">취소 사유</label>
                <input type="text" readOnly={cancelLoading} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button onClick={handleCancelPayment} disabled={cancelLoading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3.5 text-sm font-black text-white hover:bg-rose-700 disabled:bg-rose-300">
                {cancelLoading ? "취소 요청 처리 중..." : "결제 취소 승인하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {attendanceModal && (
        <dialog ref={attendanceDialog} aria-labelledby={attendanceTitleId}
          onCancel={(event) => { if (manualAttendanceInFlight.current) event.preventDefault(); }}
          onClose={() => setAttendanceModal(null)}
          className="fixed inset-x-0 top-auto bottom-0 mx-auto max-h-[80dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-6 shadow-2xl backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-slate-950/55 backdrop:backdrop-blur-xs sm:inset-0 sm:m-auto sm:rounded-3xl">
          <form aria-busy={actionLoading} onSubmit={(event) => { event.preventDefault(); void handleManualAttendance(); }}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-widest text-blue-600">출결 수동 관리</p>
                <h3 id={attendanceTitleId} className="mt-1 text-xl font-black">{attendanceModal.childName} 학생 출석 등록</h3>
              </div>
              <button type="button" disabled={actionLoading} onClick={() => attendanceDialog.current?.close()} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black disabled:opacity-50">닫기</button>
            </div>
            <div className="space-y-4">
              <div>
                <label htmlFor={attendanceDateId} className="block text-xs font-bold text-slate-600 mb-1.5">출석 처리할 날짜 선택</label>
                <input id={attendanceDateId} type="date" required autoFocus readOnly={actionLoading}
                  min={rangeOf(month).from} max={attendanceToday && attendanceToday < rangeOf(month).to ? attendanceToday : rangeOf(month).to}
                  value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <p className="text-xs text-slate-600">해당 날짜에 예약된 수업이 한 건 있어야 이 이용권으로 출석을 등록할 수 있습니다.</p>
              <button type="submit" disabled={actionLoading || !attendanceDate} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-black text-white hover:bg-blue-700 disabled:bg-blue-300">
                {actionLoading ? "출석 처리 중..." : "출석 완료 체크하기"}
              </button>
            </div>
          </form>
        </dialog>
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

function TableShell({ children, empty, emptyText, scrollLabel }: { children: React.ReactNode; empty: boolean; emptyText: string; scrollLabel?: string }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="overflow-x-auto" role={scrollLabel ? "region" : undefined} aria-label={scrollLabel} tabIndex={scrollLabel ? 0 : undefined}>{children}</div>
      {empty && <div className="p-14 text-center text-sm font-bold text-slate-400">{emptyText}</div>}
    </div>
  );
}

function Th({ children, sticky = false }: { children: React.ReactNode; sticky?: boolean }) {
  return <th scope="col" className={`whitespace-nowrap px-4 py-4 ${sticky ? "sticky left-0 z-10 bg-slate-100" : ""}`}>{children}</th>;
}

function Td({ children, sticky = false }: { children: React.ReactNode; sticky?: boolean }) {
  return <td className={`whitespace-nowrap px-4 py-4 align-middle ${sticky ? "sticky left-0 z-10 bg-white" : ""}`}>{children}</td>;
}

