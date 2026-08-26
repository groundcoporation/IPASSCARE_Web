import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { 
  Megaphone, Plus, Pencil, Trash2, Search, Loader2, 
  Pin, Building2, Eye, X, CheckCircle2, ChevronRight, RefreshCw, Calendar
} from 'lucide-react';

interface HqNotice {
  id: string;
  title: string;
  content: string;
  is_important: boolean;
  author_name: string | null;
  created_at: string;
  updated_at: string | null;
}

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

  const loadHqNotices = async () => {
    setLoading(true);
    try {
      // 1. Try dedicated headquarter_notices table first
      const { data, error } = await supabase
        .from('headquarter_notices')
        .select('*')
        .order('is_important', { ascending: false })
        .order('created_at', { ascending: false });

      if (!error && data) {
        setNotices(data);
        if (data.length > 0 && !selectedNotice) setSelectedNotice(data[0]);
        return;
      }

      // 2. Fallback: Default HQ official launch notice
      const fallbackList: HqNotice[] = [
        {
          id: 'hq-launch-1',
          title: '📢 [공식 런칭] 아이패스케어 스마트 ERP v1.0.0 정식 버전 오픈 안내',
          content: `안녕하세요, 아이패스케어 가맹 학원 원장님 및 임직원 여러분!\n\n아이패스케어 스마트 ERP v1.0.0 공식 버전이 성공적으로 런칭되었습니다.\n\n[주요 업무 기능 지원 안내]\n1. 통합 대시보드 관제: 재원생, 오늘 출결, 이달 수납률 실시간 모니터링\n2. 학부모 스마트폰 어플 실시간 공지 & 푸시 알림 원스톱 발송\n3. 원생 명부, 반 배정 및 모바일 수납 청구서 발행\n4. 셔틀 안전 승·하차 및 등·하원 실시간 체크\n\n항상 원장님들의 성공적인 학원 운영을 위해 최선을 다해 지원하겠습니다.\n감사합니다.\n\n- 아이패스케어 본부 운영팀 배상 -`,
          is_important: true,
          author_name: '아이패스케어 본사',
          created_at: '2026-08-26T00:00:00Z',
          updated_at: '2026-08-26T00:00:00Z'
        }
      ];
      setNotices(fallbackList);
      if (!selectedNotice) setSelectedNotice(fallbackList[0]);
    } catch (err: any) {
      console.error('Failed to load HQ notices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHqNotices();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
    setIsImportant(true);
    setIsModalOpen(true);
  };

  const openEditModal = (notice: HqNotice) => {
    setEditingId(notice.id);
    setTitle(notice.title);
    setContent(notice.content);
    setIsImportant(Boolean(notice.is_important));
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert('제목과 내용을 모두 입력해 주세요.');
      return;
    }

    setSaveLoading(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        is_important: isImportant,
        author_name: '아이패스케어 본사',
        branch_id: null,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase
          .from('headquarter_notices')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('headquarter_notices')
          .insert([{
            ...payload,
            created_at: new Date().toISOString(),
          }])
          .select()
          .single();
        if (error) throw error;
        if (data) setSelectedNotice(data);
      }

      alert(editingId ? '본사 공지사항이 수정되었습니다.' : '새 본사 공지사항이 등록되었습니다.');
      setIsModalOpen(false);
      loadHqNotices();
    } catch (err: any) {
      alert(`저장 실패: ${err.message || '알 수 없는 오류'}\n(Supabase SQL에서 headquarter_notices 테이블 생성이 필요할 수 있습니다.)`);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async (id: string, noticeTitle: string) => {
    if (!confirm(`'${noticeTitle}' 공지사항을 삭제하시겠습니까?`)) return;

    try {
      const { error } = await supabase.from('headquarter_notices').delete().eq('id', id);
      if (error) throw error;
      alert('공지사항이 삭제되었습니다.');
      if (selectedNotice?.id === id) setSelectedNotice(null);
      loadHqNotices();
    } catch (err: any) {
      alert(`삭제 실패: ${err.message || '알 수 없는 오류'}`);
    }
  };

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
            onClick={loadHqNotices}
            disabled={loading}
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
                        onClick={() => handleDelete(selectedNotice.id, selectedNotice.title)}
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
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
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
                  {editingId ? '수정 완료' : '본사 공지 등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
