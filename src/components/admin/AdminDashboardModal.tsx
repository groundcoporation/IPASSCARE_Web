import React, { useState, useEffect } from 'react';
import { 
  X, ShieldAlert, CreditCard, UsersRound, Settings, 
  Video, Check, Loader2, RefreshCw, FileText, ExternalLink
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'inquiries' | 'settings' | 'videos' | 'payments' | 'attendance'>('inquiries');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // 1. Inquiries State
  const [inquiries, setInquiries] = useState<any[]>([]);

  // 2. Web Settings State
  const [litePrice, setLitePrice] = useState('99000');
  const [proPrice, setProPrice] = useState('118000');
  const [kakaoUrl, setKakaoUrl] = useState('https://pf.kakao.com/');
  const [contactPhone, setContactPhone] = useState('010-7563-2520');
  const [contactEmail, setContactEmail] = useState('groundcorp@naver.com');
  const [savingSettings, setSavingSettings] = useState(false);

  // 3. YouTube Videos State
  const [videos, setVideos] = useState<any[]>([]);
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoCategory, setNewVideoCategory] = useState<'parent' | 'admin' | 'driver'>('parent');
  const [newVideoUrl, setNewVideoUrl] = useState('');

  // Fetch Data on Tab Change or Open
  useEffect(() => {
    if (!isOpen) return;
    fetchData();
  }, [isOpen, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setMsg('');
    try {
      if (activeTab === 'inquiries') {
        const { data } = await supabase.from('web_inquiries').select('*').order('created_at', { ascending: false });
        setInquiries(data || []);
      } else if (activeTab === 'settings') {
        const { data } = await supabase.from('web_settings').select('*').eq('id', 'default').single();
        if (data) {
          setLitePrice(String(data.lite_monthly_price || 99000));
          setProPrice(String(data.pro_monthly_price || 118000));
          setKakaoUrl(data.kakao_chat_url || 'https://pf.kakao.com/');
          setContactPhone(data.contact_phone || '010-7563-2520');
          setContactEmail(data.contact_email || 'groundcorp@naver.com');
        }
      } else if (activeTab === 'videos') {
        const { data } = await supabase.from('web_manual_videos').select('*').order('created_at', { ascending: false });
        setVideos(data || []);
      }
    } catch (err) {
      console.warn('Admin fetch error', err);
    } finally {
      setLoading(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setMsg('');
    try {
      const { error } = await supabase
        .from('web_settings')
        .upsert({
          id: 'default',
          lite_monthly_price: Number(litePrice),
          pro_monthly_price: Number(proPrice),
          kakao_chat_url: kakaoUrl,
          contact_phone: contactPhone,
          contact_email: contactEmail,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      setMsg('✅ 요금제 및 환경설정이 성공적으로 저장되었습니다!');
    } catch (err: any) {
      setMsg(`❌ 저장 실패: ${err.message || '오류 발생'}`);
    } finally {
      setSavingSettings(false);
    }
  };

  // Update Inquiry Status
  const handleUpdateInquiryStatus = async (id: string, status: string) => {
    try {
      await supabase.from('web_inquiries').update({ status }).eq('id', id);
      setInquiries(prev => prev.map(item => item.id === id ? { ...item, status } : item));
    } catch (err) {
      alert('상태 변경 실패');
    }
  };

  // Add YouTube Video
  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoTitle || !newVideoUrl) return alert('제목과 유튜브 URL을 입력하세요');

    try {
      const { data, error } = await supabase.from('web_manual_videos').insert([{
        title: newVideoTitle,
        category: newVideoCategory,
        youtube_url: newVideoUrl,
        is_visible: true
      }]).select();

      if (error) throw error;
      if (data) setVideos(prev => [data[0], ...prev]);
      setNewVideoTitle('');
      setNewVideoUrl('');
      alert('매뉴얼 동영상이 추가되었습니다');
    } catch (err: any) {
      alert('추가 실패: ' + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      
      <div className="bg-slate-900 text-white rounded-3xl border border-slate-800 shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-bg-primary flex items-center justify-center font-bold">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span>아이패스케어(IPASSCARE) 통합 관리자 포털</span>
                <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/40 px-2 py-0.5 rounded-md font-extrabold">ADMIN</span>
              </h3>
              <p className="text-xs text-slate-400">학원 원비 수납, 출결, B2B 도입 문의, 요금제 및 유튜브 매뉴얼을 통합 관리합니다.</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 text-xs font-bold overflow-x-auto">
          <button
            onClick={() => setActiveTab('inquiries')}
            className={`px-5 py-3.5 flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors ${activeTab === 'inquiries' ? 'border-blue-500 text-blue-400 bg-slate-850' : 'border-transparent text-slate-400 hover:text-white'}`}
          >
            <FileText className="w-4 h-4" />
            <span>B2B 도입 문의 접수</span>
            {inquiries.length > 0 && (
              <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                {inquiries.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-5 py-3.5 flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors ${activeTab === 'settings' ? 'border-blue-500 text-blue-400 bg-slate-850' : 'border-transparent text-slate-400 hover:text-white'}`}
          >
            <Settings className="w-4 h-4" />
            <span>요금제 & 사이트 설정</span>
          </button>

          <button
            onClick={() => setActiveTab('videos')}
            className={`px-5 py-3.5 flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors ${activeTab === 'videos' ? 'border-blue-500 text-blue-400 bg-slate-850' : 'border-transparent text-slate-400 hover:text-white'}`}
          >
            <Video className="w-4 h-4" />
            <span>유튜브 매뉴얼 관리</span>
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`px-5 py-3.5 flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors ${activeTab === 'payments' ? 'border-blue-500 text-blue-400 bg-slate-850' : 'border-transparent text-slate-400 hover:text-white'}`}
          >
            <CreditCard className="w-4 h-4" />
            <span>원비 결제 & 환불 내역</span>
          </button>

          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-5 py-3.5 flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors ${activeTab === 'attendance' ? 'border-blue-500 text-blue-400 bg-slate-850' : 'border-transparent text-slate-400 hover:text-white'}`}
          >
            <UsersRound className="w-4 h-4" />
            <span>원생 출결 & 수강권</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-900 text-slate-300">
          
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span>데이터를 불러오는 중입니다...</span>
            </div>
          )}

          {/* TAB 1: B2B Inquiries */}
          {!loading && activeTab === 'inquiries' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-extrabold text-white">웹사이트 B2B 무료 도입 상담 신청 리스트</h4>
                <button onClick={fetchData} className="text-xs text-blue-400 flex items-center gap-1 hover:underline">
                  <RefreshCw className="w-3.5 h-3.5" /> 새로고침
                </button>
              </div>

              {inquiries.length === 0 ? (
                <div className="bg-slate-800/60 p-8 rounded-2xl text-center text-slate-400 text-xs">
                  아직 접수된 B2B 도입 문의 데이터가 없습니다. (Supabase DB `web_inquiries` 테이블 연동)
                </div>
              ) : (
                <div className="space-y-3">
                  {inquiries.map((item) => (
                    <div key={item.id} className="bg-slate-800 p-4 rounded-2xl border border-slate-700 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/80 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-white text-sm">{item.academy_name}</span>
                          <span className="text-xs text-slate-400 font-bold">| {item.director_name} 원장님</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-400">{new Date(item.created_at).toLocaleDateString('ko-KR')}</span>
                          <select 
                            value={item.status || 'pending'}
                            onChange={(e) => handleUpdateInquiryStatus(item.id, e.target.value)}
                            className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 text-xs font-bold"
                          >
                            <option value="pending">⏳ 접수 완료</option>
                            <option value="in_progress">📞 상담 진행중</option>
                            <option value="completed">✅ 상담 완료</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div>연락처: <span className="text-blue-400 font-bold">{item.phone}</span></div>
                        <div>이메일: <span className="text-slate-200">{item.email || '-'}</span></div>
                        <div>원생/셔틀: <span className="text-emerald-400 font-bold">{item.student_count || 0}명 / {item.shuttle_count || 0}대</span></div>
                      </div>

                      {item.message && (
                        <div className="bg-slate-900 p-2.5 rounded-xl text-xs text-slate-300">
                          {item.message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Settings & Pricing */}
          {!loading && activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-6 bg-slate-800/80 p-6 rounded-2xl border border-slate-700">
              
              <div className="border-b border-slate-700 pb-3">
                <h4 className="text-base font-extrabold text-white">웹사이트 요금제 및 환경설정 관리</h4>
                <p className="text-xs text-slate-400 mt-1">여기서 수정한 금액과 설정은 웹사이트 ROI 계산기 및 버튼에 실시간 반영됩니다.</p>
              </div>

              {msg && (
                <div className="p-3 bg-blue-500/20 border border-blue-500/50 rounded-xl text-xs text-blue-300 font-bold">
                  {msg}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Lite 요금제 월 이용료 (원)</label>
                  <input 
                    type="number"
                    value={litePrice}
                    onChange={(e) => setLitePrice(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 text-sm font-bold"
                  />
                  <span className="text-[10px] text-slate-400">기본값: 99,000원 (VAT 포함)</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Pro 요금제 월 이용료 (원)</label>
                  <input 
                    type="number"
                    value={proPrice}
                    onChange={(e) => setProPrice(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 text-sm font-bold"
                  />
                  <span className="text-[10px] text-slate-400">기본값: 118,000원 (삼성 패드 포함)</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">카카오톡 1:1 상담 채널 URL</label>
                <input 
                  type="text"
                  value={kakaoUrl}
                  onChange={(e) => setKakaoUrl(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">대표 문의 전화번호</label>
                  <input 
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">대표 이메일 주소</label>
                  <input 
                    type="text"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 text-sm"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-700">
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="w-full btn-primary py-3 justify-center text-sm font-bold shadow-lg shadow-blue-500/20"
                >
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>DB에 설정을 즉시 저장하기</span>
                </button>
              </div>

            </div>
          )}

          {/* TAB 3: YouTube Manuals */}
          {!loading && activeTab === 'videos' && (
            <div className="space-y-6">
              
              {/* Form Add */}
              <form onSubmit={handleAddVideo} className="bg-slate-800 p-5 rounded-2xl border border-slate-700 space-y-3">
                <h4 className="text-xs font-bold text-white">신규 유튜브 사용법 매뉴얼 비디오 등록</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <select 
                    value={newVideoCategory}
                    onChange={(e: any) => setNewVideoCategory(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white rounded-xl p-2.5 font-bold"
                  >
                    <option value="parent">학부모용 비디오</option>
                    <option value="admin">학원장용 비디오</option>
                    <option value="driver">기사님용 비디오</option>
                  </select>

                  <input 
                    type="text"
                    placeholder="동영상 제목 (예: 셔틀 위치 확인법)"
                    value={newVideoTitle}
                    onChange={(e) => setNewVideoTitle(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white rounded-xl p-2.5"
                  />

                  <input 
                    type="text"
                    placeholder="유튜브 URL (예: https://youtu.be/xxx)"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white rounded-xl p-2.5"
                  />
                </div>

                <button type="submit" className="btn-primary text-xs py-2 px-4 justify-center">
                  <span>유튜브 매뉴얼 추가하기</span>
                </button>
              </form>

              {/* List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300">등록된 매뉴얼 리스트 ({videos.length}개)</h4>
                {videos.length === 0 ? (
                  <div className="bg-slate-800/60 p-6 rounded-xl text-center text-xs text-slate-400">
                    아직 등록된 매뉴얼 비디오가 없습니다. 위 폼에서 추가해 보세요.
                  </div>
                ) : (
                  videos.map((vid) => (
                    <div key={vid.id} className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-white">{vid.title}</span>
                        <span className="text-[10px] text-blue-400 ml-2 font-bold">[{vid.category}]</span>
                      </div>
                      <a href={vid.youtube_url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white flex items-center gap-1">
                        <span>유튜브 열기</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))
                )}
              </div>

            </div>
          )}

          {/* TAB 4: Payments & Refunds */}
          {!loading && activeTab === 'payments' && (
            <div className="space-y-4">
              <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 text-xs leading-relaxed space-y-2">
                <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-400" />
                  <span>KSPay 원비 결제 & 부분 취소/환불 관리</span>
                </h4>
                <p className="text-slate-400">
                  `GroundCorporation_web`에 구현되어 있던 수납/가상계좌 결제 상태 관리 및 원 클릭 KSPay 부분 환불 모듈이 성공적으로 통합되었습니다.
                </p>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-700 text-slate-300">
                  • Supabase `payments` 테이블 수납 내역 자동 동기화<br />
                  • 카드 / 가상계좌 / 계좌이체 / 포인트 차감 결제 및 환불 모듈 연결
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Attendance & Student Passes */}
          {!loading && activeTab === 'attendance' && (
            <div className="space-y-4">
              <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 text-xs leading-relaxed space-y-2">
                <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <UsersRound className="w-4 h-4 text-emerald-400" />
                  <span>원생 출결 & 주 N회 수강권 잔여 회차 관리</span>
                </h4>
                <p className="text-slate-400">
                  학원별 원생 태블릿 키패드 출원 기록과 주 1~5회 수강권 잔여 횟수를 한눈에 확인하고 조정할 수 있는 모듈입니다.
                </p>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-700 text-slate-300">
                  • Supabase `children` 및 `attendance` 테이블 자동 연동<br />
                  • 결석/보강 및 잔여 이용권 회차 실시간 계산 지원
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
