# 관리자 웹 폴더 구조

화면을 찾은 뒤 관련 API·계산·타입을 같은 업무 폴더에서 찾을 수 있는 `pages` 중심 구조다. React 프로젝트이며 Vue의 `composables` 등은 만들지 않는다. 폴더 이름보다 실제 책임을 기준으로 나눈다.

```text
src/
├── pages/
│   └── admin/
│       ├── AdminPage.tsx        # 관리자 진입점, 탭 구성, 아직 미분리된 출결 등
│       ├── attendance/
│       │   ├── api/            # 출결 조회, 장부·단일 타임라인 쓰기, 알림
│       │   ├── model/          # 장부 계산·실시간 상태 병합·기존 규칙
│       │   ├── types.ts
│       │   └── README.md
│       ├── students/
│       │   ├── views/          # 학생관리 화면
│       │   ├── api/            # 학생·상세·탈퇴 조회, 저장·청구 계획 등
│       │   ├── files/          # 일괄등록 Excel 양식 생성
│       │   ├── model/          # Excel 입력 행 변환·지점별 배정 계획 검증
│       │   ├── types.ts
│       │   └── README.md
│       ├── billing/
│       │   ├── views/          # 청구 관리·현장 수납 화면
│       │   ├── api/            # 조회, 자동 설정, 청구 처리·발송, 수기 수납 등록
│       │   ├── model/          # 월 범위·청구대상·생성 매개변수 계산
│       │   ├── types.ts
│       │   └── README.md
│       ├── journals/
│       │   ├── views/          # 학습·상담일지 화면
│       │   ├── api/            # 학습·상담 조회·쓰기, 공통 알림 요청
│       │   ├── model/          # 학습일지 Excel 행 변환
│       │   └── files/          # 학습일지 xlsx 버퍼 생성
│       ├── dashboard/
│       │   ├── views/
│       │   └── components/     # 대시보드 전용 모달
│       ├── classes/            # views·components·api·model: 수업/시간표/예약
│       ├── site/               # api·model: 소개 콘텐츠/설정/영상/협력사
│       ├── teachers/views/     # 강사
│       ├── shuttle/views/      # 셔틀
│       ├── notices/            # views·api·model: 지점/본사 공지 조회·쓰기·푸시
│       ├── messages/views/     # 문자
│       ├── roles/views/        # 권한
│       └── referrals/views/    # 추천 관계
├── components/                 # 기존 소개 페이지 등 공통/기타 화면 구성
├── lib/                        # Supabase client·공유 조회
├── errors/                     # 공통 오류 코드·표시·로그
├── services/                   # 기존 결제·문자 연동
└── utils/                      # 공유 계산·변환
```

## 배치 기준

| 위치 | 넣는 내용 | 주의점 |
| --- | --- | --- |
| `views` | 탭·페이지 UI, 입력과 로딩 상태 | 화면 전용 코드를 전역 공통 폴더로 올리지 않는다 |
| `api` | DB/RPC 조회·저장 흐름 | 응답 오류 검사, 공통 오류 변환, 쓰기 자동 재시도 금지 |
| `model` | 외부 연결 없는 계산·변환 | React state·Supabase client에 의존하지 않는다 |
| `components` | 해당 업무 안에서 사용하는 하위 UI | 여러 업무에서 실제 재사용할 때 공통 승격을 검토한다 |
| `types.ts` | 업무 내 공유 타입 | 사용 범위가 한 파일뿐이면 그 파일에 유지해도 된다 |

`api`는 새 서버나 HTTP 경로가 아니라 클라이언트 요청 코드의 위치다. 기존 URL, 권한, RPC, SQL, 화면 디자인은 이번 이동으로 바꾸지 않았다. 필요 없는 `hooks`, `routes`, `layouts` 빈 폴더는 만들지 않았다. 아직 로직을 추출하지 않은 업무에는 `views`만 있다.

## 코드 찾기와 검증

1. `src/App.tsx`에서 `pages/admin/AdminPage.tsx`로 진입한다.
2. 수정할 업무의 `views`를 연다. 분리된 요청은 같은 업무의 `api`, 순수 계산은 `model`로 이어진다.
3. 학생·수납의 상세 규칙은 각 폴더의 README를 확인한다.
4. `npm run test:students`, `npm run test:billing`, `npm run test:journals`로 모의 테스트를 실행한다. 실제 권한·화면 검수는 별도다.

## 남은 정리

- `AdminPage.tsx` 안의 출결과 기타 내장 화면은 아직 크다. 조회/계산·장부/단일·일괄 타임라인 처리와 공통 알림은 분리했지만 큰 JSX는 남아 있다.
- 학생 Excel 업로드의 파일 읽기·계획 검증·DB 저장/배정은 files/model/api로 분리했다. 서버 멱등성·파일 전체 트랜잭션과 AdminPage 내부 업무 분리는 남아 있다.
- 폴더 이동 이후 주요 조회·쓰기·응답 검증도 점진 분리했다. 전체 리팩토링·보안 검증 완료를 뜻하지 않는다. 최신 범위는 [인수인계 문서](refactor-handoff.md)를 참고한다.
- SQL의 이름·적용 이력, DB 정책, 운영 배포는 변경하지 않았다.
