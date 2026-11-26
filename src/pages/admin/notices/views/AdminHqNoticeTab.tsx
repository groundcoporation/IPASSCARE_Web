import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppError } from '../../../../errors/appError';
import { handleError } from '../../../../errors/handleError';
import { saveNoticeRecord, deleteNoticeRecord } from '../api/noticeWrites';
import { validateNoticeWrite } from '../model/noticeWrite';
import { loadHeadquarterNotices, type HqNotice } from '../api/noticeReads';
import { supabase } from '../../../../lib/supabaseClient';
import { 
  Megaphone, Plus, Pencil, Trash2, Search, Loader2, 
  Pin, X, CheckCircle2, ChevronRight, RefreshCw, Calendar
} from 'lucide-react';


interface AdminHqNoticeTabProps {
  profile?: {
    id: string;
    name: string | null;
    role: string;
    branch_id: string | null;
  } | null;
}

export const AdminHqNoticeTab: React.FC<AdminHqNoticeTabProps> = ({ profile }) => {
  const isAdmin = profile?.role === 'admin';
  const [notices, setNotices] = useState<HqNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modals & Detail State
  const [selectedNotice, setSelectedNotice] = useState<HqNotice | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isImportant, setIsImportant] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const noticeWriteInFlight = useRef(false);
  const noticeReviewRequired = useRef(false);
  const noticeReadReady = useRef(false);
  const noticeFormEpoch = useRef(0);
  const noticeMounted = useRef(false);
  const latestNoticeLoad = useRef<(() => Promise<void>) | null>(null);

  const noticeReadRequest = useRef(0);
  const noticeActiveView = useRef({ profile });
  noticeActiveView.current = { profile };

  const loadHqNotices = useCallback(async (reportError = true, afterWrite = false) => {
    if (!noticeMounted.current || (noticeWriteInFlight.current && !afterWrite)) return;
    if (profile !== noticeActiveView.current.profile) return;
    const request = ++noticeReadRequest.current;
    const isCurrent = () => request === noticeReadRequest.current && profile === noticeActiveView.current.profile;
    setLoading(true);
    noticeReadReady.current = false;
    try {
      if (!profile?.id) throw new AppError('AUTH_REQUIRED');
      if (!['admin', 'director', 'teacher', 'coach'].includes(profile.role)) throw new AppError('PERMISSION_DENIED');
      const rows = await loadHeadquarterNotices({ client: supabase });
      if (!isCurrent()) return;
      setNotices(rows);
      noticeReadReady.current = true; noticeReviewRequired.current = false;
      setSelectedNotice(previous => rows.find(row => row.id === previous?.id) ?? rows[0] ?? null);
    } catch (error: unknown) {
      if (!isCurrent()) return;
      setNotices([]); setSelectedNotice(null);
      if (!reportError) throw new AppError('NOTICE_REFRESH_FAILED', error);
      await handleError(error, 'NOTICE_LOAD_FAILED', { operation: 'notice.hq.load' });
    } finally { if (isCurrent()) setLoading(false); }
  }, [profile]);
  latestNoticeLoad.current = loadHqNotices;

  useEffect(() => {
    noticeMounted.current = true;
    void loadHqNotices();
    return () => {
      noticeMounted.current = false; noticeFormEpoch.current += 1; noticeReadReady.current = false;
      noticeReadRequest.current += 1;
      setSelectedNotice(null); setIsModalOpen(false);
    };
  }, [loadHqNotices]);

  const openCreateModal = () => {
    if (noticeWriteInFlight.current || noticeReviewRequired.current || !noticeReadReady.current || loading) return;
    noticeFormEpoch.current += 1;
    setEditingId(null);
    setTitle('');
    setContent('');
    setIsImportant(true);
    setIsModalOpen(true);
  };

  const openEditModal = (notice: HqNotice) => {
    if (noticeWriteInFlight.current || noticeReviewRequired.current || !noticeReadReady.current || loading) return;
    noticeFormEpoch.current += 1;
    setEditingId(notice.id);
    setTitle(notice.title);
    setContent(notice.content);
    setIsImportant(Boolean(notice.is_important));
    setIsModalOpen(true);
  };

  const closeNoticeEditor = () => {
    if (noticeWriteInFlight.current) return;
    noticeFormEpoch.current += 1; setIsModalOpen(false);
  };
  const executeNoticeWrite = async (mode: 'save' | 'delete', id: string | null) => {
    if (noticeWriteInFlight.current || noticeReviewRequired.current || !noticeReadReady.current || loading) return;
    const epoch = noticeFormEpoch.current;
    const isCurrent = () => noticeMounted.current && profile === noticeActiveView.current.profile && epoch === noticeFormEpoch.current;
    if (!isCurrent()) return;
    let acquired = false;
    try {
      const existing = id ? notices.find(row => row.id === id) : null;
      if ((id && !existing) || (mode === 'delete' && !existing)) throw new AppError('NOTICE_INPUT_INVALID');
      const target = existing ? { id: existing.id, branchId: null } : null;
      const form = { title, content, important: isImportant, onHome: false, branchId: null, sendPush: false };
      validateNoticeWrite('hq', profile, mode === 'save' ? form : null, target);
      if (mode === 'delete' && !confirm('이 공지사항을 삭제하시겠습니까? 삭제 요청은 공지와 관련 화면에 영향을 줄 수 있습니다.')) return;
      noticeWriteInFlight.current = true; acquired = true;
      noticeReadRequest.current += 1; setSaveLoading(true);
      if (mode === 'save') {
        const result = await saveNoticeRecord('hq', form, target, profile!, { client: supabase });
        if (!isCurrent()) return;
        setIsModalOpen(false);
        alert(result.pushResult ? `공지 저장 응답 확인 · 푸시 요청 성공 ${result.pushResult.sentCount}건 / 실패 ${result.pushResult.failedCount}건 (기기 수신 보장 아님)` : '공지 저장 응답을 확인했습니다.');
        if (result.pushIssue) await handleError(result.pushIssue, 'NOTICE_PUSH_PARTIAL', { operation: 'notice.push.partial', transactionId: result.id });
      } else {
        await deleteNoticeRecord('hq', target!, profile!, { client: supabase });
        if (!isCurrent()) return;
        setIsModalOpen(false);
        if (selectedNotice?.id === id) { setSelectedNotice(null); }
        alert('공지 삭제 응답을 확인했습니다.');
      }
      await loadHqNotices(false, true);
    } catch (error: unknown) {
      if (!isCurrent()) return;
      if (acquired) { noticeReviewRequired.current = true; noticeReadReady.current = false; }
      await handleError(error, 'NOTICE_WRITE_UNCONFIRMED', { operation: 'notice.hq.' + mode });
    } finally {
      if (acquired) {
        noticeWriteInFlight.current = false; setSaveLoading(false);
        if (!isCurrent() && noticeMounted.current) await latestNoticeLoad.current?.();
      }
    }
  };
  const handleSave = async (event: React.FormEvent) => { event.preventDefault(); await executeNoticeWrite('save', editingId); };
  const handleDelete = async (id: string) => { await executeNoticeWrite('delete', id); };

  const filteredNotices = notices.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-600 text-white text-[11px] font-black px-2.5 py-0.5 rounded-lg flex items-center gap-1">
              <Megaphone size={12} />
              본사 공지사항
            </span>
            <span className="text-xs font-bold text-slate-400">
              총 {filteredNotices.length}건
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900 mt-1">아이패스케어 본사 공지 및 시스템 소식</h2>
          <p className="text-xs text-slate-400 font-medium">
            아이패스케어 본사에서 가맹 학원 원장님들께 전달하는 주요 운영 공지 및 시스템 업데이트 소식입니다.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => void loadHqNotices()}
            disabled={loading || saveLoading}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition shadow-xs active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            새로고침
          </button>

          {isAdmin && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-2xl text-xs font-black transition shadow-md hover:shadow-lg active:scale-95"
            >
              <Plus size={15} />
              새 본사 공지 작성
            </button>
          )}
        </div>
      </div>

      {/* 2. Main 2-Column Layout (List on Left, Reader on Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Notice List */}
        <div className="lg:col-span-5 space-y-3">
          
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="본사 공지 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-medium text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* List Box */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden max-h-[620px] overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="animate-spin text-blue-600" size={24} />
                <span className="text-xs font-bold">공지사항을 불러오는 중...</span>
              </div>
            ) : filteredNotices.length === 0 ? (
              <div className="py-20 text-center text-slate-400 space-y-2">
                <Megaphone size={32} className="mx-auto text-slate-300 stroke-1" />
                <p className="text-xs font-bold">등록된 본사 공지사항이 없습니다.</p>
              </div>
            ) : (
              filteredNotices.map((notice) => {
                const isSelected = selectedNotice?.id === notice.id;
                return (
                  <div
                    key={notice.id}
                    onClick={() => setSelectedNotice(notice)}
                    className={`p-4.5 transition cursor-pointer flex items-center justify-between group ${
                      isSelected 
                        ? 'bg-blue-50/70 border-l-4 border-blue-600' 
                        : 'hover:bg-slate-50/80 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-1.5">
                        {notice.is_important && (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5 shrink-0">
                            <Pin size={9} /> 중요
                          </span>
                        )}
                        <span className="text-[11px] font-mono text-slate-400">
                          {notice.created_at?.slice(0, 10)}
                        </span>
                      </div>
                      <h4 className={`text-xs font-black truncate transition-colors ${
                        isSelected ? 'text-blue-700' : 'text-slate-900 group-hover:text-blue-600'
                      }`}>
                        {notice.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate">
                        {notice.content}
                      </p>
                    </div>

                    <ChevronRight size={15} className={`transition shrink-0 ${
                      isSelected ? 'text-blue-600 translate-x-0.5' : 'text-slate-300 group-hover:text-slate-600'
                    }`} />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Full Notice Reader */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-2xs p-7 min-h-[480px] flex flex-col justify-between">
          {selectedNotice ? (
            <div className="space-y-5 flex-1">
              <div className="border-b border-slate-100 pb-5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-black px-2.5 py-0.5 rounded-full">
                      아이패스케어 본사
                    </span>
                    {selectedNotice.is_important && (
                      <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Pin size={10} /> 주요 공지
                      </span>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEditModal(selectedNotice)}
                        className="p-1.5 bg-slate-100 hover:bg-amber-50 hover:text-amber-600 rounded-lg text-slate-600 transition"
                        title="공지 수정"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(selectedNotice.id)}
                        disabled={saveLoading || !noticeReadReady.current}
                        className="p-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-slate-600 transition"
                        title="공지 삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <h3 className="text-xl font-black text-slate-900 tracking-tight leading-snug">
                  {selectedNotice.title}
                </h3>

                <div className="text-xs font-medium text-slate-400 flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {selectedNotice.created_at?.slice(0, 10)}
                  </span>
                  <span>작성자: {selectedNotice.author_name || '아이패스케어 본사'}</span>
                </div>
              </div>

              {/* Notice Body */}
              <div className="text-sm font-medium text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                {selectedNotice.content}
              </div>
            </div>
          ) : (
            <div className="py-32 text-center text-slate-400 space-y-2 my-auto">
              <Megaphone size={40} className="mx-auto text-slate-200 stroke-1" />
              <p className="text-sm font-black text-slate-600">선택된 본사 공지사항이 없습니다.</p>
              <p className="text-xs">좌측 목록에서 열람하실 공지사항을 선택해 주세요.</p>
            </div>
          )}

          <div className="border-t border-slate-100 pt-4 mt-6 text-[11px] text-slate-400 flex items-center justify-between">
            <span>아이패스케어 본부 운영팀</span>
            <span>문의: 010-7563-2520 · groundcorp@naver.com</span>
          </div>
        </div>

      </div>

      {/* Admin Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {editingId ? '본사 공지사항 수정' : '새 본사 공지사항 작성'}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  가맹 학원 원장님들의 대시보드 띠배너 및 본사 공지 페이지에 즉시 노출됩니다.
                </p>
              </div>
              <button 
                onClick={closeNoticeEditor}
                disabled={saveLoading}
                className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <fieldset disabled={saveLoading || loading || !noticeReadReady.current} className="contents">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700">공지 제목 *</label>
                <input
                  type="text"
                  placeholder="예: [안내] 2026년 추석 연휴 셔틀 안전 운행 및 고객센터 운영 안내"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700">공지 상세 본문 내용 *</label>
                <textarea
                  rows={8}
                  placeholder="가맹 학원 원장님들께 안내할 공지사항 내용을 자세히 작성해 주세요."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 leading-relaxed"
                  required
                />
              </div>

              <label className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                isImportant ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <div className="space-y-0.5">
                  <b className="text-xs font-black flex items-center gap-1">
                    <Pin size={12} /> 중요 공지 (상단 고정)
                  </b>
                  <span className="text-[10px] text-slate-400 block">공지 목록 맨 위에 붉은 뱃지로 고정</span>
                </div>
                <input
                  type="checkbox"
                  checked={isImportant}
                  onChange={(e) => setIsImportant(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
              </label>

              <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={closeNoticeEditor}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  취소
                </button>

                <button
                  type="submit"
                  disabled={saveLoading || loading || !noticeReadReady.current}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition shadow-md disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saveLoading ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                  {editingId ? '수정 완료' : '본사 공지 등록하기'}
                </button>
              </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
