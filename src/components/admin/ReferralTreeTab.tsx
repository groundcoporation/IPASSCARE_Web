import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Search, ChevronDown, ChevronRight, User, Award, Calendar, Phone, Mail, Award as PointIcon, Shield, RefreshCw } from 'lucide-react';

interface UserRecord {
  id: string;
  username: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: string | null;
  target_class: string | null;
  points: number | null;
  referred_by: string | null;
  referral_count: number | null;
  level: number | null;
  lineage: string[] | null;
  created_at: string;
}

interface PointLog {
  id: string;
  amount: number;
  reason: string;
  type: string;
  created_at: string;
}

interface ReferralTreeTabProps {
  profile?: {
    id: string;
    name: string | null;
    role: string;
    branch_id: string | null;
  } | null;
}

export const ReferralTreeTab: React.FC<ReferralTreeTabProps> = ({ profile }) => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pointLogs, setPointLogs] = useState<PointLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [adminViewScope, setAdminViewScope] = useState<'all' | 'my'>('all');

  const isAdmin = profile?.role === 'admin';

  // Fetch all users to construct in-memory tree
  const loadAllUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, email, name, phone, role, target_class, points, referred_by, referral_count, level, lineage, created_at')
        .neq('status', 'deleted');
      
      if (!error && data) {
        setUsers(data as UserRecord[]);
        if (profile?.id) {
          setSelectedUserId(profile.id);
          setExpandedNodes(prev => ({ ...prev, [profile.id]: true }));
        }
      }
    } catch (err) {
      console.error('Failed to load users for tree:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllUsers();
  }, [profile?.id]);

  // Fetch point logs for selected user
  useEffect(() => {
    if (!selectedUserId) {
      setPointLogs([]);
      return;
    }

    const loadPointLogs = async () => {
      setLogsLoading(true);
      try {
        const { data, error } = await supabase
          .from('point_logs')
          .select('id, amount, reason, type, created_at')
          .eq('user_id', selectedUserId)
          .order('created_at', { ascending: false });
        
        if (!error && data) {
          setPointLogs(data as PointLog[]);
        }
      } catch (err) {
        console.error('Failed to load point logs:', err);
      } finally {
        setLogsLoading(false);
      }
    };

    loadPointLogs();
  }, [selectedUserId]);

  // Index users by ID and Username for fast lookups
  const usersById = useMemo(() => {
    const map = new Map<string, UserRecord>();
    users.forEach(u => map.set(u.id, u));
    return map;
  }, [users]);

  const usersByUsername = useMemo(() => {
    const map = new Map<string, UserRecord>();
    users.forEach(u => {
      if (u.username) map.set(u.username, u);
    });
    return map;
  }, [users]);

  // Helper to determine parent ID of a user
  const getParentId = (u: UserRecord): string | null => {
    if (u.lineage && u.lineage.length > 0) {
      return u.lineage[u.lineage.length - 1];
    }
    if (u.referred_by) {
      const parentUser = usersByUsername.get(u.referred_by);
      if (parentUser) return parentUser.id;
    }
    return null;
  };

  // Build Adjacency List: Map parent ID to children records
  const childrenMap = useMemo(() => {
    const map = new Map<string, UserRecord[]>();
    users.forEach(u => {
      const parentId = getParentId(u);
      if (parentId) {
        const list = map.get(parentId) || [];
        list.push(u);
        map.set(parentId, list);
      }
    });
    return map;
  }, [users, usersByUsername]);

  // Find My User record
  const myUserRecord = useMemo(() => {
    return profile?.id ? usersById.get(profile.id) || null : null;
  }, [profile?.id, usersById]);

  // Calculate my downline user IDs (BFS)
  const myDownlineIds = useMemo(() => {
    if (!profile?.id) return new Set<string>();
    const set = new Set<string>();
    set.add(profile.id);
    const queue = [profile.id];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      const kids = childrenMap.get(curr) || [];
      for (const kid of kids) {
        if (!set.has(kid.id)) {
          set.add(kid.id);
          queue.push(kid.id);
        }
      }
    }
    return set;
  }, [profile?.id, childrenMap]);

  // Determine root users based on user role & view scope
  const rootUsers = useMemo(() => {
    if (isAdmin && adminViewScope === 'all') {
      return users.filter(u => {
        const parentId = getParentId(u);
        return parentId === null || !usersById.has(parentId);
      });
    }

    // For teachers / staff / my scope: only return my account as the root!
    if (myUserRecord) {
      return [myUserRecord];
    }

    // If teacher profile is not yet in users list, create a virtual root
    if (profile?.id) {
      return [{
        id: profile.id,
        username: profile.name || 'me',
        name: profile.name || '내 계정',
        email: null,
        phone: null,
        role: profile.role,
        target_class: null,
        points: 0,
        referred_by: null,
        referral_count: 0,
        level: 1,
        lineage: null,
        created_at: new Date().toISOString()
      }];
    }

    return [];
  }, [isAdmin, adminViewScope, users, usersById, myUserRecord, profile]);

  // Get selected user record
  const selectedUser = useMemo(() => {
    return selectedUserId ? usersById.get(selectedUserId) : null;
  }, [selectedUserId, usersById]);

  // Handle Search Filtering (scoped to accessible users)
  const searchedRoots = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase().trim();
    const candidateUsers = (isAdmin && adminViewScope === 'all')
      ? users
      : users.filter(u => myDownlineIds.has(u.id));

    return candidateUsers.filter(u => 
      (u.name && u.name.toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query)) ||
      (u.username && u.username.toLowerCase().includes(query)) ||
      (u.phone && u.phone.includes(query))
    );
  }, [users, searchQuery, isAdmin, adminViewScope, myDownlineIds]);

  const toggleNode = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Recursive Tree Node Renderer (Folder-style Tree)
  const renderTreeNode = (u: UserRecord, depth: number = 0) => {
    const children = childrenMap.get(u.id) || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes[u.id] || false;
    const isSelected = selectedUserId === u.id;

    return (
      <div key={u.id} className="flex flex-col">
        {/* Node Item */}
        <div 
          onClick={() => setSelectedUserId(u.id)}
          className={`group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl cursor-pointer transition-all select-none border ${
            isSelected 
              ? 'bg-blue-600 border-blue-700 text-white shadow-md' 
              : 'bg-white hover:bg-slate-50 border-slate-100 hover:border-slate-200 text-slate-800 shadow-2xs'
          }`}
          style={{ marginLeft: `${depth * 24}px` }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Toggle Expand Icon */}
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              {hasChildren ? (
                <button 
                  onClick={(e) => toggleNode(u.id, e)}
                  className={`p-0.5 rounded-md transition-colors ${
                    isSelected ? 'hover:bg-blue-700 text-white/80' : 'hover:bg-slate-200 text-slate-400'
                  }`}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/40' : 'bg-slate-300'} mx-auto`} />
              )}
            </div>

            {/* Avatar / Role Icon */}
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold ${
              isSelected 
                ? 'bg-white/20 text-white' 
                : u.role === 'admin' ? 'bg-rose-100 text-rose-700' : u.role === 'coach' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
            }`}>
              {u.role === 'admin' ? <Shield size={16} /> : <User size={16} />}
            </div>

            {/* User Name & Details */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm truncate">{u.name || '이름 없음'}</span>
                {u.username && (
                  <span className={`text-[10px] truncate ${isSelected ? 'text-white/70' : 'text-slate-400 font-mono'}`}>
                    @{u.username}
                  </span>
                )}
              </div>
              <p className={`text-[10.5px] mt-0.5 ${isSelected ? 'text-white/80' : 'text-slate-400 font-medium'}`}>
                보유: <b className={isSelected ? 'text-white' : 'text-slate-800'}>{(u.points ?? 0).toLocaleString()} P</b>
                {children.length > 0 ? ` · 추천 회원: ${children.length}명` : u.referral_count ? ` · 추천 회원: ${u.referral_count}명` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Render Children Recursively */}
        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1 relative">
            {/* Guide line for nested indentation */}
            <div 
              className="absolute left-0 top-0 bottom-3 w-[1px] bg-slate-200"
              style={{ marginLeft: `${(depth * 24) + 9}px` }}
            />
            {children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      
      {/* Left: Tree Viewer */}
      <div className="lg:col-span-8 bg-white p-6 rounded-3xl ring-1 ring-slate-200 space-y-4">
        
        {/* Tab Header & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                🌳 {isAdmin && adminViewScope === 'all' ? '전체 추천인 네트워크 트리' : `${profile?.name || '내'} 추천 회원 현황`}
              </h2>
              {!isAdmin && (
                <span className="text-[11px] font-black text-blue-600 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-full">
                  내 추천 회원 전용
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isAdmin && adminViewScope === 'all'
                ? '회원별 추천 초대 연결 구조와 적립된 리워드 포인트를 트리 형태로 탐색합니다.'
                : `${profile?.name || '내 계정'}으로부터 연결된 추천 회원 및 적립 리워드 포인트를 확인합니다.`}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {isAdmin && (
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setAdminViewScope('all')}
                  className={`px-3 py-1.5 rounded-lg transition ${adminViewScope === 'all' ? 'bg-white text-blue-600 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  🌐 전체 네트워크
                </button>
                <button
                  type="button"
                  onClick={() => setAdminViewScope('my')}
                  className={`px-3 py-1.5 rounded-lg transition ${adminViewScope === 'my' ? 'bg-white text-blue-600 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  👤 내 추천만
                </button>
              </div>
            )}
            <button 
              onClick={loadAllUsers} 
              disabled={loading}
              className="flex items-center justify-center gap-1.5 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              새로고침
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="회원 이름, 이메일, 아이디(username) 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl bg-slate-100 py-3.5 pl-11 pr-4 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Main Tree List */}
        {loading ? (
          <div className="py-24 text-center text-sm font-bold text-slate-400 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="animate-spin text-blue-500" size={24} />
            <span>전체 회원 계보 구조 로드 중...</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {searchedRoots ? (
              // Search Mode: Display subtree focused on matched users
              searchedRoots.length > 0 ? (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 font-bold">
                    🔍 '{searchQuery}' 검색 결과로 총 {searchedRoots.length}개의 추천 트리를 발견했습니다. 
                    각 노드를 클릭하면 하위 계보가 계속 펼쳐집니다.
                  </div>
                  {searchedRoots.map(root => renderTreeNode(root, 0))}
                </div>
              ) : (
                <div className="text-center py-20 text-slate-400 font-bold text-sm">
                  검색 조건에 일치하는 회원이 없습니다.
                </div>
              )
            ) : (
              // Default Mode: Display root level nodes (users with no parents)
              rootUsers.length > 0 ? (
                rootUsers.map(root => renderTreeNode(root, 0))
              ) : (
                <div className="text-center py-20 text-slate-400 font-bold text-sm">
                  가입된 회원이 없습니다.
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Right: Selected Node Details & Point History */}
      <div className="lg:col-span-4 bg-white p-6 rounded-3xl ring-1 ring-slate-200 space-y-6 sticky top-[92px]">
        {selectedUser ? (
          <div className="space-y-6">
            
            {/* Header User Brief */}
            <div className="border-b border-slate-100 pb-4">
              <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                {selectedUser.role === 'admin' ? 'SYSTEM ADMIN' : selectedUser.role === 'coach' ? 'BRANCH COACH' : 'NORMAL USER'}
              </span>
              <h3 className="text-xl font-black text-slate-900 mt-2">{selectedUser.name || '이름 없음'}</h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">@{selectedUser.username || 'username_없음'}</p>
            </div>

            {/* Meta Info Grid */}
            <div className="grid grid-cols-1 gap-3.5 text-xs text-slate-600">
              <div className="flex items-center gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <PointIcon className="text-blue-500 shrink-0" size={16} />
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold">보유 포인트</p>
                  <b className="text-slate-800 text-sm font-extrabold">{(selectedUser.points ?? 0).toLocaleString()} P</b>
                </div>
              </div>
              <div className="flex items-center gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <Award className="text-emerald-500 shrink-0" size={16} />
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold">직접 추천인 수 (1대)</p>
                  <b className="text-slate-800 text-sm font-extrabold">{selectedUser.referral_count ?? 0}명</b>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="text-slate-400 shrink-0" size={15} />
                <span className="truncate"><b>이메일:</b> {selectedUser.email || '-'}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="text-slate-400 shrink-0" size={15} />
                <span><b>연락처:</b> {selectedUser.phone || '-'}</span>
              </div>
              {selectedUser.target_class && (
                <div className="flex items-center gap-2.5">
                  <Shield className="text-slate-400 shrink-0" size={15} />
                  <span><b>소속 반:</b> {selectedUser.target_class}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <Calendar className="text-slate-400 shrink-0" size={15} />
                <span><b>가입 일자:</b> {new Date(selectedUser.created_at).toLocaleDateString('ko-KR')}</span>
              </div>
            </div>

            {/* Point Earning History logs */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                포인트 적립/사용 내역
              </h4>

              {logsLoading ? (
                <div className="text-center py-8 text-xs font-bold text-slate-400">
                  포인트 거래 내역 로드 중...
                </div>
              ) : pointLogs.length > 0 ? (
                <div className="space-y-2 max-h-[25vh] overflow-y-auto pr-1">
                  {pointLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                        log.amount >= 0 ? 'bg-emerald-50/50 border-emerald-100' : 'bg-rose-50/50 border-rose-100'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-slate-800 leading-relaxed break-all">
                          {log.reason}
                        </p>
                        <span className="text-[9px] text-slate-400 block mt-1 font-semibold">
                          {new Date(log.created_at).toLocaleString('ko-KR')}
                        </span>
                      </div>
                      <b className={`text-xs font-black shrink-0 ${
                        log.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        {log.amount >= 0 ? `+${log.amount.toLocaleString()}` : log.amount.toLocaleString()} P
                      </b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-xs font-bold text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                  포인트 적립 또는 사용 기록이 없습니다.
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="text-center py-32 text-slate-400 space-y-3">
            <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
              <User size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-700">회원 상세 정보</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                계보 트리에서 회원 이름을 클릭하시면<br />포인트 적립 이력 및 상세 정보를 볼 수 있습니다.
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
