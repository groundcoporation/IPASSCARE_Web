import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { 
  Bell, Plus, Pencil, Trash2, Search, Loader2,
  Send, Pin, Home, Building2, Eye, X, CheckCircle2, RefreshCw
} from 'lucide-react';

interface Notice {
  id: string;
  title: string;
  content: string;
  is_important: boolean;
  is_on_home: boolean;
  author_name: string | null;
  author_badge: string | null;
  author_id: string | null;
  branch_id: string | null;
  created_at: string;
  updated_at: string | null;
}

interface AdminNoticeTabProps {
  activeBranchId: string | null;
  branches: Array<{ id: string; name: string }>;
  profile?: {
    id: string;
    name: string | null;
    role: string;
    branch_id: string | null;
  } | null;
}

export const AdminNoticeTab: React.FC<AdminNoticeTabProps> = ({
  activeBranchId,
  branches,
  profile,
}) => {
  const isAdmin = profile?.role === 'admin';
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isImportant, setIsImportant] = useState(false);
  const [isOnHome, setIsOnHome] = useState(false);
  const [isSendNotification, setIsSendNotification] = useState(false);
  const [targetBranchId, setTargetBranchId] = useState<string | null>(
    isAdmin ? (activeBranchId && activeBranchId !== 'all' ? activeBranchId : null) : (profile?.branch_id || null)
  );

  // Load notices from Supabase
  const loadNotices = async () => {
    setLoading(true);
    try {
      let query = supabase.from('notices').select('*');

      if (isAdmin) {
        if (activeBranchId && activeBranchId !== 'all') {
          query = query.or(`branch_id.eq.${activeBranchId},branch_id.is.null`);
        }
      } else if (profile?.branch_id) {
        query = query.or(`branch_id.eq.${profile.branch_id},branch_id.is.null`);
      }

      const { data, error } = await query
        .order('is_important', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotices(data || []);
    } catch (err: any) {
      console.error('Failed to load notices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotices();
  }, [activeBranchId, profile?.branch_id]);

  const openCreateModal = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
    setIsImportant(false);
    setIsOnHome(false);
    setIsSendNotification(false);
    setTargetBranchId(isAdmin ? (activeBranchId && activeBranchId !== 'all' ? activeBranchId : null) : (profile?.branch_id || null));
    setIsModalOpen(true);
  };

  const openEditModal = (notice: Notice) => {
    setEditingId(notice.id);
    setTitle(notice.title);
    setContent(notice.content);
    setIsImportant(Boolean(notice.is_important));
    setIsOnHome(Boolean(notice.is_on_home));
    setIsSendNotification(false);
    setTargetBranchId(notice.branch_id);
    setIsModalOpen(true);
  };

  const openDetailModal = (notice: Notice) => {
    setSelectedNotice(notice);
    setIsDetailOpen(true);
  };

  const sendPushToAppUsers = async (noticeId: string) => {
    const { data, error } = await supabase.functions.invoke('send-notice-push', {
      body: { noticeId },
    });
    if (error) {
      let detail = error.message || '공지 푸시 발송에 실패했습니다.';
      try {
        const errorBody = await (error as any)?.context?.json?.();
        detail = errorBody?.error || detail;
      } catch {
        // 응답 본문을 읽지 못하면 Supabase 기본 오류 메시지를 사용합니다.
      }
      throw new Error(detail);
    }
    if (!data?.success) throw new Error(data?.error || '공지 푸시 발송에 실패했습니다.');
    return data as { targetCount: number; sentCount: number; failedCount: number };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert('제목과 내용을 모두 입력해 주세요.');
      return;
    }

    setSaveLoading(true);
    let noticeSaved = false;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const realName = profile?.name?.trim()
        || authData?.user?.user_metadata?.name?.trim()
        || authData?.user?.email?.split('@')[0]
        || '관리자';
      const getBadgeName = () => {
        if (profile?.role === 'admin') return '관리자';
        if (profile?.role === 'director') return '원장';
        if (profile?.role === 'teacher' || profile?.role === 'coach') return '선생님';
        return '직원';
      };

      const payload = {
        title: title.trim(),
        content: content.trim(),
        is_important: isImportant,
        is_on_home: isOnHome,
        author_name: realName,
        author_badge: getBadgeName(),
        author_id: authData?.user?.id || null,
        branch_id: targetBranchId,
        updated_at: new Date().toISOString(),
      };

      let savedId = editingId;

      if (editingId) {
        const { error } = await supabase
          .from('notices')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('notices')
          .insert([payload])
          .select('id')
          .single();
        if (error) throw error;
        savedId = data.id;
      }
      noticeSaved = true;

      let pushResult: { targetCount: number; sentCount: number; failedCount: number } | null = null;
      if (!editingId && isSendNotification && savedId) {
        pushResult = await sendPushToAppUsers(savedId);
      }

      if (editingId) {
        alert('공지사항이 수정되었습니다.');
      } else if (pushResult) {
        alert(`공지사항이 등록되었습니다.\n푸시 요청 성공 ${pushResult.sentCount}명 / 실패 ${pushResult.failedCount}명`);
      } else {
        alert('공지사항이 등록되어 학부모 앱 공지 목록에 반영되었습니다.');
      }
      setIsModalOpen(false);
      loadNotices();
    } catch (err: any) {
      alert(noticeSaved
        ? `공지는 저장되었지만 푸시 발송에 실패했습니다: ${err.message || '알 수 없는 오류'}`
        : `공지 저장 실패: ${err.message || '알 수 없는 오류'}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async (id: string, noticeTitle: string) => {
    if (!confirm(`'${noticeTitle}' 공지사항을 삭제하시겠습니까?\n학부모 어플에서도 즉시 삭제됩니다.`)) return;

    try {
      const { error } = await supabase.from('notices').delete().eq('id', id);
      if (error) throw error;
      alert('공지사항이 삭제되었습니다.');
      loadNotices();
    } catch (err: any) {
      alert(`삭제 실패: ${err.message || '알 수 없는 오류'}`);
    }
  };

  const filteredNotices = notices.filter(n => 
    n.title.toLowerCase().includes(search.toLowerCase()) || 
    n.content.toLowerCase().includes(search.toLowerCase()) ||
    (n.author_name && n.author_name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Bell size={12} />
              학부모 어플 실시간 연동
            </span>
            <span className="text-xs font-bold text-slate-400">
              총 {filteredNotices.length}건
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900 mt-1">학부모 공지사항 관리</h2>
          <p className="text-xs text-slate-400 font-medium">
            PC에서 편하게 작성하시면 학부모 스마트폰 어플의 [공지사항] 탭 및 홈 화면에 실시간으로 등록됩니다.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadNotices}
            disabled={loading}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition shadow-xs active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            새로고침
          </button>
          
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-2xl text-xs font-black transition shadow-md hover:shadow-lg active:scale-95"
          >
            <Plus size={15} />
            새 공지 작성
          </button>
        </div>
      </div>

      {/* Search Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="공지 제목, 본문 내용, 작성자 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="text-xs font-bold text-slate-500">
          📌 <span className="text-blue-600 font-black">중요 공지</span>는 학부모 앱 최상단에 고정 노출됩니다.
        </div>
      </div>

      {/* Notices Table / List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin text-blue-600" size={28} />
            <span className="text-xs font-bold">공지사항을 불러오는 중입니다...</span>
          </div>
        ) : filteredNotices.length === 0 ? (
          <div className="py-20 text-center text-slate-400 space-y-3">
            <Bell size={36} className="mx-auto text-slate-300 stroke-1" />
            <p className="text-sm font-black text-slate-600">등록된 학부모 공지사항이 없습니다.</p>
            <p className="text-xs font-medium text-slate-400">새 공지 작성을 눌러 학부모님들께 알림을 보내보세요.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3.5 w-16 text-center">번호</th>
                  <th className="px-6 py-3.5">공지 제목 및 내용</th>
                  <th className="px-6 py-3.5 w-32">대상 지점</th>
                  <th className="px-6 py-3.5 w-28">작성자</th>
                  <th className="px-6 py-3.5 w-32">등록일시</th>
                  <th className="px-6 py-3.5 w-32 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredNotices.map((notice, idx) => {
                  const branchName = notice.branch_id 
                    ? branches.find(b => b.id === notice.branch_id)?.name || '지정 지점'
                    : '전체 지점 공통';

                  const dateFormatted = notice.created_at ? notice.created_at.slice(0, 10) : '-';

                  return (
                    <tr key={notice.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-6 py-4 text-center font-mono font-bold text-slate-400">
                        {idx + 1}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {notice.is_important && (
                            <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5 shrink-0">
                              <Pin size={10} /> 중요 공지
                            </span>
                          )}
                          {notice.is_on_home && (
                            <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5 shrink-0">
                              <Home size={10} /> 홈 노출
                            </span>
                          )}
                          <span 
                            onClick={() => openDetailModal(notice)}
                            className="font-black text-slate-900 hover:text-blue-600 cursor-pointer transition text-sm truncate max-w-lg block"
                          >
                            {notice.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate max-w-xl mt-1">
                          {notice.content}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-lg border ${
                          notice.branch_id 
                            ? 'bg-blue-50 text-blue-700 border-blue-100' 
                            : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        }`}>
                          <Building2 size={11} />
                          {branchName}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 font-bold text-slate-700">
                          <span>{notice.author_name || '관리자'}</span>
                          {Boolean(notice.author_badge) && (
                            <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-extrabold">
                              {notice.author_badge}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 font-mono text-slate-400 text-[11px]">
                        {dateFormatted}
                      </td>

                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openDetailModal(notice)}
                            className="p-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-lg text-slate-500 transition"
                            title="상세보기"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => openEditModal(notice)}
                            className="p-1.5 bg-slate-100 hover:bg-amber-50 hover:text-amber-600 rounded-lg text-slate-500 transition"
                            title="수정"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(notice.id, notice.title)}
                            className="p-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-slate-500 transition"
                            title="삭제"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notice Detail View Modal */}
      {isDetailOpen && selectedNotice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2">
                <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[10.5px] font-black px-2.5 py-0.5 rounded-full">
                  공지사항 미리보기
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {selectedNotice.created_at?.slice(0, 10)}
                </span>
              </div>
              <button 
                onClick={() => setIsDetailOpen(false)}
                className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {selectedNotice.is_important && (
                    <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                      📌 중요 공지
                    </span>
                  )}
                  {selectedNotice.is_on_home && (
                    <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                      🏠 홈 화면 노출
                    </span>
                  )}
                  <span className="text-xs font-bold text-slate-400">
                    작성자: {selectedNotice.author_name || '관리자'}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900">{selectedNotice.title}</h3>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 text-xs font-medium text-slate-700 whitespace-pre-wrap leading-relaxed">
                {selectedNotice.content}
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/40">
              <button
                onClick={() => {
                  setIsDetailOpen(false);
                  openEditModal(selectedNotice);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 transition"
              >
                수정하기
              </button>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-300 transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notice Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {editingId ? '학부모 공지사항 수정' : '새 학부모 공지사항 작성'}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  작성된 내용은 학부모님들의 스마트폰 어플에 즉시 반영됩니다.
                </p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              
              {/* Target Branch Selector */}
              {isAdmin ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-700">발송 대상 지점 선택</label>
                  <select
                    value={targetBranchId || 'all'}
                    onChange={(e) => setTargetBranchId(e.target.value === 'all' ? null : e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">🌐 전체 지점 공통 (모든 학부모)</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.id === 'unassigned' ? '⚠️ 미정 (소속 없는 회원만)' : `🏢 ${b.name}`}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-2xl text-xs font-bold text-blue-700 flex items-center gap-2">
                  <Building2 size={15} />
                  <span>우리 학원 지점 전용 공지로 등록됩니다.</span>
                </div>
              )}

              {/* Push Notification Trigger (Create mode only) */}
              {!editingId && (
                <label className={`p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                  isSendNotification ? 'bg-indigo-50 border-indigo-300 text-indigo-900' : 'bg-white border-indigo-200 text-slate-700'
                }`}>
                  <div className="space-y-0.5 pr-3">
                    <b className="text-xs font-black flex items-center gap-1.5 text-indigo-700">
                      <Send size={13} /> 앱 Push 알림 함께 발송
                    </b>
                    <span className="text-[10.5px] text-slate-500 block">
                      체크하면 공지 등록과 동시에 대상 학부모 스마트폰으로 알림을 보냅니다.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isSendNotification}
                    onChange={(e) => setIsSendNotification(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-5 h-5 shrink-0"
                  />
                </label>
              )}

              {/* Title Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700">공지 제목 *</label>
                <input
                  type="text"
                  placeholder="예: [안내] 2026년 9월 가을학기 신규 수강 시간표 안내"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Content Textarea */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700">공지 상세 본문 내용 *</label>
                <textarea
                  rows={8}
                  placeholder="학부모님들께 전달할 공지사항 내용을 자세히 작성해 주세요."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 leading-relaxed"
                  required
                />
              </div>

              {/* Option Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <label className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                  isImportant ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <div className="space-y-0.5">
                    <b className="text-xs font-black flex items-center gap-1">
                      <Pin size={12} /> 중요 공지로 등록
                    </b>
                    <span className="text-[10.5px] text-slate-400 block">목록 상단에 중요 뱃지와 함께 노출됩니다.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isImportant}
                    onChange={(e) => setIsImportant(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                  />
                </label>

                <label className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                  isOnHome ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <div className="space-y-0.5">
                    <b className="text-xs font-black flex items-center gap-1">
                      <Home size={12} /> 홈 화면 노출
                    </b>
                    <span className="text-[10.5px] text-slate-400 block">체크 시 앱 메인 홈 화면에도 노출됩니다.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isOnHome}
                    onChange={(e) => setIsOnHome(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                  />
                </label>
              </div>

              <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  취소
                </button>

                <button
                  type="submit"
                  disabled={saveLoading}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition shadow-md disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saveLoading ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                  {editingId ? '수정 완료' : '공지 등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
