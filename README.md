# IPASSCARE Web

아이패스케어 소개 페이지와 관리자 웹입니다. 현재 브랜치는 기존 기능을 유지하면서 파일·조회 로직·인수인계 문서를 점진적으로 정리합니다.

## 개발 시작

리팩토링 작업을 인수받는 경우 [현재 검증 결과·남은 작업](docs/refactor-handoff.md)과 [운영 반영 체크리스트](docs/release-checklist.md)를 먼저 확인합니다.

테스트는 업무별로 분리했습니다. 폴더 구조와 기능별 실행 명령은 [테스트 안내](tests/README.md)를 참고합니다.

검증 명령: `npm run test:refactor` (지정 업무 회귀), `npm run verify:refactor` (타입·lint·회귀·계약·환경·소개 페이지·로컬 빌드). 2026-11-26 기준 지정 테스트 총 1,070개 및 전체 검증이 통과했습니다. 실제 웹·DB 검수와 배포 승인은 별도입니다. 전체 검증의 앱/웹 계약 대조에는 인접한 `IPASSCARE/app` 체크아웃이 필요합니다.

```powershell
npm ci
npm run dev
```

실행 전에 `environments/.env.development.example`을 같은 폴더의 `.env.development.local`로 복사하고 로컬 Docker DB의 공개 설정을 입력합니다. 실제 키 파일은 커밋하지 않습니다.

기본 실행은 로컬 development입니다. DB 주소는 `http://127.0.0.1:45431`이며 설정이 없거나 일치하지 않으면 중단됩니다. 저장소 설치만으로 DB·초기 데이터가 만들어지지는 않습니다. 포트뿐 아니라 실제 프로젝트·데이터도 확인합니다.

| 명령 | 대상 |
| --- | --- |
| `npm run dev` / `dev:local` | 로컬 development |
| `npm run dev:preview` | 별도 Preview DB, 설정 필요 |
| `npm run dev:production` | 운영 DB. 실제 변경 위험 주의 |
| `npm run build` | 운영 빌드. 기존 배포 명령 유지 |
| `npm run build:local` | 로컬 빌드, `dist-local` 출력 |
| `npm run test:journals` | 외부 연결 없는 학습·상담일지 조회 테스트 |
| `npm run test:students` | 외부 연결 없는 학생 목록·연결 정보 조회 테스트 |
| `npm run test:billing` | 외부 연결 없는 수납 조회·금액·청구서 ID 회귀 테스트 |
| `npm run test:environment` | 환경 구분 검증 |
| `npm run test:payment-cancel` | 실제 결제 호출 없는 취소 요청 안전장치 테스트 |
| `npm run test:payment-history` | 외부 연결 없는 결제 조회·검색·표시 계산 테스트 |
| `npm run test:schedule` | 외부 연결 없는 주간 시간표·예약·조회 수명 테스트 |
| `npm run test:admin-content` | 외부 연결 없는 관리자 콘텐츠·설정 조회 테스트 |
| `npm run test:admin-settings` | 실제 설정 변경 없는 금액 검증·저장 응답·중복 방지 테스트 |
| `npm run test:admin-videos` | 실제 영상 변경 없는 저장·삭제·조회 실패·잠금 테스트 |
| `npm run test:admin-partners` | 실제 업로드·DB 변경 없는 브랜드 저장 단계·부분 결과 테스트 |
| `npm run test:type-cleanup` | 공개 로고 조회 오류·화면 이탈·타입 정리 회귀 테스트 |
| `npm run test:hook-dependencies` | 지점·월별 조회 안정성·청구 상태 계산 의존성 모의 테스트 |
| `npm run test:notices` | 실제 DB·푸시 없는 일반/본사 공지 조회·선택 수명 테스트 |
| `npm run test:notice-writes` | 실제 저장·발송 없는 공지 쓰기 응답·푸시 부분 결과 테스트 |
| `npm run test:dashboard` | 외부 연결 없는 대시보드 전체 응답·지점/계정·모달 조회 테스트 |
| `npm run test:class-management` | 외부 연결 없는 강사·수업 초기 조회·지점/편집 수명 테스트 |
| `npm run test:referrals` | 외부 연결 없는 추천 계보·선택 사용자 포인트 기록 테스트 |
| `npm run test:shuttle-map` | 네이버 SDK 모의 객체로 지도/이벤트 수명 검증 |
| `npm run test:class-writes` | 실제 수업 변경 없는 저장·삭제 응답·중복 방지 테스트 |
| `npm run typecheck` | 앱 및 Vite/Node 설정 TypeScript 검사 |
| `npm run test:excel` | 외부 연결 없는 Excel 생성·재열기·다운로드 처리 테스트 |
| `npm run test:attendance` | 외부 연결 없는 출결 장부 조회·계산·화면 회귀 테스트 |
| `npm run lint` | 정적 점검 |

로컬 실행만으로 문자·푸시·결제의 격리가 보장되지는 않습니다. 외부 연동 설정도 별도 확인합니다.

- [환경 설정](environments/README.md)
- [현재 페이지 중심 폴더 구조](docs/page-structure.md)
- [결제 취소 보완과 운영 전 서버 검토](docs/payment-cancellation-safety.md)
- [구조·SQL 정리·작업 순서](docs/refactor-maintainability.md)
- 수정 규칙: `AGENTS.md`

운영 SQL 적용·배포는 별도 승인과 검증이 필요합니다. 개인 AI 가이드와 `scratch/`는 로컬 전용으로 추적에서 제외합니다. 공유/제외 기준은 [저장소 파일 안내](docs/repository-files.md)를 참고합니다.

## 기존 도구 참고

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
