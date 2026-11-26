# 저장소에 공유할 파일과 로컬 전용 파일

## 저장소 유지

| 경로 | 이유 |
| --- | --- |
| `src/`, `public/`, `config/` | 서비스 코드·정적 자산·환경 검증 코드 |
| `server/` | 문자 중계 서버 코드와 배포 양식. 실제 .env는 제외 |
| `tests/`, `scripts/` | 재현 가능한 검증·빌드 도구. 브라우저/SQL 점검은 별도 실행 |
| `supabase/migrations/`, `supabase/audits/` | DB 변경 이력과 검수 SQL. 공유와 실제 DB 적용은 별개 |
| `supabase/seeds/` | 가상 데이터 생성 양식·Develop 대상 확인 도구. 실제 실행은 별도 승인 |
| `environments/*.example`, `.env.example` | 값이 제거된 환경 설정 양식. 실제 키를 넣지 않음 |
| `docs/`, `README.md`, `AGENTS.md` | 인수인계·프로젝트 공통 작업 규칙 |
| `package.json`, `package-lock.json`, 빌드·TS·lint·Vercel 설정 | 설치 및 빌드 재현 |

## Git 추적 제외, 로컬 보존

- `.agent/`, `.agents/`, `.codex/`: 개인 AI 도구·가이드. `.agents/`의 기존 가이드도 Git에서만 제외하며 디스크에 남긴다. 루트의 프로젝트 공통 `AGENTS.md`와 구분한다.
- `scratch/`: 고정 DB 연결·일회성 조회/변경·소스 점검용 스크립트. 현재 실행/테스트 명령이 참조하지 않는다. 검증 도구로 일괄 승격하거나 실행하지 않는다. 필요한 경우 비밀값 제거·환경 검증·문서화 후 `scripts/`에 개별 도입한다.
- `node_modules/`, `dist/`, `dist-local/`, 로그·캐시·개인 IDE 설정: 재생성 가능한 로컬 산출물.
- `.env`, 실제 `.env.*`, `.vercel/`, `supabase/.temp/`, `supabase/.branches/`: 실제 연결·개인 도구 상태.
- `coverage/`, `playwright-report/`, `test-results/`: 자동 생성 검증 결과.
- `IPASSCARE-develop-logins-*.json`, `develop-smoke-*.sql`: 생성된 로그인 자격 정보와 배치별 SQL. `supabase/seeds/develop_smoke.sql` 원본 양식은 계속 공유한다.

## 주의사항

`.gitignore`는 이미 추적 중인 파일을 자동으로 제외하지 않는다. 이번 정리는 `.agents/`, `scratch/`를 `git rm --cached`로 추적 해제하고 로컬 파일은 보존한다.

추적 해제는 과거 커밋의 내용을 삭제하지 않는다. scratch의 기존 JWT 리터럴을 제한적으로 확인했을 때 anon 역할만 확인됐으며, 전체 저장소·커밋 이력의 비밀정보 감사를 완료한 것은 아니다. 비밀 키가 발견되면 키 회전과 이력 정리는 별도 승인·협의가 필요하다.

실데이터 덤프·백업·개인정보·새 자격 파일은 이름과 무관하게 커밋하지 않는다. 저장소 전체를 막는 `*.sql`, `*.json` 규칙은 필요한 설정·마이그레이션까지 숨기므로 사용하지 않는다.
