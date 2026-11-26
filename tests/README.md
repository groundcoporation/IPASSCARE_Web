# 테스트 구조와 실행

소스의 `src/pages/admin` 업무 구분에 맞춰 테스트를 배치한다. 별도 npm 패키지나 새 테스트 프레임워크는 만들지 않았으며 기존 Node test runner를 유지한다.

```text
tests/
├── admin/
│   ├── students/       # 학생 조회·저장·탈퇴·Excel 등록·청구 연결
│   ├── billing/        # 청구·수납·결제 이력·취소
│   ├── attendance/     # 출결 장부·일간/월간·단일/일괄 처리
│   ├── journals/       # 학습·상담일지
│   ├── classes/        # 수업·시간표·예약
│   ├── notices/        # 일반/본사 공지
│   ├── site/           # 소개 콘텐츠·설정·영상·협력사
│   ├── dashboard/
│   ├── referrals/
│   └── shuttle/
├── shared/             # 공통 오류 계약·Excel 내보내기
├── environment/        # 실행 환경·브라우저용 설정의 모의 검사
├── marketing/          # 소개 페이지의 순수 계산·정적 렌더 검사
├── architecture/       # 타입·Hook 규칙·검증 실행 도구
├── browser/marketing/  # 선택적 실제 브라우저 점검 스크립트
└── integration/sql/    # 로컬 DB 전용 SQL 검증 자료
```

## 평소 실행

저장소 루트에서 실행한다. 기능별 명령 이름은 이전과 같다.

| 명령 | 범위 |
| --- | --- |
| `npm run test:students` | 학생 조회·상세·저장·청구 연결·탈퇴 |
| `npm run test:excel` | 공통 내보내기 + 학생 Excel 입력·등록 |
| `npm run test:billing` | 청구·수납·요금 계산 |
| `npm run test:payment-cancel` / `test:payment-history` | 결제 취소 / 이력 |
| `npm run test:attendance` | 출결 |
| `npm run test:journals` | 학습·상담일지 |
| `npm run test:schedule` / `test:class-management` / `test:class-writes` | 시간표 / 수업 조회 / 쓰기 |
| `npm run test:notices` / `test:notice-writes` | 공지 조회 / 쓰기 |
| `npm run test:admin-content` / `test:admin-settings` / `test:admin-videos` / `test:admin-partners` | 콘텐츠·설정·영상·협력사 |
| `npm run test:dashboard` / `test:referrals` / `test:shuttle-map` | 대시보드·추천·지도 |
| `npm run test:type-cleanup` / `test:hook-dependencies` | 구조·타입·Hook 규칙 |
| `npm run test:environment` | 환경 검증 |
| `npm run test:refactor` | 지정 업무 회귀 1,043개 |
| `npm run verify:refactor` | 타입·lint·지정 테스트 총 1,070개·로컬 빌드 |

한 파일만 실행할 때의 예:

```powershell
node --test tests/admin/students/studentSave.test.mjs
node --test tests/shared/appError.test.ts
```

공통 오류 계약 대조에는 인접한 앱 체크아웃이 필요하다. 전체 검증은 해당 파일이 없으면 실패하며, 개별 테스트의 선택적 건너뜀과 구분한다. 환경·격리 범위의 상세 설명은 [인수인계 문서](../docs/refactor-handoff.md)를 참고한다.

## 자동 테스트와 별도 검증의 경계

- `*.test.mjs`, `*.test.ts`: 모의 SDK·순수 계산·소스/정적 렌더 검사. 실제 DB·결제·발송은 실행하지 않는다.
- `browser/marketing/marketingBrowser.check.mjs`: Playwright·브라우저·기존 빌드가 필요한 선택적 점검이다. 자동 회귀에는 포함하지 않으며 이번 이동에서는 실행하지 않았다. 외부 요청 차단과 빌드 대상 환경을 검토한 뒤 별도로 실행한다.
- `integration/sql/*.local.sql`: 격리된 로컬 DB에서만 사용하는 자료다. 자동 실행 명령에 포함하지 않는다. 기존 SQL 원문을 유지했으며 이동만 했고 DB에 적용하지 않았다.

공유 테스트 도구가 실제로 생기면 `support/`에 배치한다. 지금은 빈 폴더나 중복 mock의 일괄 추출을 추가하지 않았다.

## 새 테스트 추가 시

1. 담당 업무 폴더에 배치하고 소스·fixture 참조를 파일 위치 기준으로 맞춘다.
2. 해당 기능의 `package.json` 테스트 명령에 파일을 명시한다. 폴더 이동만으로 지정 회귀 목록에 자동 추가되지는 않는다.
3. 공통/환경/소개 페이지 등 별도 검증 묶음이면 `scripts/verify-refactor.mjs`의 해당 목록도 수정한다.
4. 전체 검증에 브라우저 스크립트나 SQL을 섞지 않고, 테스트 개수·실패·건너뜀을 확인한다.
