# 기존 Vercel 프로젝트의 테스터 Preview

운영 프로젝트를 새로 만들 필요는 없다. Production 브랜치와 운영 환경변수는 변경하지 않는다.

## Vercel에서 필요한 설정

Environment Variables에서 환경은 **Preview**, 브랜치는 **feature/admin-uiux-tester**로 한정한다.

| 이름 | 값 |
| --- | --- |
| VITE_APP_ENV | preview |
| VITE_SUPABASE_PROJECT_REF | msvwhvonafmeycmcvarv |
| VITE_SUPABASE_URL | https://msvwhvonafmeycmcvarv.supabase.co |
| VITE_SUPABASE_ANON_KEY | Develop 프로젝트의 공개 anon/publishable 키 |
| VITE_SMS_RELAY_URL | 비움 |
| VITE_TESTER_ISOLATION_VERIFIED | 현재 false 유지. DB 최소 안전 조건 통과 후에만 true |

서비스 역할/secret 키를 VITE_ 변수에 넣지 않는다. 기존 Production 변수를 Preview 값으로 덮어쓰거나 모든 환경을 선택하지 않는다.

Build Command가 `npm run build`이면 해당 브랜치 Preview에서 자동으로 `vite build --mode preview`를 실행한다. 기존 프로젝트가 별도 명령으로 `vite build`를 직접 호출한다면 이 자동 분기가 적용되지 않으므로 설정 확인이 필요하다. Git 브랜치 시스템 환경변수가 전달되어야 한다.

테스터 브랜치의 Production 빌드는 중단하고, Preview 설정이 누락되거나 Develop 외 DB를 가리켜도 빌드를 중단한다. 다른 브랜치와 로컬 기본 빌드는 기존 production 모드를 유지한다.

## 현재 진행 상태

- 브랜치별 빌드 분기 코드 준비.
- Vercel 원격 설정 및 Preview 배포 결과는 아직 확인/변경하지 못함.
- Develop 영구 SQL 적용 및 테스터 계정 공개는 아직 미완료.
- 테스트 로그인 플래그는 안전 확인 전 활성화하지 않음.

코드가 push됐거나 빌드에 성공했다고 DB 격리까지 적용된 것은 아니다. 공개 전에는 `tester-rollout-checklist.md`의 최소 권한·다른 지점 접근·외부 전송 차단을 확인한다.
