import React, { useState } from 'react';
import { Send, CheckCircle2, Phone, Building, User, Users, MapPin, MessageSquare, Sparkles } from 'lucide-react';

export const InquiryFormSection: React.FC = () => {
  const [formData, setFormData] = useState({
    academyName: '',
    contactName: '',
    phone: '',
    studentCount: '100명 미만',
    region: '',
    message: ''
  });

  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 800);
  };

  return (
    <section id="inquiry" className="py-24 bg-gradient-to-b from-blue-50 via-slate-50 to-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="max-w-4xl mx-auto glass-card p-8 sm:p-12 lg:p-14 shadow-2xl relative overflow-hidden">
          
          <div className="text-center max-w-2xl mx-auto mb-10">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>무료 도입 상담 & 맞춤 견적 신청</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              아이패스케어 도입 문의
            </h2>
            <p className="text-slate-600 mt-2 text-sm sm:text-base">
              학원 규모에 맞는 최적의 요금제 및 맞춤 솔루션을 친절히 안내해 드립니다.
            </p>
          </div>

          {submitted ? (
            <div className="text-center py-12 space-y-4 animate-in zoom-in-95 duration-300">
              <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xl">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900">도입 상담 신청이 접수되었습니다!</h3>
              <p className="text-slate-600 text-sm max-w-md mx-auto">
                입력해주신 연락처(<strong>{formData.phone}</strong>)로 전문 상담원이 24시간 이내에 직접 연락드려 학원 맞춤 견적과 무료 시연을 안내해 드리겠습니다.
              </p>
              <button 
                onClick={() => {
                  setSubmitted(false);
                  setFormData({
                    academyName: '',
                    contactName: '',
                    phone: '',
                    studentCount: '100명 미만',
                    region: '',
                    message: ''
                  });
                }}
                className="btn-secondary text-xs px-6 py-3 mt-4"
              >
                새로운 상담 신청하기
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                
                {/* Academy Name */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-blue-600" />
                    <span>학원명 / 아카데미명 *</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 정성을 다하는 스포츠 아카데미"
                    value={formData.academyName}
                    onChange={(e) => setFormData({ ...formData, academyName: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                  />
                </div>

                {/* Contact Name */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-blue-600" />
                    <span>담당자 / 대표자 성함 *</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 홍길동 원장"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                  />
                </div>

                {/* Phone Number */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-blue-600" />
                    <span>연락처 *</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="예: 010-1234-5678"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                  />
                </div>

                {/* Student Capacity */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>현재 학원 원생 수</span>
                  </label>
                  <select
                    value={formData.studentCount}
                    onChange={(e) => setFormData({ ...formData, studentCount: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                  >
                    <option value="50명 미만">50명 미만</option>
                    <option value="50명 ~ 100명">50명 ~ 100명</option>
                    <option value="100명 ~ 300명">100명 ~ 300명</option>
                    <option value="300명 이상">300명 이상</option>
                  </select>
                </div>

              </div>

              {/* Region & Message */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <span>학원 소재 지역</span>
                </label>
                <input
                  type="text"
                  placeholder="예: 서울시 강남구 / 경기도 성남시"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  <span>문의 및 요청사항 (선택)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="궁금하신 내용이나 셔틀 운행 대수 등을 자유롭게 적어주세요."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white resize-none"
                />
              </div>

              {/* Submit Button */}
              <button 
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-4 text-base font-bold justify-center shadow-blue-500/30"
              >
                {loading ? (
                  <span>신청 접수 중...</span>
                ) : (
                  <>
                    <span>무료 도입 상담 신청하기</span>
                    <Send className="w-5 h-5" />
                  </>
                )}
              </button>

              <div className="text-center text-[11px] text-slate-500">
                입력하신 정보는 상담 목적으로만 사용되며 안전하게 보호됩니다.
              </div>

            </form>
          )}

        </div>

      </div>
    </section>
  );
};
