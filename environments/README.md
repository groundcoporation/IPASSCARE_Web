# 웹 환경 설정

이 폴더의 .env.<환경>.example을 .env.<환경>.local로 복사하고 값을 입력합니다.
실제 .local 파일은 Git에 포함하지 않습니다.

- npm run dev / dev:production: production (운영 DB 연결)
- npm run dev:local: development (Docker 로컬 DB 연결)
- npm run dev:preview / build:preview: preview
- npm run build: production

루트의 기존 .env.local은 읽지 않습니다. 배포 플랫폼의 환경변수도 설정할 수 있습니다.
APP_ENV, PROJECT_REF, URL, public key가 모두 필요하며 모드와 환경이 다르면 중단합니다.
운영 DB를 Preview나 development에 사용하면 중단합니다.

`npm run dev`는 로컬 PC에서 웹을 실행하지만 운영 데이터에 연결합니다.
저장·삭제·청구·알림·결제 기능은 실제 운영에 영향을 줄 수 있습니다.
부하 테스트와 임의 데이터 생성은 반드시 `npm run dev:local`에서 진행합니다.
실행 명령 변경 후 기존 Vite 서버를 종료하고 다시 시작해야 합니다.

환경 검증은 Vite가 수행하고 공개 설정만 브라우저에 전달합니다.
서버 전용 CommonJS 검증 코드는 브라우저에서 실행하지 않습니다.

통합 절차: C:/groundcorporation/IPASSCARE/docs/environment-separation.md
환경별 DB 생성·스키마 적용·PG/문자/푸시 격리는 별도 확인 후 진행합니다.
