import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATIC_MANUALS = [
  {
    category: 'parent',
    category_label: '학부모 매뉴얼',
    title: '셔틀 실시간 위치 조회 및 도착 알림톡 설정 가이드',
    duration: '2분 15초',
    description: '스마트폰 앱에서 셔틀버스의 현재 위치를 확인하고, 승하차 1분 전 알림톡 수신을 설정하는 방법입니다.',
    steps: [
      '앱 실행 후 메인 화면의 [셔틀 위치 지도] 터치',
      '자녀가 탑승하는 노선 차량 선택',
      '도착 전 알림 푸시 켜기'
    ],
    thumbnail_bg: 'from-blue-600 to-indigo-700',
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    youtube_id: 'dQw4w9WgXcQ',
    is_restricted: false,
    access_level: 'public',
    is_visible: true,
    display_order: 1
  },
  {
    category: 'parent',
    category_label: '학부모 매뉴얼',
    title: '모바일 원비 청구서 조회 및 원스톱 간편 결제',
    duration: '1분 40초',
    description: '학원에서 발송한 청구서를 앱에서 확인하고 신용카드 및 모바일 뱅킹으로 안전하게 결제하는 방법입니다.',
    steps: [
      '앱 하단 [이용권/결제] 탭 클릭',
      '미납 청구서의 [즉시 수납하기] 버튼 터치',
      '모바일 결제창에서 원하는 결제 수단 선택 후 결제 완료'
    ],
    thumbnail_bg: 'from-indigo-600 to-purple-700',
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    youtube_id: 'dQw4w9WgXcQ',
    is_restricted: false,
    access_level: 'public',
    is_visible: true,
    display_order: 2
  },
  {
    category: 'parent',
    category_label: '학부모 매뉴얼',
    title: '적립 포인트 조회 및 VOG SPORTS 제휴 쇼핑몰 전환',
    duration: '2분 05초',
    description: '결제 및 추천 이벤트로 적립된 마일리지 포인트를 쇼핑몰 포인트로 1:1 전환하는 상세 과정입니다.',
    steps: [
      '마이페이지 > [포인트 관리] 메뉴 진입',
      '전환할 포인트 금액 입력 후 [쇼핑몰 포인트 전환] 터치',
      'VOG SPORTS / 영카트 쇼핑몰 결제 시 즉시 현금처럼 사용'
    ],
    thumbnail_bg: 'from-emerald-600 to-teal-700',
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    youtube_id: 'dQw4w9WgXcQ',
    is_restricted: false,
    access_level: 'public',
    is_visible: true,
    display_order: 3
  },
  {
    category: 'admin',
    category_label: '학원장 매뉴얼',
    title: '학원 원생 등록 및 이용권 청구서 어플 일괄 발송',
    duration: '3분 10초',
    description: '관리자 대시보드에서 신규 원생을 등록하고 수강 청구서를 어플로 일괄 발송하여 정산 수납을 진행합니다.',
    steps: [
      '관리자 대시보드 > [청구/정산] 메뉴 이동',
      '이번 달 발송 대상 수강생 선택 후 [청구서 작성]',
      '[어플 내 이용권 청구서 일괄 발송] 버튼 클릭 시 학부모 전송'
    ],
    thumbnail_bg: 'from-slate-800 to-slate-950',
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    youtube_id: 'dQw4w9WgXcQ',
    is_restricted: true,
    access_level: 'staff',
    is_visible: true,
    display_order: 4
  },
  {
    category: 'admin',
    category_label: '학원장 매뉴얼',
    title: '태블릿 입구 출결 키패드 세팅 및 등하원 메시지 문구 설정',
    duration: '2분 45초',
    description: '학원 입구 태블릿PC에 키패드 앱을 설치하고, 학원명 문구가 담긴 출결 알림톡을 설정합니다.',
    steps: [
      '태블릿에 아이패스케어 키패드 앱 설치',
      '학원 인증키 입력 후 관리자 계정 로그인',
      '등원/하원 기본 메시지 템플릿 지정 후 완료'
    ],
    thumbnail_bg: 'from-blue-700 to-slate-900',
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    youtube_id: 'dQw4w9WgXcQ',
    is_restricted: true,
    access_level: 'staff',
    is_visible: true,
    display_order: 5
  },
  {
    category: 'driver',
    category_label: '기사님 매뉴얼',
    title: '셔틀 운행 시작/종료 및 정류장별 승하차 원생 체크',
    duration: '1분 50초',
    description: '기사님 전용 앱에서 차량 운행을 시작하고 정류장 도착 시 학생 승하차를 수동 또는 NFC로 기록합니다.',
    steps: [
      '운행 출발 시 기사님 앱의 [운행 시작] 큰 버튼 터치',
      '정류장 도착 후 목록에서 탑승한 원생 [체크] 클릭',
      '운행 마친 후 [운행 종료] 클릭 시 안심 로그 기록 완료'
    ],
    thumbnail_bg: 'from-amber-600 to-orange-700',
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    youtube_id: 'dQw4w9WgXcQ',
    is_restricted: false,
    access_level: 'public',
    is_visible: true,
    display_order: 6
  }
];

async function seed() {
  console.log("Checking for existing videos in web_manual_videos...");
  const { data: existing, error: fetchErr } = await supabase.from('web_manual_videos').select('title');
  if (fetchErr) {
    console.error("Error fetching existing videos:", fetchErr);
    return;
  }

  const existingTitles = new Set((existing || []).map(v => v.title));
  const toInsert = STATIC_MANUALS.filter(v => !existingTitles.has(v.title));

  if (toInsert.length === 0) {
    console.log("All 6 default videos already exist in DB.");
    return;
  }

  console.log(`Inserting ${toInsert.length} default videos...`);
  const { error: insertErr } = await supabase.from('web_manual_videos').insert(toInsert);
  if (insertErr) {
    console.error("Error seeding default videos:", insertErr);
  } else {
    console.log("Seeding completed successfully!");
  }
}

seed();
