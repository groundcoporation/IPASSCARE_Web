/** Shared error contract. Keep app/web copies identical; never show raw server messages. */
export const errorMessages = {
  CONFIG_INVALID: "실행 환경 설정이 없거나 서로 일치하지 않습니다. 환경별 설정을 확인해 주세요.",
  NOTICE_INPUT_INVALID: "공지 제목·내용·대상 지점과 수정/삭제 대상을 확인해 주세요.",
  NOTICE_WRITE_UNCONFIRMED: "공지 저장 또는 삭제 결과를 확인하지 못했습니다. 이미 반영되었을 수 있으므로 반복 실행하지 말고 공지 목록을 다시 조회해 주세요.",
  NOTICE_PUSH_PARTIAL: "공지 저장 응답은 확인했지만 푸시 일부가 실패했거나 발송 결과를 확인하지 못했습니다. 공지를 다시 등록하거나 즉시 재발송하지 말고 공지·알림 이력을 확인해 주세요.",
  NOTICE_REFRESH_FAILED: "공지 변경 응답은 확인했지만 최신 목록을 불러오지 못했습니다. 변경을 반복하지 말고 목록을 다시 조회해 주세요.",
  CLASS_WRITE_INPUT_INVALID: "수업명·지점·강사·요일·시간·정원을 확인해 주세요. 종료 시각은 시작 이후여야 하며 정원은 공란 또는 1명 이상의 정수여야 합니다.",
  CLASS_WRITE_UNCONFIRMED: "수업 저장 또는 삭제 결과를 확인하지 못했습니다. 이미 반영되었을 수 있으므로 반복 실행하지 말고 수업과 관련 배정·청구 내역을 다시 조회해 주세요.",
  CLASS_WRITE_REFRESH_FAILED: "수업 변경 응답은 확인했지만 최신 목록을 불러오지 못했습니다. 변경을 반복하지 말고 수업 목록을 다시 조회해 주세요.",
  REFERRAL_LOAD_FAILED: "추천 계보 또는 포인트 기록을 불러오지 못했습니다. 조회 권한과 서버 상태를 확인한 후 다시 조회해 주세요.",
  CLASS_MANAGEMENT_LOAD_FAILED: "수업과 강사 목록을 모두 불러오지 못했습니다. 지점·조회 권한과 서버 상태를 확인한 후 다시 조회해 주세요.",
  DASHBOARD_LOAD_FAILED: "대시보드 정보를 모두 불러오지 못했습니다. 지점·조회 권한과 서버 상태를 확인한 후 다시 조회해 주세요.",
  NOTICE_LOAD_FAILED: "공지 목록을 불러오지 못했습니다. 지점·조회 권한과 서버 상태를 확인한 후 다시 조회해 주세요.",
  ADMIN_PARTNER_INPUT_INVALID: "브랜드명·이미지·표시 순서와 수정/삭제 대상을 확인해 주세요. 이미지는 PNG/JPEG/SVG/WebP/GIF, 10MB 이하여야 합니다.",
  ADMIN_PARTNER_UPLOAD_UNCONFIRMED: "이미지 업로드 결과를 확인하지 못했습니다. 파일이 저장되었을 수 있으며 브랜드 정보 저장은 시작하지 않았습니다. 반복 업로드하지 말고 저장소를 확인해 주세요.",
  ADMIN_PARTNER_SAVE_PARTIAL: "이미지 업로드 응답은 확인했지만 브랜드 정보 저장을 끝내지 못했거나 결과가 불명확합니다. 파일과 DB를 확인한 후 진행해 주세요. 파일은 자동 삭제하지 않았습니다.",
  ADMIN_PARTNER_WRITE_UNCONFIRMED: "브랜드 저장 또는 삭제 결과를 확인하지 못했습니다. 이미 반영되었을 수 있으므로 반복 실행하지 말고 목록을 다시 조회해 주세요.",
  ADMIN_PARTNER_REFRESH_FAILED: "브랜드 변경 응답은 확인했지만 최신 목록을 불러오지 못했습니다. 변경을 반복하지 말고 목록을 다시 조회해 주세요.",
  ADMIN_CONTENT_LOAD_FAILED: "관리자 콘텐츠 또는 설정을 불러오지 못했습니다. 조회 권한과 서버 상태를 확인한 후 다시 조회해 주세요.",
  ADMIN_VIDEO_INPUT_INVALID: "영상 제목(150자 이내)·URL·카테고리와 수정/삭제 대상을 확인해 주세요.",
  ADMIN_VIDEO_WRITE_UNCONFIRMED: "영상 저장 또는 삭제 결과를 확인하지 못했습니다. 이미 반영되었을 수 있으므로 반복 실행하지 말고 목록을 다시 조회해 주세요.",
  ADMIN_VIDEO_REFRESH_FAILED: "영상 변경 응답은 확인했지만 최신 목록을 불러오지 못했습니다. 변경을 반복하지 말고 목록을 다시 조회해 주세요.",
  ADMIN_SETTINGS_INPUT_INVALID: "설정 금액은 1원 이상의 정확한 정수로 입력해 주세요. 공란·소수·음수·지수 표기·0원은 저장할 수 없습니다.",
  ADMIN_SETTINGS_SAVE_UNCONFIRMED: "설정 저장 결과를 확인하지 못했습니다. 이미 반영되었을 수 있으므로 반복 저장하지 말고 설정을 다시 조회해 주세요.",
  LOCAL_EXTERNAL_DISABLED: "로컬 테스트에서는 실제 결제·외부 전송을 차단합니다. 테스트 전용 mock으로 검증해 주세요.",
  PREVIEW_EXTERNAL_DISABLED: "테스트 환경에서는 실제 결제·환불·외부 전송을 사용할 수 없습니다.",
  PAYMENT_START_FAILED: "결제창을 준비하지 못했습니다. 기존 결제 내역을 확인한 후 다시 시도해 주세요.",
  SMS_SEND_FAILED: "문자 처리 결과를 확인하지 못했습니다. 발송 이력을 확인하고 즉시 다시 발송하지 마세요.",
  SHUTTLE_TRACKING_FAILED: "위치 전송 상태를 확인하지 못했습니다. 네트워크와 위치 권한을 확인해 주세요.",
  SHUTTLE_TRACKING_NOT_READY: "백그라운드 위치 추적을 준비하지 못했습니다. 위치 항상 허용과 운행 상태를 확인한 후 다시 시도해 주세요.",
  SHUTTLE_ROUTE_SAVE_FAILED: "셔틀 노선을 저장하지 못했습니다. 수업 일정과 최신 저장 상태를 확인해 주세요.",
  UNKNOWN_ERROR: "작업을 완료하지 못했습니다. 상태를 확인해 주세요.",
  EXCEL_EXPORT_FAILED: "Excel 파일을 만들거나 다운로드를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  EXCEL_IMPORT_READ_FAILED: "Excel 파일을 읽지 못했습니다. 파일 형식과 첫 번째 시트를 확인해 주세요. 학생 등록은 시작하지 않았습니다.",
  STUDENT_IMPORT_REVIEW_REQUIRED: "일괄 등록을 끝내지 못했거나 일부 결과를 확인하지 못했습니다. 이미 학생이 등록되었을 수 있으므로 파일을 다시 올리지 말고 학생 목록과 수업·이용권 배정을 먼저 확인해 주세요.",
  STUDENT_IMPORT_INVALID: "일괄 등록 조건을 확인해 주세요. 대상 지점, 파일 내 출결번호 중복, 날짜, 지점별 수업·요금제 이름과 보호자 연결이 명확해야 합니다. 학생 등록은 시작하지 않았습니다.",
  STUDENT_IMPORT_DUPLICATE: "선택한 지점에 같은 출결번호가 이미 있습니다. 기존 학생과 배정을 먼저 확인해 주세요. 이번 파일의 학생 등록은 시작하지 않았습니다.",
  STUDENT_LOAD_FAILED: "학생 목록과 연결 정보를 불러오지 못했습니다. 잠시 후 다시 조회해 주세요.",
  STUDENT_SAVE_FAILED: "학생 정보를 저장하지 못했습니다. 입력 내용과 권한을 확인해 주세요.",
  STUDENT_SAVE_UNCONFIRMED: "학생 정보 저장 결과를 확인하지 못했습니다. 다시 등록하거나 반복 저장하지 말고 학생 목록과 연결 정보를 먼저 조회해 주세요.",
  STUDENT_CLASSES_SAVE_PARTIAL: "학생 기본 정보는 저장되었지만 수업 배정이 완료되지 않았을 수 있습니다. 다시 등록하지 말고 학생의 수업·이용권 배정 상태를 먼저 확인해 주세요.",
  STUDENT_PICKUP_SAVE_PARTIAL: "학생 기본 정보는 저장되었지만 정류장 설정의 처리 결과를 확인하지 못했습니다. 수업·청구 계획은 아직 저장하지 않았습니다. 정류장 설정과 권한·서버 배포 상태를 확인해 주세요.",
  STUDENT_PLAN_SAVE_PARTIAL: "학생 기본 정보와 정류장 설정은 저장되었습니다. 수업·청구 계획의 처리 결과를 확인하고 권한·서버 배포 상태를 점검해 주세요. 상태 확인 전에는 반복 저장하지 마세요.",
  WITHDRAWAL_LOAD_FAILED: "탈퇴 이력과 환불 정보를 불러오지 못했습니다. 잠시 후 다시 조회해 주세요.",
  STUDENT_ARCHIVE_UNCONFIRMED: "재원 명부 제외 결과를 확인하지 못했습니다. 같은 처리를 반복하지 말고 학생 목록과 탈퇴 이력을 먼저 조회해 주세요.",
  REFUND_RECORD_SAVE_UNCONFIRMED: "환불 정산 기록의 저장 결과를 확인하지 못했습니다. 같은 저장을 반복하지 말고 탈퇴 이력을 먼저 조회해 주세요. 이 기능은 실제 환불 결제를 실행하지 않습니다.",
  STUDENT_ACTION_REFRESH_FAILED: "변경은 저장되었지만 최신 목록을 불러오지 못했습니다. 변경을 다시 실행하지 말고 학생 목록과 탈퇴 이력을 새로 조회해 주세요.",
  AUTH_REQUIRED: "다시 로그인해 주세요.",
  PERMISSION_DENIED: "이 작업을 처리할 권한이 없습니다.",
  NETWORK_ERROR: "서버 응답을 확인하지 못했습니다. 처리 내역을 확인한 후 다시 시도해 주세요.",
  SERVER_UPDATE_REQUIRED: "서버 업데이트가 필요합니다. 관리자에게 문의해 주세요.",
  CONFLICT_ERROR: "정보가 변경되었거나 이미 처리되었습니다. 최신 상태를 확인해 주세요.",
  INPUT_INVALID: "입력한 값의 형식이 올바르지 않습니다. 날짜, 금액 및 필수 선택 항목을 확인해 주세요.",
  REQUIRED_DATA_MISSING: "저장에 필요한 정보가 빠져 있습니다. 필수 입력 항목을 확인해 주세요.",
  DATA_REFERENCE_ERROR: "연결된 정보가 없거나 변경되었습니다. 학생, 지점 또는 이용권 정보를 다시 선택해 주세요.",
  DB_VALIDATION_FAILED: "현재 상태에서는 요청을 처리할 수 없습니다. 최신 정보를 다시 조회한 뒤 안내된 조건을 확인해 주세요.",
  ATT_CHILD_INVALID: "현재 지점의 재원 자녀가 아닙니다. 다시 검색해 주세요.",
  ATT_RESERVATION_INVALID: "예약 정보가 변경되었습니다. 다시 검색해 주세요.",
  ATT_TOO_SOON: "등원 처리 후 1분이 지나야 하원 처리할 수 있습니다.",
  ATT_SAVE_FAILED: "출결을 완료하지 못했습니다. 상태를 다시 조회한 후 시도해 주세요.",
  ATTENDANCE_LEDGER_LOAD_FAILED: "월별 출결 장부를 불러오지 못했습니다. 지점·기간과 조회 권한을 확인하고 다시 조회해 주세요.",
  ATT_LEDGER_WRITE_UNCONFIRMED: "출석 등록 또는 취소 결과를 확인하지 못했습니다. 이용권이 이미 차감·복구되었을 수 있으므로 같은 요청을 반복하지 말고 출결 장부와 이용권 내역을 먼저 조회해 주세요.",
  ATT_TIMELINE_REVIEW_REQUIRED: "출결 상태 변경을 끝내지 못했거나 일부 결과를 확인하지 못했습니다. 출결·예약·이용권 기록이 이미 변경되었을 수 있으므로 같은 작업을 반복하지 말고 최신 내역을 먼저 조회해 주세요.",
  ATT_LEDGER_REFRESH_FAILED: "출결 처리는 완료되었지만 최신 장부를 불러오지 못했습니다. 출석 등록·취소를 반복하지 말고 출결과 이용권 내역을 새로 조회해 주세요.",
  ATTENDANCE_DAILY_LOAD_FAILED: "실시간 출결 대상과 기록을 불러오지 못했습니다. 지점·날짜와 조회 권한을 확인하고 다시 조회해 주세요.",
  ATTENDANCE_CALENDAR_LOAD_FAILED: "월간 출결 달력을 불러오지 못했습니다. 지점·기간과 조회 권한을 확인하고 다시 조회해 주세요.",
  ATT_UPDATE_REQUIRED: "출결 서버 업데이트가 필요합니다. 관리자에게 문의해 주세요.",
  ATT_NOTIFICATION_FAILED: "출결은 저장되었지만 알림을 전송하지 못했습니다. 출결을 다시 누르지 마세요.",
  JOURNAL_LOAD_FAILED: "학습·상담일지를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.",
  JOURNAL_SAVE_FAILED: "일지를 저장하지 못했습니다. 저장 상태를 확인한 후 다시 시도해 주세요.",
  JOURNAL_SAVE_UNCONFIRMED: "일지 저장 또는 공개 결과를 확인하지 못했습니다. 같은 작업을 반복하지 말고 최신 일지와 공개 상태를 먼저 조회해 주세요.",
  JOURNAL_DELETE_UNCONFIRMED: "일지 삭제 결과를 확인하지 못했습니다. 삭제를 반복하지 말고 최신 목록을 먼저 조회해 주세요.",
  JOURNAL_NOTIFICATION_FAILED: "일지는 저장되었지만 알림을 전송하지 못했습니다. 일지를 다시 작성하지 마세요.",
  NOTICE_SAVE_FAILED: "공지 저장 결과를 확인하지 못했습니다. 공지 목록을 확인한 후 다시 시도해 주세요.",
  NOTICE_NOTIFICATION_FAILED: "공지는 저장되었지만 알림 결과를 확인하지 못했습니다. 공지를 다시 등록하지 마세요.",
  STAFF_LOAD_FAILED: "직원 목록을 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.",
  STAFF_SAVE_FAILED: "직원 정보 저장 결과를 확인하지 못했습니다. 목록을 확인한 후 다시 시도해 주세요.",
  STAFF_REMOVE_FAILED: "직원 삭제 또는 권한 회수 결과를 확인하지 못했습니다. 현재 목록과 권한을 먼저 확인해 주세요.",
  BILL_LOAD_FAILED: "청구내역을 불러오지 못했습니다. 잠시 후 다시 조회해 주세요.",
  BILL_CREATE_FAILED: "청구서 처리를 완료하지 못했습니다. 일부 생성되었을 수 있으니 청구내역을 먼저 확인해 주세요.",
  BILL_CREATE_UNCONFIRMED: "청구서 생성 결과를 확인하지 못해 나머지 요청을 중단했습니다. 이미 생성됐을 수 있으니 같은 청구를 반복하지 말고 청구내역을 먼저 조회해 주세요.",
  BILL_SEND_FAILED: "청구서 발송 결과를 확인하지 못했습니다. 청구내역을 확인한 후 다시 시도해 주세요.",
  BILL_DELIVERY_REFRESH_FAILED: "발송 요청 후 최신 내역을 불러오지 못했습니다. 발송을 반복하지 말고 청구내역과 알림 이력을 새로 조회해 주세요.",
  BILL_NOTIFICATION_FAILED: "청구서는 저장되었지만 알림을 보내지 못했습니다. 청구서를 다시 만들지 말고 납부 알림을 이용해 주세요.",
  BILL_REMINDER_FAILED: "납부 알림 처리 결과를 확인하지 못했습니다. 발송 내역을 확인하고 즉시 반복 발송하지 마세요.",
  BILL_DELETE_FAILED: "청구서를 삭제하지 못했습니다. 결제 여부와 최신 상태를 확인해 주세요.",
  BILL_DELETE_UNCONFIRMED: "청구서 삭제 결과를 확인하지 못했습니다. 삭제를 반복하지 말고 청구내역과 연결된 앱 청구 상태를 먼저 조회해 주세요.",
  BILL_ACTION_REFRESH_FAILED: "청구서 변경은 완료되었지만 최신 화면을 불러오지 못했습니다. 같은 작업을 반복하지 말고 청구내역과 지급 이용권을 새로 조회해 주세요.",
  BILL_FREE_FAILED: "무료 처리 결과를 확인하지 못했습니다. 청구내역과 지급 이용권을 먼저 확인해 주세요.",
  BILL_SETTING_FAILED: "자동 청구 설정을 저장하지 못했습니다. 설정을 다시 조회해 주세요.",
  BILL_AUTOMATION_NOT_READY: "현재 지점의 자동 청구 설정을 먼저 조회해 주세요. 조회가 완료되지 않았거나 이전 저장 결과가 불확실하면 페이지를 새로고침해 상태를 확인한 후 변경해 주세요.",
  BILL_AUTOMATION_SAVE_UNCONFIRMED: "자동 청구 설정의 저장 결과를 확인하지 못했습니다. 같은 변경을 반복하지 말고 페이지를 새로고침해 자동 청구 상태와 대상 학생을 먼저 확인해 주세요.",
  BILL_PLAN_CHANGE_UNCONFIRMED: "청구 계획 변경 결과를 확인하지 못했습니다. 같은 작업을 반복하지 말고 학생의 청구 계획과 수납 내역을 먼저 조회해 주세요.",
  BILL_PLAN_REFRESH_FAILED: "청구 계획 변경은 저장되었지만 최신 화면을 불러오지 못했습니다. 변경을 다시 실행하지 말고 목록과 상세 정보를 새로 조회해 주세요.",
  BILL_NOT_FOUND: "청구서를 찾을 수 없습니다.",
  BILL_NOT_FREE: "앱 발송 전인 미납 0원 청구서만 무료 처리할 수 있습니다.",
  BILL_PAYMENT_EXISTS: "기존 결제 또는 결제 예정 내역을 먼저 확인해 주세요.",
  BILL_STUDENT_INVALID: "학생의 지점 정보를 확인해 주세요.",
  BILL_CHILD_INVALID: "재원 자녀 정보를 확인해 주세요.",
  BILL_PARENT_INVALID: "활성 학부모 계정 연결이 필요합니다.",
  BILL_OPTION_INVALID: "지점의 이용권 옵션을 확인해 주세요.",
  BILL_MONTH_INVALID: "청구 월을 확인해 주세요.",
  BILL_PLAN_LOCKED: "이미 청구·결제·갱신 처리가 시작된 이용권입니다. 기존 청구내역을 확인하고 필요한 경우 추가 청구를 이용해 주세요.",
  BILL_MONTH_CLOSED: "이미 지난 달의 청구 예정 이용권은 변경할 수 없습니다. 현재 달 또는 다음 달을 선택해 주세요.",
  BILL_DUPLICATE_OPTION: "같은 이용권이 이번 달 청구에 이미 포함되어 있습니다. 다른 이용권을 선택해 주세요.",
  PAYMENT_SAVE_FAILED: "수납 등록 결과를 확인하지 못했습니다. 결제 내역을 먼저 확인하고 중복 등록하지 마세요.",
  OFFLINE_PAYMENT_LOAD_FAILED: "현장결제 내역을 불러오지 못했습니다. 지점과 조회 상태를 확인한 후 다시 조회해 주세요.",
  PAYMENT_HISTORY_LOAD_FAILED: "결제 내역과 연결 정보를 불러오지 못했습니다. 지점과 조회 권한을 확인한 후 다시 조회해 주세요.",
  SCHEDULE_LOAD_FAILED: "시간표와 예약 정보를 불러오지 못했습니다. 지점·기간과 조회 권한을 확인한 후 다시 조회해 주세요.",
  PAYMENT_CANCEL_FAILED: "결제 취소 결과를 확인하지 못했습니다. 결제 상태와 이용권 회수 내역을 먼저 확인하고 중복 취소하지 마세요.",
  PAYMENT_CANCEL_UNSUPPORTED: "이 결제는 웹에서 안전하게 취소할 수 있는 범위가 아닙니다. 부분취소·기취소 금액이 있는 거래·거래번호 없는 온라인 결제는 담당자가 원거래와 이용권을 확인해야 합니다. 임의로 DB 상태를 변경하지 마세요.",
  PAYMENT_CANCEL_REFRESH_FAILED: "서버의 취소 처리 응답은 확인했지만 최신 내역을 불러오지 못했습니다. 취소 요청을 반복하지 말고 원거래·결제·이용권 내역을 다시 조회해 주세요.",
  PAYMENT_CONFIRM_PENDING: "결제 예정 내역은 등록됐지만 수납 완료 결과를 확인하지 못했습니다. 기존 내역을 확인하고 새 결제를 등록하지 마세요.",
  PAYMENT_PACKAGE_PENDING: "수납은 완료됐지만 이용권 지급을 확인하지 못했습니다. 다시 결제하지 말고 지급 내역을 확인해 주세요.",
  PAYMENT_REFRESH_FAILED: "수납 요청 후 최신 장부를 불러오지 못했습니다. 새 결제를 등록하지 말고 기존 결제·청구·이용권 내역을 새로 조회해 주세요.",
  OFFLINE_PAYMENT_CANCEL_UNCONFIRMED: "현장결제 취소 결과를 확인하지 못했습니다. 같은 요청을 반복하지 말고 결제·청구·이용권 상태를 먼저 조회해 주세요. 실제 환불은 별도로 확인해야 합니다.",
  OFFLINE_PAYMENT_REFRESH_FAILED: "현장결제 처리 후 최신 목록을 불러오지 못했습니다. 완료·취소 요청을 반복하지 말고 기존 결제·청구·이용권 상태를 새로 조회해 주세요.",
  PACKAGE_CATALOG_ACTION_FAILED: "이용권의 판매 상태를 변경하지 못했습니다. 최신 상품과 청구 연결 상태를 확인해 주세요.",
  PACKAGE_GRANT_PENDING: "이용권 지급 결과를 확인하지 못했습니다. 같은 요청 ID로 결과를 조회하고 새 지급 요청을 만들지 마세요.",
  PACKAGE_GRANT_STATUS_FAILED: "이용권 지급 결과를 조회하지 못했습니다. 기존 요청 ID를 유지하고 잠시 후 다시 확인해 주세요.",
  PACKAGE_CATALOG_NOT_FOUND: "이용권 정보를 찾을 수 없습니다. 목록을 새로 불러와 주세요.",
  PACKAGE_OPTION_IN_USE: "청구·결제·지급 내역에 사용된 옵션은 삭제할 수 없습니다. 옵션은 그대로 두고 이름·가격·횟수만 수정해 주세요.",
} as const;

export type AppErrorCode = keyof typeof errorMessages;
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  constructor(code: AppErrorCode, cause?: unknown) {
    super(errorMessages[code], { cause });
    this.name = "AppError";
    this.code = code;
    this.userMessage = errorMessages[code];
  }
}
function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}
function knownCode(value: unknown): value is AppErrorCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(errorMessages, value);
}
export function normalizeError(error: unknown, fallback: AppErrorCode = "UNKNOWN_ERROR"): AppError {
  if (error instanceof AppError) return error;
  const message = field(error, "message");
  const marker = typeof message === "string" ? message.match(/^\[([A-Z_]+)\]/)?.[1] : undefined;
  const code = field(error, "code");
  if (knownCode(code)) return new AppError(code, error);
  if (knownCode(marker)) return new AppError(marker, error);
  const status = field(error, "status") ?? field(field(error, "context"), "status");
  if (status === 401 || code === "PGRST301") return new AppError("AUTH_REQUIRED", error);
  if (status === 403 || code === "42501") return new AppError("PERMISSION_DENIED", error);
  if (["PGRST202", "PGRST204", "42703", "42883"].includes(String(code))) return new AppError("SERVER_UPDATE_REQUIRED", error);
  if (code === "23505" || status === 409) return new AppError("CONFLICT_ERROR", error);
  if (code === "23502") return new AppError("REQUIRED_DATA_MISSING", error);
  if (code === "23503") return new AppError("DATA_REFERENCE_ERROR", error);
  if (["22P02", "22007", "22008"].includes(String(code))) return new AppError("INPUT_INVALID", error);
  if (code === "P0001" && typeof message === "string") {
    if (/같은 이용권.*이미 포함|기본 청구 또는 추가 청구/.test(message)) return new AppError("BILL_DUPLICATE_OPTION", error);
    if (/이미 청구|갱신.*완료|청구.*확정|결제.*시작/.test(message)) return new AppError("BILL_PLAN_LOCKED", error);
    if (/지난 달|지난달/.test(message)) return new AppError("BILL_MONTH_CLOSED", error);
    if (/로그인/.test(message)) return new AppError("AUTH_REQUIRED", error);
    if (/권한|다른 지점/.test(message)) return new AppError("PERMISSION_DENIED", error);
    if (/학생을 찾|학생.*정보/.test(message)) return new AppError("BILL_STUDENT_INVALID", error);
    if (/이용권|옵션/.test(message)) return new AppError("BILL_OPTION_INVALID", error);
    return new AppError("DB_VALIDATION_FAILED", error);
  }
  // Preserve domain-specific warnings about possibly committed writes.
  if (fallback === "UNKNOWN_ERROR" && typeof message === "string" && /failed to fetch|network request failed|networkerror|timeout/i.test(message)) {
    return new AppError("NETWORK_ERROR", error);
  }
  return new AppError(fallback, error);
}
export function formatError(error: AppError): string {
  const sentences = error.userMessage.split(/\.\s+/).map((value) => value.trim()).filter(Boolean);
  const problem = sentences[0]?.replace(/\.$/, "") || "요청을 처리하지 못했습니다";
  const nextAction = sentences.slice(1).join(". ").replace(/\.$/, "");
  return nextAction
    ? `[${error.code}]\n문제: ${problem}.\n확인: ${nextAction}.`
    : `[${error.code}]\n안내: ${problem}.`;
}
export interface ErrorContext {
  operation: string;
  transactionId?: string;
}
export function logError(error: AppError, context: ErrorContext): void {
  // Allowlist only. Do not log cause, raw body, token, name, phone, or email.
  console.error("[AppError]", {
    code: error.code,
    operation: /^[a-zA-Z0-9_.-]{1,80}$/.test(context.operation) ? context.operation : "unknown",
    transactionId: context.transactionId && /^[0-9a-f-]{36}$/i.test(context.transactionId) ? context.transactionId : undefined,
  });
}
/** Decode structured Edge errors without trusting server-provided user text. */
export async function normalizeAsyncError(error: unknown, fallback: AppErrorCode): Promise<AppError> {
  if (error instanceof AppError) return error;
  const context = field(error, "context");
  if (context && typeof field(context, "clone") === "function") {
    try {
      const response = context as { clone(): { json(): Promise<unknown> }; status?: number };
      const body = await response.clone().json();
      const bodyCode = field(body, "code");
      const nestedCode = field(field(body, "error"), "code");
      if (knownCode(bodyCode) || knownCode(nestedCode)) return new AppError(knownCode(bodyCode) ? bodyCode : nestedCode as AppErrorCode, error);
      return normalizeError({ code: bodyCode, message: field(body, "error") ?? field(body, "message"), status: response.status }, fallback);
    } catch {
      // Non-JSON responses are normalized using the original status below.
    }
  }
  return normalizeError(error, fallback);
}
