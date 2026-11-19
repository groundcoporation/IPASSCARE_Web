# 실제 관리자 웹의 테스트 로그인

테스터는 별도 Preview 호스트의 `/tester`에서 로그인한다. 로그인 이후에는 운영과 같은 `AdminPage` 및 동일한 출결·수납·일지·셔틀 메뉴와 DB 호출을 사용한다. Preview의 가상 지점에 저장되므로 새로고침 후에도 테스트 기록이 남는다. 원장 계정에 허용된 화면을 기준으로 하며 최고 관리자 전용 화면은 열리지 않는다.

## 공개하기 전 안전 확인

체험 호스트는 운영과 다른 Supabase Auth·DB·Storage로 고정한다. **운영 원생·보호자·전화번호·결제정보·푸시 토큰을 복제하지 않는다.** 기존 Develop 테스트 지점을 쓴다면 가상 데이터 외의 고객 데이터가 테스터 권한으로 조회되지 않는지도 점검한다.

테스트 웹은 Preview Supabase의 Auth·REST·Storage를 허용하며 브라우저의 Edge Function 호출을 차단한다. 직접 호출하는 문자 중계와 KSNET 결제 경로도 Preview에서는 차단한다. 이 브라우저 차단은 서버 설정을 대체하지 않는다.

- Preview의 운영 PG·환불·문자·푸시 자격 증명과 실제 접속 주소를 제거한다. 별도 샌드박스나 스텁이 필요한 경우 운영으로 우회할 수 없어야 한다.
- 자동청구·미납알림 등 Preview의 cron, SQL 트리거 및 DB 웹훅, 호출 가능한 Edge Function도 검토한다. 실제 외부 발송 경로가 남아 있으면 테스트 로그인 진입을 활성화하지 않는다.
- 운영 지점·다른 가상 지점 조회/변경이 SQL RLS와 RPC 권한으로 차단되는지 검증한다. 브라우저 지점 필터만으로는 부족하다.
- 현장 수납 기록과 출석 등록·취소는 Preview DB에 실제로 저장한다. 앱 청구 발송·푸시·환불 등 외부 연동은 차단 상태다. 이 경로까지 체험하려면 테스트 전용 서버 연동을 별도로 준비한다.

### 현재 공개 보류

#### 후속: 고위험 RPC 검증 확대 — 총 86개 통과

- 기존 60개에 원생/예약 삭제·취소·보강·이용권 대상 변경·추천 포인트·정지/회수 세션 검사 26개를 추가해 **DB 검사 86개 통과**. 로컬 단위 검사 21개도 통과했다.
- 테스터 후보에서 보호하는 기존 RPC는 9개다: `update_member_role`, `list_role_manageable_members`, `soft_delete_child`, `soft_delete_reservation`, `cancel_class_reservation`, `process_referral_points`, `grant_makeup_credit`, `assign_user_package_beneficiary`, `process_lesson_check_in`. 검토 목록은 `scripts/tester-rpc-rules.mjs`에서 관리한다.
- 원본 `soft_delete_child`/`soft_delete_reservation`의 직원 판정에는 지점 제한이 없었다. 후보는 서버의 테스터 지점과 대상 행의 지점을 비교해 타 지점 삭제를 거부한다. 자기 지점 가상 원생·예약의 정상 삭제도 검증했다.
- 원본 `cancel_class_reservation`은 전달받은 사용자 ID를 사용하고 `remaining_count+1`을 수행했다. 테스터 후보에서는 대상 소유자·지점을 확인하고 홀딩 해제를 처리하는 soft cancellation 경로를 사용한다. 같은 예약을 반복 취소해도 잔여 횟수가 3회를 넘지 않는 것을 검증했다. 일반 운영 사용자용 원본 함수가 수정된 것은 아니다.
- 같은 지점 보강 승인과 동일 보강 중복 생성 방지, 같은 지점 이용권 대상 지정은 유지했다. 타 지점 대상·위조 자녀 연결은 차단했다.
- 추천 가입 포인트 재실행은 테스터에 대해 차단한다. 원장 체험 계정이 가입 보상을 임의로 생성하는 기능을 제공하지 않으며, 추천 포인트 기능까지 체험 완료라고 표시하지 않는다.
- 정지 계정과 서버 권한 회수 뒤의 캐시 JWT로 삭제·취소·보강·이용권 대상 변경·출석 함수를 호출하는 시도 12개를 모두 거부했다.
- 정책·가상 데이터·함수 변경은 모두 롤백했다. 시퀀스 간격 가능성은 동일하며 실제 결제·문자·푸시·파일 API는 호출하지 않았다. 공개 승인 값은 계속 false다.

다음 범위는 파일용 private 테스트 버킷/접근 정책과 나머지 RPC·서버 외부 연동이다. 검증 SQL은 배포용 마이그레이션이 아니므로 `db push` 대상으로 옮기지 않는다.

#### 후속: 사용자·이용권·예약·일지 및 RPC 차단 확장

- 동일한 롤백 검증에 30개 검사를 추가해 **총 60개 DB 검사 통과**. 웹 단위 검사 18개 및 Preview 빌드도 통과했다.
- 추가 후보 범위: `users`, `user_packages`, `reservations`, `academy_study_logs`, `academy_counsel_logs`, `parent_journal_entries` 지점 제한. `api_keys`는 클라이언트 접근 정책을 두지 않는 후보로 차단했다. 기존 4개 테이블 후보도 함께 검증했다.
- 같은 지점의 정상 학습·상담일지 수정과 보호자용 일지 사본 생성은 유지하면서, 타 지점 조회·수정·삭제 및 다른 지점 학생 연결 위조를 거부했다. 보호자 앱 화면·알림 발송 검증은 아니다.
- 사용자 테이블에 잠들어 있던 자기참조 정책은 RLS 활성화 시 재귀 오류를 냈다. 롤백 후보 안에서만 재귀 없는 정책으로 대체했고, 실행 전 기존 정책 정의·역할·명령·개수까지 고정해 변경이 있으면 중단하도록 했다.
- 기존 프로필 필드 보호와 함께 `update_member_role(uuid,text)`, `list_role_manageable_members(text)`에 정지 상태·서버 측 테스터 권한 회수를 확인하는 임시 검사를 추가했다. 정상 원장이 같은 가상 지점 회원의 역할을 바꾸는 기능은 유지하고, 자기 관리자 승격·타 지점 역할 변경·정지 계정·권한 회수 후 캐시 JWT의 호출은 거부했다.
- 두 RPC의 검증이 모든 SECURITY DEFINER 함수 감사 완료를 뜻하지 않는다. 이번 메타데이터 감사에서는 트리거 함수를 제외한 클라이언트 실행 가능 definer RPC가 authenticated 59개, anon 2개였다. 남은 함수는 개별 검토가 필요하다.
- Develop의 Storage 버킷 0개, Storage 정책 0개를 읽기 전용으로 확인했다. 파일명·사진·객체 본문은 읽지 않았다. 파일 접근이 안전하다고 검증된 것이 아니라, 테스트용 업로드/다운로드 환경 자체가 아직 없는 상태다.
- 실제 배포는 하지 않았고 공개 승인 값은 계속 false다. 정상 비테스터 계정의 아이디 로그인이나 전체 운영 권한에 바로 적용할 수 있는 마이그레이션이 아니다.

읽기 전용 메타데이터 감사:

```powershell
node scripts/check-tester-preview.mjs --run --audit
```

전체 임시 검증은 기존 `--run --write --manual` 명령으로 실행한다. 실제 결제·문자·푸시·Edge Function 및 파일 업로드는 이 실험에서 호출하지 않는다. 영구 적용 전에는 나머지 메뉴 접근, RPC 우회, Storage, 서버 외부 연동, 세션 경합 및 브라우저 저장 E2E 검증이 필요하다.

#### 후속: 새 작업 브랜치에서 수동 출석 RPC 임시 검증

- 작업 브랜치: `feature/admin-uiux-tester`. `main`과 운영 DB는 변경하지 않았다.
- Develop에 누락된 수동 출석 RPC를 **검증 트랜잭션 안에서만** 생성했다. 실제 영구 마이그레이션이나 공개는 하지 않았다.
- 기존 24개 검사에 6개를 추가해 **DB 검사 30개 통과**. 수동 출석 등록→중복 등록(추가 차감 없음)→취소(1회 복원), 타 지점·미래 날짜·다른 이용권·예약 없는 날짜·비로그인 호출 거부를 확인했다.
- 새 가상 원생·상품·이용권·예약을 트랜잭션 안에서 생성해 기존 출결과 충돌하지 않게 했다. 가상 데이터, RPC, 정책은 전부 롤백했다. 시퀀스 번호 간격이 생길 수 있다는 기존 주의사항은 동일하다.
- 웹 출결·테스터 진입·검증 실행기 관련 로컬 단위 검사 16개 통과. 실제 브라우저 저장 E2E·동시 세션 경합 검사를 대체하지 않는다.
- 검증 전후 Develop 스키마·권한 메타데이터 해시가 동일했다. `required_rpc_missing=[]`은 **임시 RPC가 존재하는 검증 트랜잭션 안의 결과**이며, 종료 후 Develop의 누락 함수가 영구 해결됐다는 뜻이 아니다.
- SQL 생성기에서 문자열 치환 시 PostgreSQL 달러 인용부(`$$`)가 손상되는 오류를 수정했고 재발 방지 검사를 추가했다. 오류 발생 뒤 설정 롤백을 확인한 후 수정본을 실행했다.

```powershell
node --test tests/testerPolicyCheck.test.mjs tests/testerAccess.test.mjs tests/attendanceLedger.test.mjs
node scripts/check-tester-preview.mjs --run --write --manual
```

`--manual`은 해당 RPC가 이미 배포된 DB에서는 중단한다. 실제 배포 후에는 함수 정의와 기준선을 다시 검토해야 한다. 공개 차단 조건(나머지 테이블·RPC·Storage·서버 외부 연동)은 여전히 남아 있다.

#### 2026-11-19 후속: 저장·수정 검증

- Develop 가상 데이터와 임시 정책으로 쓰기 검사 **24개 통과**. 각 쓰기 검사는 하위 트랜잭션에서 되돌리고, 마지막에 정책·가상 청구서·현장 수납 기록 등 전체 트랜잭션도 롤백했다.
- 확인 범위: 자기 지점 출결·학원 원생·청구서 저장/수정, 타 지점 변경·삭제 차단, 자기 지점 ID에 다른 지점 원생/학생을 연결하는 위조 입력 차단, 현장 수납 예정→부분 수납 확정→동일 건 중복 확정, 타 지점 수납 RPC 거부, 비로그인 출결 저장 거부.
- 원래 후보에서 **테스터 본인 프로필의 role을 admin으로 직접 수정할 수 있는 문제**를 재현했다. 역할·지점·포인트·타인 프로필 변경을 거부하고 본인 이름 수정은 허용하는 SECURITY INVOKER 트리거 후보를 추가한 뒤 재검증했다. **운영 또는 Develop의 영구 보호가 완료됐다는 뜻은 아니다.**
- 스키마·권한 메타데이터 해시는 검증 전후 동일했다. 롤백해도 PostgreSQL 시퀀스 번호는 되돌아가지 않으므로, 검증 중 생성된 감사 로그 번호 등에 간격이 생길 수 있다. 시퀀스를 임의로 재설정하지 않았다.
- `register_manual_ledger_attendance(uuid,date,uuid)`가 Develop에 없다. 현재 웹 월별 출결 장부의 수동 등록은 이 함수가 필요하므로 서버 배포 누락을 별도로 해결해야 한다. 파일: `supabase/migrations/202611170002_register_manual_ledger_attendance.sql`. 이 작업에서는 해당 마이그레이션을 적용하지 않았다.
- 실제 PG 결제·문자·푸시 API 및 Auth 로그인 요청은 이 SQL 실험에서 호출하지 않았다. 현장 수납 검사는 가상 장부 기록이며 실제 금전 결제가 아니다. 브라우저/설치 앱 저장 E2E·동시 요청 경합·전액 수납 이용권 발급 검증은 아니다.
- 남은 공개 차단 조건: users 등 나머지 테이블의 읽기/쓰기, SECURITY DEFINER RPC의 우회 권한 변경, Storage, 서버 예약 작업·외부 연동, 누락 RPC 배포와 화면 E2E. 현재 후보는 정상 비테스터 데이터의 권한 체계를 완성하는 정책이 아니다.

후속 검사 실행:

```powershell
node scripts/check-tester-preview.mjs --run --write
```

최신 Develop 메타데이터와 검토한 함수·트리거의 정의가 다르면 쓰기 전에 중단한다. `direct_write_passed=true`도 공개 승인 신호가 아니며 `release_approved`는 계속 false다.

#### 2026-11-19 이어서 검증한 결과

- 테스트 진입·환경 분리 및 롤백 실행기 단위 검사 5개 통과.
- 실제 AdminPage를 사용하는 브라우저 검사 통과. HTTP 응답은 가상으로 대체했으며, 지점 불일치 로그인 거부와 출결·수납 메뉴 진입을 확인했다. Develop 실데이터 저장 E2E 검사는 아니다.
- Develop에서 핵심 정책 후보를 한 트랜잭션에 임시 적용해 children·attendance_logs·academy_students·academy_bills 조회 범위를 확인했고 통과했다. 정책과 Auth 메타데이터 변경은 전부 롤백했다.
- 검증 전후 스키마·권한 메타데이터 SHA-256이 동일했다(`d266b950bc6f96d0a773ee4543e031e9551b1b9bbe51776e82746ead082e451e`). 운영 DB는 변경하지 않았다.
- **아직 공개 불가**: 정상 쓰기·타 지점 쓰기 차단, 나머지 테이블·RPC·Storage, 서버의 외부 결제·문자·푸시 및 자동 작업 검증이 남아 있다. 4개 테이블 조회 검사 통과를 전체 권한 분리 완료로 해석하지 않는다.

재검증 명령(웹 폴더, 연결 대상이 지정된 Develop일 때만 실행):

```powershell
node --test tests/testerAccess.test.mjs tests/testerPolicyCheck.test.mjs
node scripts/check-tester-preview.mjs
node scripts/check-tester-preview.mjs --run
```

마지막 명령만 임시 DB 검사를 실행한다. `--apply`는 없으며 운영 대상으로 실행할 수 없다. 실패 시 응답 원문을 출력하거나 자동 재시도하지 않는다.

공용 `IPASSCARE-develop`에서 테스트 원장 계정으로 검증했을 때, 자기 가상 지점뿐 아니라 다른 가상 지점 원생도 조회됐다. 검증에 사용한 원장 권한은 회수했다. 브라우저에 지점 필터가 표시돼도 DB 권한이 분리된 것은 아니다. 이 상태에서는 운영의 테스트 로그인 링크와 Preview 진입을 모두 꺼 둔다.

기존 `IPASSCARE-develop`을 체험 전용으로 전환한다. 기능 개발과 마이그레이션 테스트는 로컬 Docker에서 하고, 운영 DB는 배포 후 실제 동작 확인에만 제한적으로 사용한다. Develop에 운영 데이터를 복제하지 않는다. 테이블·RPC·Storage의 권한, 기존 테스트 계정 정리, 데이터 초기화 정책을 먼저 검증한다.

`supabase/checks/tester_preview_access_audit.sql`은 고객 데이터를 조회하지 않고 공개 스키마의 테이블 권한, 뷰 및 권한 상승 함수의 검토 범위를 집계한다. 결과만으로 공개를 승인하지 않는다. 실제 테스터 계정으로 자기 지점의 출결·현장 수납이 저장되는지, 다른 가상 지점이 조회·변경되지 않는지, 실제 발송·결제가 일어나지 않는지 별도로 확인한다.

`supabase/checks/tester_preview_core_policy.sql`은 원생, 출결 기록, 학원 원생 및 청구 테이블의 직접 접근을 지점으로 제한하는 정책 후보를 가상 지점 두 곳으로 검사한다. 전체가 롤백되는 검증이며 배포용 마이그레이션으로 실행하거나 공개 승인에 사용하지 않는다. 다른 테이블과 `SECURITY DEFINER` RPC, Storage는 별도 검토가 필요하다.

## 계정 및 배포 설정

1. 기존 `supabase/seeds/seed-develop-smoke.ps1`이 생성한 가상 지점(예: `devsmoke-<10자리 hex>-1`)을 확인한다. 무작위 실 지점을 할당하지 않는다.
2. **Preview 프로젝트 Auth**의 테스트 계정과 **같은 UUID인** `public.users` 프로필을 가상 지점의 활성 원장(`role=director`)으로 준비한다. 이미 발급한 시뮬레이션 계정은 프로필 연결 전까지 실제 관리자 화면을 열 수 없다. 운영 역할은 변경하지 않는다.
3. Preview용 [Supabase Auth Admin API](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)로 계정의 기존 `app_metadata`를 보존하면서 `ipasscare_tester: true`와 `ipasscare_test_branch: "<가상 지점 ID>"`를 함께 설정한다. 둘째 값은 프로필의 `branch_id`와 정확히 같아야 한다. `user_metadata`로는 권한을 받을 수 없다. 관리자 키는 서버에서만 사용한다.
4. 위 안전 검증이 끝나면 **Preview** 빌드에만 `VITE_TESTER_ISOLATION_VERIFIED=true`를 설정하고 `npm run build:preview`로 별도 호스트에 배포한다. 기본값은 꺼짐이다. 켜진 빌드는 지정된 `IPASSCARE-develop` 프로젝트만 허용하며, 운영이나 다른 프로젝트를 대상으로 빌드하면 설정 오류가 난다. 로컬 Preview 확인은 `npm run dev:preview`.
5. **운영** 빌드의 `VITE_TESTER_PREVIEW_URL`에 승인된 별도 Preview HTTPS 주소를 설정한다. 운영 관리자 로그인에 **테스트 로그인** 링크가 보이고 Preview `/tester`로 이동한다. 설정하지 않으면 운영 로그인은 그대로다.

운영 호스트의 `/tester`는 활성화되지 않는다. 테스트 로그인은 운영으로 보내지거나 운영 세션을 공유하지 않는다. 테스트가 끝나면 Preview 계정을 비활성화하거나 권한을 제거한다.
