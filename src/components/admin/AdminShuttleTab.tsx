import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, BellRing, Bus, Clock3, MapPin,
  ChevronDown, ChevronUp, Pencil, Plus, RefreshCw, Route, Save, Search, Trash2, UserPlus, UsersRound, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

type ShuttleSection = 'status' | 'control' | 'spots' | 'routes' | 'alerts';
type RouteDayFilter = '전체' | '월' | '화' | '수' | '목' | '금' | '토' | '일';
type SpotForm = {
  id: string | null;
  name: string;
  address: string;
  lat: string;
  lng: string;
  default_time: string;
};
type RouteForm = {
  id: string | null;
  name: string;
  day_of_week: Exclude<RouteDayFilter, '전체'>;
  direction: 'pickup' | 'dropoff';
  service_time: string;
  vehicle_label: string;
  center_address: string;
  center_lat: string;
  center_lng: string;
};

const emptySpot: SpotForm = { id: null, name: '', address: '', lat: '', lng: '', default_time: '' };
const emptyRoute: RouteForm = { id: null, name: '', day_of_week: '월', direction: 'pickup', service_time: '', vehicle_label: '', center_address: '', center_lat: '', center_lng: '' };
const formatTime = (value?: string | null) => value ? new Date(value).toLocaleString('ko-KR') : '-';
const escapeMapLabel = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character);
const statusClasses = (delay: number) => delay <= 15
  ? { icon: 'bg-emerald-50 text-emerald-600', badge: 'bg-emerald-50 text-emerald-700' }
  : delay <= 60
    ? { icon: 'bg-amber-50 text-amber-600', badge: 'bg-amber-50 text-amber-700' }
    : { icon: 'bg-red-50 text-red-600', badge: 'bg-red-50 text-red-700' };

export const AdminShuttleTab: React.FC<{
  activeBranchId: string | null;
  profile?: { role?: string } | null;
}> = ({ activeBranchId, profile }) => {
  const [section, setSection] = useState<ShuttleSection>('status');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statuses, setStatuses] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<Record<string, string>>({});
  const [spots, setSpots] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<any[]>([]);
  const [routeDayFilter, setRouteDayFilter] = useState<RouteDayFilter>('전체');
  const [spotForm, setSpotForm] = useState<SpotForm | null>(null);
  const [routeForm, setRouteForm] = useState<RouteForm | null>(null);
  const [assignmentRoute, setAssignmentRoute] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      let statusQuery = supabase.from('shuttle_status').select('*').order('last_update', { ascending: false });
      let spotQuery = supabase.from('pickup_spots').select('*').eq('is_active', true).order('name');
      let routeQuery = supabase.from('shuttle_routes').select('*').eq('is_active', true).order('day_of_week');
      let logQuery = supabase.from('shuttle_notification_logs').select('*').order('created_at', { ascending: false }).limit(100);
      if (activeBranchId) {
        statusQuery = statusQuery.eq('branch_id', activeBranchId);
        spotQuery = spotQuery.eq('branch_id', activeBranchId);
        routeQuery = routeQuery.eq('branch_id', activeBranchId);
        logQuery = logQuery.eq('branch_id', activeBranchId);
      }
      const [statusResult, spotResult, routeResult, logResult] = await Promise.all([
        statusQuery, spotQuery, routeQuery, logQuery,
      ]);
      if (statusResult.error) throw statusResult.error;
      if (spotResult.error) throw spotResult.error;
      if (routeResult.error) throw routeResult.error;

      const nextStatuses = statusResult.data || [];
      const driverIds = [...new Set(nextStatuses.map((item: any) => item.driver_id).filter(Boolean))];
      const routeIds = (routeResult.data || []).map((item: any) => item.id);
      const [driverResult, assignmentResult] = await Promise.all([
        driverIds.length
          ? supabase.from('users').select('id,name').in('id', driverIds)
          : Promise.resolve({ data: [], error: null }),
        routeIds.length
          ? supabase.from('shuttle_route_assignments').select('route_id').in('route_id', routeIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (driverResult.error) throw driverResult.error;
      if (assignmentResult.error) throw assignmentResult.error;

      setStatuses(nextStatuses);
      setDrivers(Object.fromEntries((driverResult.data || []).map((item: any) => [item.id, item.name || '기사'])));
      setSpots(spotResult.data || []);
      setRoutes(routeResult.data || []);
      setLogs(logResult.error ? [] : (logResult.data || []));
      setAssignmentCounts((assignmentResult.data || []).reduce((acc: Record<string, number>, item: any) => {
        acc[item.route_id] = (acc[item.route_id] || 0) + 1;
        return acc;
      }, {}));
      if (logResult.error) setError(`알림 이력 권한 확인 필요: ${logResult.error.message}`);
    } catch (cause: any) {
      setError(cause?.message || '셔틀 데이터를 불러오지 못했습니다.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const channel = supabase.channel(`web-shuttle:${activeBranchId || 'all'}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'shuttle_status',
        filter: activeBranchId ? `branch_id=eq.${activeBranchId}` : undefined,
      }, (payload: any) => {
        const next = payload.new;
        const previous = payload.old;
        const shuttleId = next?.shuttle_id || previous?.shuttle_id;
        if (!shuttleId) return;
        setStatuses((current) => {
          const remaining = current.filter((item) => item.shuttle_id !== shuttleId);
          return payload.eventType === 'DELETE' ? remaining : [next, ...remaining];
        });
      })
      .subscribe();
    const fallback = window.setInterval(() => void loadData(true), 30_000);
    return () => { window.clearInterval(fallback); void supabase.removeChannel(channel); };
  }, [activeBranchId, loadData]);

  // 앱 강제 종료나 구버전의 남은 상태처럼 장시간 갱신되지 않은 행은 실제
  // 운행 차량으로 집계하지 않습니다. 데이터는 보존하되 관제 화면의 유령
  // 차량 및 운행 대수에서는 제외합니다.
  const activeVehicles = useMemo(() => statuses.filter((item) => (
    item.is_driving
    && Number.isFinite(Date.parse(item.last_update))
    && Date.now() - Date.parse(item.last_update) <= 180_000
  )), [statuses]);
  const filteredRoutes = useMemo(
    () => routeDayFilter === '전체' ? routes : routes.filter((item) => item.day_of_week === routeDayFilter),
    [routeDayFilter, routes],
  );
  // Non-admin profiles are already scoped to their own branch by AdminPage,
  // and the database RLS applies the same branch restriction. `coach` is the
  // legacy equivalent of `teacher`, so keep both roles aligned.
  const canEdit = ['admin', 'director', 'teacher', 'coach'].includes(profile?.role || '');

  const saveSpot = async () => {
    if (!spotForm || !activeBranchId || !spotForm.name.trim()) return;
    const lat = Number(spotForm.lat);
    const lng = Number(spotForm.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      window.alert('올바른 위도와 경도를 입력해 주세요.');
      return;
    }
    setSaving(true);
    const payload = {
      branch_id: activeBranchId,
      name: spotForm.name.trim(), address: spotForm.address.trim() || null,
      lat, lng, default_time: spotForm.default_time || null, is_active: true,
    };
    const result = spotForm.id
      ? await supabase.from('pickup_spots').update(payload).eq('id', spotForm.id)
      : await supabase.from('pickup_spots').insert(payload);
    setSaving(false);
    if (result.error) return window.alert(result.error.message);
    setSpotForm(null);
    await loadData();
  };

  const removeSpot = async (spot: any) => {
    if (!window.confirm(`'${spot.name}' 정류장을 비활성화할까요?`)) return;
    const { error: removeError } = await supabase.from('pickup_spots').update({ is_active: false }).eq('id', spot.id);
    if (removeError) return window.alert(removeError.message);
    await loadData();
  };

  const saveRoute = async () => {
    if (!routeForm || !activeBranchId || !routeForm.name.trim() || !routeForm.service_time) return;
    const centerLat = routeForm.center_lat.trim() ? Number(routeForm.center_lat) : null;
    const centerLng = routeForm.center_lng.trim() ? Number(routeForm.center_lng) : null;
    if ((centerLat != null && !Number.isFinite(centerLat)) || (centerLng != null && !Number.isFinite(centerLng))) {
      window.alert('센터 위도와 경도를 올바르게 입력해 주세요.');
      return;
    }
    setSaving(true);
    const payload = {
      branch_id: activeBranchId,
      name: routeForm.name.trim(),
      day_of_week: routeForm.day_of_week,
      direction: routeForm.direction,
      service_time: routeForm.service_time,
      vehicle_label: routeForm.vehicle_label.trim() || null,
      center_address: routeForm.center_address.trim() || null,
      center_lat: centerLat,
      center_lng: centerLng,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    const result = routeForm.id
      ? await supabase.from('shuttle_routes').update(payload).eq('id', routeForm.id)
      : await supabase.from('shuttle_routes').insert(payload);
    setSaving(false);
    if (result.error) return window.alert(result.error.message);
    setRouteForm(null);
    await loadData();
  };

  const removeRoute = async (route: any) => {
    if (!window.confirm(`'${route.name}' 노선을 비활성화할까요? 기존 학생 배정은 보존됩니다.`)) return;
    const { error: removeError } = await supabase.from('shuttle_routes').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', route.id);
    if (removeError) return window.alert(removeError.message);
    await loadData();
  };

  const sections = [
    { id: 'status' as const, label: '운행 현황', icon: Activity },
    { id: 'control' as const, label: '셔틀 관제', icon: Bus },
    { id: 'spots' as const, label: '정류장 관리', icon: MapPin },
    { id: 'routes' as const, label: '노선 현황', icon: Route },
    { id: 'alerts' as const, label: '거리 알림 이력', icon: BellRing },
  ];

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 rounded-3xl bg-slate-900 p-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-black text-blue-300">SHUTTLE CONTROL</p><h1 className="mt-2 text-2xl font-black">셔틀 통합 관리</h1><p className="mt-2 text-sm text-slate-300">앱의 노선·정류장·운행 위치·거리 알림을 같은 데이터로 관리합니다.</p></div>
      <button onClick={() => void loadData()} className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-black hover:bg-white/20"><RefreshCw size={16}/>새로고침</button>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[['운행 중', `${activeVehicles.length}대`, 'text-emerald-600'], ['등록 정류장', `${spots.length}개`, 'text-blue-600'], ['활성 노선', `${routes.length}개`, 'text-violet-600'], ['최근 알림', `${logs.filter(x => x.status === 'sent').length}건`, 'text-amber-600']].map(([label, value, tone]) =>
        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold text-slate-500">{label}</p><p className={`mt-2 text-2xl font-black ${tone}`}>{value}</p></div>)}
    </div>

    <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">
      {sections.map(item => <button key={item.id} onClick={() => setSection(item.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${section === item.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><item.icon size={16}/>{item.label}</button>)}
    </div>
    {error && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800"><AlertTriangle size={17}/>{error}</div>}
    {loading ? <div className="rounded-2xl bg-white p-16 text-center font-bold text-slate-500">셔틀 데이터를 불러오는 중입니다.</div> : null}

    {!loading && section === 'status' && <div className="grid gap-4 xl:grid-cols-2">
      {activeVehicles.length === 0 ? <Empty text="현재 운행 중인 차량이 없습니다."/> : activeVehicles.map(item => {
        const delay = Math.max(0, Math.floor((Date.now() - Date.parse(item.last_update)) / 1000));
        const tone = statusClasses(delay);
        return <div key={item.shuttle_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between"><div className="flex items-center gap-3"><span className={`rounded-xl p-3 ${tone.icon}`}><Bus size={22}/></span><div><p className="font-black text-slate-900">{drivers[item.driver_id] || '기사 정보 없음'}</p><p className="mt-1 font-mono text-[11px] text-slate-400">{item.driver_id}</p></div></div><span className={`rounded-full px-3 py-1 text-xs font-black ${tone.badge}`}>{delay <= 15 ? '정상 전송' : delay <= 60 ? '갱신 지연' : '위치 정지'}</span></div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><Info label="마지막 갱신" value={`${delay}초 전`}/><Info label="활성 노선" value={item.active_route_id ? routes.find(x => x.id === item.active_route_id)?.name || '노선 확인 중' : '미지정'}/><Info label="위도" value={item.lat ?? '-'}/><Info label="경도" value={item.lng ?? '-'}/></div>
        </div>;
      })}
    </div>}

    {!loading && section === 'control' && <ShuttleControlMap vehicles={activeVehicles} spots={spots} drivers={drivers} routes={routes}/>}

    {!loading && section === 'spots' && <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-black text-slate-900">정류장</h2><p className="mt-1 text-xs text-slate-500">앱의 기사 노선과 동일한 정류장을 사용합니다.</p></div>{canEdit && activeBranchId && <button onClick={() => setSpotForm(emptySpot)} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white"><Plus size={16}/>정류장 추가</button>}</div>
      <div className="divide-y divide-slate-100">{spots.length === 0 ? <Empty text="등록된 정류장이 없습니다."/> : spots.map(spot => <div key={spot.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-900">{spot.name}</p><p className="mt-1 text-sm text-slate-500">{spot.address || '주소 미등록'}</p><p className="mt-1 font-mono text-xs text-slate-400">{spot.lat}, {spot.lng}{spot.default_time ? ` · 기본 ${String(spot.default_time).slice(0,5)}` : ''}</p></div>{canEdit && <div className="flex gap-2"><button onClick={() => setSpotForm({ id: spot.id, name: spot.name || '', address: spot.address || '', lat: String(spot.lat ?? ''), lng: String(spot.lng ?? ''), default_time: spot.default_time ? String(spot.default_time).slice(0,5) : '' })} className="rounded-lg border border-slate-200 p-2 text-slate-600"><Pencil size={16}/></button><button onClick={() => void removeSpot(spot)} className="rounded-lg border border-red-100 p-2 text-red-500"><Trash2 size={16}/></button></div>}</div>)}</div>
    </div>}

    {!loading && section === 'routes' && <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-black text-slate-900">요일별 노선</h2><p className="mt-1 text-xs text-slate-500">선택한 요일의 활성 노선만 확인합니다.</p></div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {(['전체', '월', '화', '수', '목', '금', '토', '일'] as RouteDayFilter[]).map(day => <button key={day} onClick={() => setRouteDayFilter(day)} className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-black transition ${routeDayFilter === day ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{day === '전체' ? day : `${day}요일`}</button>)}
          {canEdit && activeBranchId && <button onClick={() => setRouteForm(emptyRoute)} className="ml-1 flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white"><Plus size={15}/>노선 추가</button>}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">{filteredRoutes.length === 0 ? <Empty text={routeDayFilter === '전체' ? '활성 노선이 없습니다.' : `${routeDayFilter}요일 활성 노선이 없습니다.`}/> : filteredRoutes.map(item => <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex justify-between gap-3"><div><p className="text-xs font-black text-violet-600">{item.day_of_week}요일 · {item.direction === 'pickup' ? '등원' : '하원'}</p><h3 className="mt-2 text-lg font-black text-slate-900">{item.name}</h3><p className="mt-1 text-xs font-bold text-slate-400">{item.vehicle_label || '차량 미지정'}</p></div><div className="flex items-start gap-2"><span className="rounded-xl bg-violet-50 px-3 py-2 text-sm font-black text-violet-700">{assignmentCounts[item.id] || 0}명 배정</span>{canEdit && <><button onClick={() => setRouteForm({ id: item.id, name: item.name || '', day_of_week: item.day_of_week, direction: item.direction, service_time: item.service_time ? String(item.service_time).slice(0,5) : '', vehicle_label: item.vehicle_label || '', center_address: item.center_address || '', center_lat: String(item.center_lat ?? ''), center_lng: String(item.center_lng ?? '') })} className="rounded-lg border border-slate-200 p-2 text-slate-600"><Pencil size={16}/></button><button onClick={() => void removeRoute(item)} className="rounded-lg border border-red-100 p-2 text-red-500"><Trash2 size={16}/></button></>}</div></div><div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Clock3 size={15}/>{item.service_time ? String(item.service_time).slice(0,5) : '수업 시간 기준'} · {item.center_address || '센터 주소 미등록'}</div>{canEdit && <button onClick={() => setAssignmentRoute(item)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-50 px-4 py-3 text-sm font-black text-violet-700 hover:bg-violet-100"><UsersRound size={16}/>학생 배정 관리</button>}</div>)}</div>
    </div>}

    {!loading && section === 'alerts' && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-4">일시</th><th className="p-4">방향</th><th className="p-4">알림</th><th className="p-4">거리</th><th className="p-4">상태</th><th className="p-4">오류</th></tr></thead><tbody className="divide-y divide-slate-100">{logs.map(log => <tr key={log.id}><td className="p-4">{formatTime(log.sent_at || log.created_at)}</td><td className="p-4 font-bold">{log.direction === 'pickup' ? '등원' : '하원'}</td><td className="p-4">{log.event_type === 'departure' ? '목적지 출발' : log.event_type === 'arrival' ? '도착' : '500m 접근'}</td><td className="p-4">{log.distance_meters != null ? `${log.distance_meters}m` : '-'}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${log.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : log.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{log.status}</span></td><td className="max-w-[280px] truncate p-4 text-red-500">{log.error_message || '-'}</td></tr>)}</tbody></table>{logs.length === 0 && <Empty text="조회 가능한 알림 이력이 없습니다."/>}</div></div>}

    {spotForm && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"><div className="my-auto w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-xl font-black">{spotForm.id ? '정류장 수정' : '정류장 추가'}</h2><button onClick={() => setSpotForm(null)} className="rounded-lg p-2 hover:bg-slate-100"><X size={20}/></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="정류장 이름" value={spotForm.name} onChange={name => setSpotForm({ ...spotForm, name })}/><Field label="기본 시각" type="time" value={spotForm.default_time} onChange={default_time => setSpotForm({ ...spotForm, default_time })}/><div className="sm:col-span-2"><Field label="주소" value={spotForm.address} onChange={address => setSpotForm({ ...spotForm, address })}/></div><Field label="위도" value={spotForm.lat} onChange={lat => setSpotForm({ ...spotForm, lat })}/><Field label="경도" value={spotForm.lng} onChange={lng => setSpotForm({ ...spotForm, lng })}/><div className="sm:col-span-2"><SpotLocationPicker lat={spotForm.lat} lng={spotForm.lng} onPick={(lat, lng) => setSpotForm(current => current ? { ...current, lat: lat.toFixed(7), lng: lng.toFixed(7) } : current)}/></div></div><div className="mt-6 flex justify-end gap-2"><button onClick={() => setSpotForm(null)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black">취소</button><button disabled={saving} onClick={() => void saveSpot()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={16}/>{saving ? '저장 중' : '저장'}</button></div></div></div>}
    {routeForm && <RouteEditor form={routeForm} setForm={setRouteForm} saving={saving} onClose={() => setRouteForm(null)} onSave={() => void saveRoute()}/>}
    {assignmentRoute && activeBranchId && <RouteAssignmentEditor route={assignmentRoute} branchId={activeBranchId} spots={spots} onClose={() => setAssignmentRoute(null)} onChanged={() => void loadData(true)}/>}
  </div>;
};

const Empty = ({ text }: { text: string }) => <div className="col-span-full rounded-2xl bg-white p-12 text-center text-sm font-bold text-slate-400">{text}</div>;
const Info = ({ label, value }: { label: string; value: React.ReactNode }) => <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-bold text-slate-400">{label}</p><p className="mt-1 truncate font-black text-slate-700">{value}</p></div>;
const Field = ({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) => <label className="block"><span className="mb-2 block text-xs font-black text-slate-600">{label}</span><input type={type} value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"/></label>;

const RouteEditor = ({ form, setForm, saving, onClose, onSave }: {
  form: RouteForm;
  setForm: (form: RouteForm) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) => <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
  <div className="my-auto w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
    <div className="flex items-center justify-between"><h2 className="text-xl font-black">{form.id ? '노선 수정' : '노선 추가'}</h2><button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100"><X size={20}/></button></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="노선 이름" value={form.name} onChange={name => setForm({ ...form, name })}/></div>
      <SelectField label="요일" value={form.day_of_week} onChange={day_of_week => setForm({ ...form, day_of_week: day_of_week as RouteForm['day_of_week'] })} options={['월', '화', '수', '목', '금', '토', '일'].map(value => ({ value, label: `${value}요일` }))}/>
      <SelectField label="운행 방향" value={form.direction} onChange={direction => setForm({ ...form, direction: direction as RouteForm['direction'] })} options={[{ value: 'pickup', label: '등원' }, { value: 'dropoff', label: '하원' }]}/>
      <Field label="운행 시각" type="time" value={form.service_time} onChange={service_time => setForm({ ...form, service_time })}/>
      <Field label="차량명/호차" value={form.vehicle_label} onChange={vehicle_label => setForm({ ...form, vehicle_label })}/>
      <div className="sm:col-span-2"><Field label="센터 주소" value={form.center_address} onChange={center_address => setForm({ ...form, center_address })}/></div>
      <Field label="센터 위도" value={form.center_lat} onChange={center_lat => setForm({ ...form, center_lat })}/>
      <Field label="센터 경도" value={form.center_lng} onChange={center_lng => setForm({ ...form, center_lng })}/>
    </div>
    <p className="mt-4 text-xs font-bold text-slate-400">노선을 비활성화해도 기존 학생 배정 기록은 삭제되지 않습니다.</p>
    <div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black">취소</button><button disabled={saving || !form.name.trim() || !form.service_time} onClick={onSave} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={16}/>{saving ? '저장 중' : '저장'}</button></div>
  </div>
</div>;

const SelectField = ({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) => <label className="block"><span className="mb-2 block text-xs font-black text-slate-600">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500">{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;

type StudentRouteAssignment = {
  id?: string;
  child_id: string;
  child_name: string;
  parent_name: string;
  class_schedule_id: string;
  direction: 'pickup' | 'dropoff';
  pickup_spot_id: string;
  custom_time: string;
};

const RouteAssignmentEditor = ({ route, branchId, spots, onClose, onChanged }: { route: any; branchId: string; spots: any[]; onClose: () => void; onChanged: () => void }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [children, setChildren] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [eligibleByChild, setEligibleByChild] = useState<Record<string, string[]>>({});
  const [pickupSettings, setPickupSettings] = useState<Record<string, any>>({});
  const [initialIds, setInitialIds] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<StudentRouteAssignment[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      try {
        const [parentResult, scheduleResult, scheduleAssignmentResult, routeAssignmentResult] = await Promise.all([
          supabase.from('users').select('id,name,children(id,child_name,deleted_at)').eq('branch_id', branchId),
          supabase.from('class_schedules').select('id,target_class,day_of_week,start_time,end_time').eq('branch_id', branchId).eq('is_active', true).order('start_time'),
          supabase.from('student_schedule_assignments').select('child_id,schedule_id').eq('branch_id', branchId).eq('is_active', true).lte('starts_on', today).or(`ends_on.is.null,ends_on.gte.${today}`).not('child_id', 'is', null),
          supabase.from('shuttle_route_assignments').select('id,child_id,class_schedule_id,direction,pickup_spot_id,custom_time,display_order').eq('route_id', route.id).order('display_order'),
        ]);
        if (parentResult.error) throw parentResult.error;
        if (scheduleResult.error) throw scheduleResult.error;
        if (scheduleAssignmentResult.error) throw scheduleAssignmentResult.error;
        if (routeAssignmentResult.error) throw routeAssignmentResult.error;
        const nextChildren = (parentResult.data || []).flatMap((parent: any) => (parent.children || []).filter((child: any) => !child.deleted_at).map((child: any) => ({ ...child, parent_name: parent.name || '보호자' })));
        const childIds = nextChildren.map((child: any) => child.id);
        const settingResult = childIds.length
          ? await supabase.from('pickup_settings').select('child_id,pickup_spot_id,dropoff_spot_id').eq('is_active', true).in('child_id', childIds)
          : { data: [], error: null };
        if (settingResult.error) throw settingResult.error;
        if (cancelled) return;
        const childMap = Object.fromEntries(nextChildren.map((child: any) => [child.id, child]));
        setChildren(nextChildren);
        setSchedules(scheduleResult.data || []);
        setEligibleByChild((scheduleAssignmentResult.data || []).reduce((acc: Record<string, string[]>, item: any) => { if (item.child_id) acc[item.child_id] = [...(acc[item.child_id] || []), item.schedule_id]; return acc; }, {}));
        setPickupSettings(Object.fromEntries((settingResult.data || []).map((item: any) => [item.child_id, item])));
        const nextAssignments = (routeAssignmentResult.data || []).map((item: any) => ({
          id: item.id,
          child_id: item.child_id,
          child_name: childMap[item.child_id]?.child_name || '이름 확인 필요',
          parent_name: childMap[item.child_id]?.parent_name || '보호자 확인 필요',
          class_schedule_id: item.class_schedule_id,
          direction: item.direction,
          pickup_spot_id: item.pickup_spot_id || '',
          custom_time: item.custom_time ? String(item.custom_time).slice(0, 5) : '',
        }));
        setAssignments(nextAssignments);
        setInitialIds(nextAssignments.map((item: StudentRouteAssignment) => item.id).filter(Boolean) as string[]);
      } catch (cause: any) {
        if (!cancelled) setError(cause?.message || '학생 배정 정보를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [branchId, route.id]);

  const availableChildren = useMemo(() => {
    const selectedIds = new Set(assignments.map(item => item.child_id));
    const keyword = search.trim().toLowerCase();
    return children.filter(child => !selectedIds.has(child.id) && (!keyword || `${child.child_name} ${child.parent_name}`.toLowerCase().includes(keyword)));
  }, [assignments, children, search]);

  const addChild = (child: any) => {
    const eligibleIds = new Set(eligibleByChild[child.id] || []);
    const eligibleSchedules = schedules.filter(schedule => eligibleIds.has(schedule.id));
    const schedule = eligibleSchedules.find(item => item.day_of_week === route.day_of_week) || eligibleSchedules[0];
    if (!schedule) { window.alert('회원 관리에서 이 학생에게 활성 수업을 먼저 배정해 주세요.'); return; }
    const setting = pickupSettings[child.id] || {};
    const direction = (route.direction === 'dropoff' ? 'dropoff' : 'pickup') as 'pickup' | 'dropoff';
    setAssignments(current => [...current, {
      child_id: child.id,
      child_name: child.child_name,
      parent_name: child.parent_name,
      class_schedule_id: schedule.id,
      direction,
      pickup_spot_id: direction === 'dropoff' ? setting.dropoff_spot_id || setting.pickup_spot_id || '' : setting.pickup_spot_id || '',
      custom_time: '',
    }]);
    setSearch('');
  };

  const updateAssignment = (index: number, patch: Partial<StudentRouteAssignment>) => setAssignments(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const moveAssignment = (index: number, offset: number) => setAssignments(current => {
    const target = index + offset;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const save = async () => {
    if (assignments.some(item => !item.class_schedule_id)) { window.alert('모든 학생의 수업을 선택해 주세요.'); return; }
    setSaving(true);
    setError('');
    try {
      if (assignments.length) {
        const rows = assignments.map((item, index) => ({
          ...(item.id ? { id: item.id } : {}),
          route_id: route.id,
          child_id: item.child_id,
          class_schedule_id: item.class_schedule_id,
          direction: item.direction,
          pickup_spot_id: item.pickup_spot_id || null,
          custom_time: item.custom_time || null,
          display_order: index,
        }));
        const existingRows = rows.filter(row => 'id' in row);
        const newRows = rows.filter(row => !('id' in row));
        if (existingRows.length) {
          const { error: updateError } = await supabase.from('shuttle_route_assignments').upsert(existingRows, { onConflict: 'id' });
          if (updateError) throw updateError;
        }
        if (newRows.length) {
          const { error: insertError } = await supabase.from('shuttle_route_assignments').upsert(newRows, { onConflict: 'child_id,class_schedule_id,direction' });
          if (insertError) throw insertError;
        }
      }
      const retainedIds = new Set(assignments.map(item => item.id).filter(Boolean));
      const removedIds = initialIds.filter(id => !retainedIds.has(id));
      if (removedIds.length) {
        const { error: deleteError } = await supabase.from('shuttle_route_assignments').delete().in('id', removedIds);
        if (deleteError) throw deleteError;
      }
      onChanged();
      onClose();
    } catch (cause: any) {
      setError(cause?.message || '학생 배정을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4"><div className="my-auto w-full max-w-5xl rounded-3xl bg-slate-50 shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 bg-white p-6"><div><p className="text-xs font-black text-violet-600">{route.day_of_week}요일 · {route.direction === 'dropoff' ? '하원' : '등원'}</p><h2 className="mt-1 text-xl font-black text-slate-900">{route.name || '셔틀 노선'} 학생 배정</h2></div><button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100"><X size={22}/></button></div>
    {loading ? <div className="p-16 text-center font-bold text-slate-500">배정 정보를 불러오는 중입니다.</div> : <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1.5fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="font-black text-slate-900">학생 검색</h3><div className="relative mt-3"><Search size={16} className="absolute left-3 top-3.5 text-slate-400"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="학생명 또는 보호자명" className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500"/></div><div className="mt-3 max-h-[460px] space-y-2 overflow-y-auto">{availableChildren.map(child => { const eligible = (eligibleByChild[child.id] || []).length > 0; return <button key={child.id} disabled={!eligible} onClick={() => addChild(child)} className="flex w-full items-center justify-between rounded-xl border border-slate-100 p-3 text-left hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45"><div><p className="text-sm font-black text-slate-800">{child.child_name}</p><p className="mt-1 text-xs font-bold text-slate-400">{child.parent_name}{eligible ? '' : ' · 활성 수업 없음'}</p></div><UserPlus size={17} className="text-blue-600"/></button>; })}{availableChildren.length === 0 && <p className="p-8 text-center text-xs font-bold text-slate-400">추가할 학생이 없습니다.</p>}</div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><h3 className="font-black text-slate-900">배정 학생</h3><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">{assignments.length}명</span></div><div className="mt-3 max-h-[520px] space-y-3 overflow-y-auto">{assignments.map((item, index) => { const eligibleIds = new Set(eligibleByChild[item.child_id] || []); const childSchedules = schedules.filter(schedule => eligibleIds.has(schedule.id)); return <div key={`${item.child_id}-${index}`} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-900">{index + 1}. {item.child_name}</p><p className="mt-1 text-xs font-bold text-slate-400">{item.parent_name}</p></div><div className="flex gap-1"><button onClick={() => moveAssignment(index, -1)} disabled={index === 0} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-30"><ChevronUp size={15}/></button><button onClick={() => moveAssignment(index, 1)} disabled={index === assignments.length - 1} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-30"><ChevronDown size={15}/></button><button onClick={() => setAssignments(current => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg border border-red-100 p-1.5 text-red-500"><Trash2 size={15}/></button></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={item.class_schedule_id} onChange={event => updateAssignment(index, { class_schedule_id: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold">{childSchedules.map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.target_class} · {schedule.day_of_week} {String(schedule.start_time).slice(0,5)}</option>)}</select><select value={item.direction} onChange={event => { const direction = event.target.value as 'pickup' | 'dropoff'; const setting = pickupSettings[item.child_id] || {}; updateAssignment(index, { direction, pickup_spot_id: direction === 'dropoff' ? setting.dropoff_spot_id || setting.pickup_spot_id || item.pickup_spot_id : setting.pickup_spot_id || item.pickup_spot_id }); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold"><option value="pickup">등원</option><option value="dropoff">하원</option></select><select value={item.pickup_spot_id} onChange={event => updateAssignment(index, { pickup_spot_id: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold"><option value="">정류장 미지정</option>{spots.map(spot => <option key={spot.id} value={spot.id}>{spot.name}</option>)}</select><input type="time" value={item.custom_time} onChange={event => updateAssignment(index, { custom_time: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold" title="개별 승하차 시각"/></div></div>; })}{assignments.length === 0 && <p className="p-12 text-center text-sm font-bold text-slate-400">왼쪽에서 학생을 추가해 주세요.</p>}</div></section>
    </div>}
    {error && <div className="mx-5 mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
    <div className="flex justify-end gap-2 border-t border-slate-200 bg-white p-5"><button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black">취소</button><button disabled={loading || saving} onClick={() => void save()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={16}/>{saving ? '저장 중' : '배정 저장'}</button></div>
  </div></div>;
};

const SpotLocationPicker = ({ lat, lng, onPick }: { lat: string; lng: string; onPick: (lat: number, lng: number) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const listenerRef = useRef<any>(null);
  const onPickRef = useRef(onPick);
  const [error, setError] = useState('');
  const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID as string | undefined;
  onPickRef.current = onPick;

  useEffect(() => {
    if (!clientId) { setError('웹 지도 Client ID 설정이 필요합니다.'); return; }
    let cancelled = false;
    const initialize = () => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const naver = (window as any).naver;
      if (!naver?.maps) { setError('네이버 지도 모듈을 불러오지 못했습니다.'); return; }
      const initialLat = Number(lat);
      const initialLng = Number(lng);
      const hasPosition = Number.isFinite(initialLat) && Number.isFinite(initialLng) && initialLat !== 0 && initialLng !== 0;
      const center = new naver.maps.LatLng(hasPosition ? initialLat : 37.5666103, hasPosition ? initialLng : 126.9783882);
      mapRef.current = new naver.maps.Map(containerRef.current, { center, zoom: hasPosition ? 18 : 14 });
      markerRef.current = new naver.maps.Marker({ map: mapRef.current, position: center, visible: hasPosition, draggable: true });
      listenerRef.current = naver.maps.Event.addListener(mapRef.current, 'click', (event: any) => {
        markerRef.current.setVisible(true);
        markerRef.current.setPosition(event.coord);
        onPickRef.current(event.coord.lat(), event.coord.lng());
      });
      naver.maps.Event.addListener(markerRef.current, 'dragend', (event: any) => onPickRef.current(event.coord.lat(), event.coord.lng()));
      setError('');
    };
    if ((window as any).naver?.maps) initialize();
    else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-ipasscare-naver-map]');
      const script = existing || document.createElement('script');
      if (!existing) {
        script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
        script.async = true;
        script.dataset.ipasscareNaverMap = 'true';
        document.head.appendChild(script);
      }
      script.addEventListener('load', initialize, { once: true });
      script.addEventListener('error', () => setError('네이버 지도 스크립트 로드에 실패했습니다.'), { once: true });
    }
    return () => {
      cancelled = true;
      const naver = (window as any).naver;
      if (listenerRef.current && naver?.maps?.Event) naver.maps.Event.removeListener(listenerRef.current);
    };
  }, [clientId]);

  useEffect(() => {
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    const naver = (window as any).naver;
    if (!mapRef.current || !markerRef.current || !naver?.maps || !Number.isFinite(nextLat) || !Number.isFinite(nextLng) || nextLat === 0 || nextLng === 0) return;
    const position = new naver.maps.LatLng(nextLat, nextLng);
    markerRef.current.setVisible(true);
    markerRef.current.setPosition(position);
    mapRef.current.setCenter(position);
  }, [lat, lng]);

  return <div><div className="mb-2 flex items-center justify-between"><span className="text-xs font-black text-slate-600">지도에서 상세 위치 지정</span><span className="text-[11px] font-bold text-blue-600">지도 클릭 또는 마커 이동</span></div><div className="relative h-72 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><div ref={containerRef} className="h-full w-full"/>{error && <div className="absolute inset-0 flex items-center justify-center bg-slate-50 p-5 text-center text-xs font-bold text-slate-500">{error}</div>}</div><p className="mt-2 text-[11px] font-bold text-slate-400">주소 검색 후 실제 승·하차 지점을 지도에서 눌러 정문, 후문 등 세부 좌표를 맞춰 주세요.</p></div>;
};

const ShuttleControlMap = ({ vehicles, spots, drivers, routes }: { vehicles: any[]; spots: any[]; drivers: Record<string, string>; routes: any[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapError, setMapError] = useState('');
  const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID as string | undefined;
  const points = useMemo(() => [
    ...vehicles.filter(item => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng))).map(item => ({ type: 'vehicle', lat: Number(item.lat), lng: Number(item.lng), title: drivers[item.driver_id] || '운행 차량', detail: routes.find(route => route.id === item.active_route_id)?.name || '노선 미지정' })),
    ...spots.filter(item => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng))).map(item => ({ type: 'spot', lat: Number(item.lat), lng: Number(item.lng), title: item.name, detail: item.address || '정류장' })),
  ], [drivers, routes, spots, vehicles]);

  useEffect(() => {
    if (!clientId) { setMapError('VITE_NAVER_MAP_CLIENT_ID 설정 후 지도가 표시됩니다.'); return; }
    let cancelled = false;
    const renderMap = () => {
      if (cancelled || !containerRef.current) return;
      const naver = (window as any).naver;
      if (!naver?.maps) { setMapError('네이버 지도 모듈을 불러오지 못했습니다.'); return; }
      const centerPoint = points[0] || { lat: 37.5666103, lng: 126.9783882 };
      if (!mapRef.current) mapRef.current = new naver.maps.Map(containerRef.current, { center: new naver.maps.LatLng(centerPoint.lat, centerPoint.lng), zoom: points.length ? 15 : 11 });
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = points.map(point => new naver.maps.Marker({
        map: mapRef.current,
        position: new naver.maps.LatLng(point.lat, point.lng),
        title: `${point.title} · ${point.detail}`,
        icon: point.type === 'vehicle' ? {
          content: '<div style="width:42px;height:42px;border-radius:14px;background:#2563eb;color:white;border:3px solid white;box-shadow:0 5px 16px #0f172a55;display:flex;align-items:center;justify-content:center;font-size:20px">●</div>',
          anchor: new naver.maps.Point(21, 21),
        } : {
          content: `<div style="display:flex;width:180px;flex-direction:column;align-items:center;filter:drop-shadow(0 3px 5px #0f172a33)"><div style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:2px solid #2563eb;border-radius:10px;background:white;padding:5px 9px;color:#172033;font-size:12px;font-weight:800;line-height:16px">${escapeMapLabel(point.title)}</div><div style="width:10px;height:10px;margin-top:-1px;transform:rotate(45deg);border-right:2px solid #2563eb;border-bottom:2px solid #2563eb;background:white"></div><div style="width:10px;height:10px;margin-top:2px;border:3px solid white;border-radius:999px;background:#2563eb"></div></div>`,
          anchor: new naver.maps.Point(90, 48),
        },
      }));
      const vehiclePoints = points.filter(point => point.type === 'vehicle');
      if (vehiclePoints.length === 1) {
        mapRef.current.setCenter(new naver.maps.LatLng(vehiclePoints[0].lat, vehiclePoints[0].lng));
        mapRef.current.setZoom(17);
      } else if (vehiclePoints.length > 1) {
        const bounds = new naver.maps.LatLngBounds();
        vehiclePoints.forEach(point => bounds.extend(new naver.maps.LatLng(point.lat, point.lng)));
        mapRef.current.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
      } else if (points.length > 1) {
        const bounds = new naver.maps.LatLngBounds();
        points.forEach(point => bounds.extend(new naver.maps.LatLng(point.lat, point.lng)));
        mapRef.current.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
      } else if (points.length === 1) {
        mapRef.current.setCenter(new naver.maps.LatLng(points[0].lat, points[0].lng));
        mapRef.current.setZoom(17);
      }
      setMapError('');
    };
    if ((window as any).naver?.maps) renderMap();
    else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-ipasscare-naver-map]');
      const script = existing || document.createElement('script');
      if (!existing) {
        script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
        script.async = true;
        script.dataset.ipasscareNaverMap = 'true';
        document.head.appendChild(script);
      }
      script.addEventListener('load', renderMap, { once: true });
      script.addEventListener('error', () => setMapError('네이버 지도 스크립트 로드에 실패했습니다.'), { once: true });
    }
    return () => { cancelled = true; };
  }, [clientId, points]);

  return <div className="space-y-4">
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-slate-900">실시간 셔틀 관제</h2><p className="mt-1 text-xs text-slate-500">파란 표시는 운행 차량, 기본 마커는 정류장입니다.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">운행 {vehicles.length}대</span></div>
      <div className="relative h-[520px] bg-slate-100"><div ref={containerRef} className="h-full w-full"/>{mapError && <div className="absolute inset-0 flex items-center justify-center p-6"><div className="max-w-md rounded-2xl border border-amber-200 bg-white p-5 text-center shadow-lg"><MapPin className="mx-auto text-amber-500"/><p className="mt-3 text-sm font-black text-slate-800">지도 설정이 필요합니다</p><p className="mt-2 text-xs font-bold leading-5 text-slate-500">{mapError}<br/>네이버 Cloud Maps에 웹 서비스 URL도 등록해 주세요.</p></div></div>}</div>
    </div>
    <div className="grid gap-3 lg:grid-cols-3">{vehicles.length === 0 ? <Empty text="현재 관제할 운행 차량이 없습니다."/> : vehicles.map(vehicle => { const delay = Math.max(0, Math.floor((Date.now() - Date.parse(vehicle.last_update)) / 1000)); return <div key={vehicle.shuttle_id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><p className="font-black text-slate-900">{drivers[vehicle.driver_id] || '기사 정보 없음'}</p><span className={`rounded-full px-2.5 py-1 text-xs font-black ${delay <= 15 ? 'bg-emerald-50 text-emerald-700' : delay <= 60 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{delay}초 전</span></div><p className="mt-2 text-sm font-bold text-slate-500">{routes.find(route => route.id === vehicle.active_route_id)?.name || '노선 미지정'}</p><p className="mt-2 font-mono text-xs text-slate-400">{vehicle.lat ?? '-'}, {vehicle.lng ?? '-'}</p></div>; })}</div>
  </div>;
};
