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
