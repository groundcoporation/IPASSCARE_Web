# 셔틀 UI·지도 경계

- `views/AdminShuttleTab.tsx`: 기존 통합 관리·노선/배정 편집과 관제 지도. 이번 단위는 노선 편집 updateForm callback 안정화 및 정류장 지도 분리다. 서버 쓰기/실제 운행을 변경하지 않는다.
- `components/SpotLocationPicker.tsx`: 정류장 위치 지정 지도. 기존 UI/서울 기본 중심을 유지하며 지도 초기화는 Client ID에만 의존한다. 현재 좌표와 onPick은 ref로 읽어 좌표 입력/콜백 변경마다 지도를 다시 만들지 않는다.
- `model/spotPosition.ts`: 공란/0을 기존 미지정 규칙으로 유지하고 유한한 위경도 범위를 검사한다. 잘못된 좌표 입력 시 기존 마커를 숨기며 다음 정상 입력에서 다시 맞춘다.

## 이벤트 수명

- SDK가 늦게 로드돼도 최초 값 대신 최신 좌표를 사용한다. 클릭/드래그는 해당 지도 인스턴스가 현재 살아 있을 때만 최신 onPick을 호출한다.
- cleanup은 클릭/dragend listener와 script load/error listener를 해제하고 소유 마커를 지도에서 분리한다. 이전 callback이 큐에 남아 실행돼도 취소/소유 지도 검사를 통과하지 못한다. shared SDK script는 다른 지도도 쓸 수 있으므로 제거하지 않는다.
- SDK 내부 Map 객체의 완전한 destroy/전역 SDK 회수는 이번에 구현/보장하지 않았다. Client ID 동적 교체에 따른 SDK 재인증/재다운로드도 검증 대상이 아니다. 환경 키 변경 시 전체 서버/브라우저 재시작으로 별도 검수해야 한다.
- 노선 편집 updateForm은 setForm을 의존하는 안정적 callback이다. 필드 입력마다 effect가 재실행되지 않으며 지점/노선 ID/실제 setter 변경에 따라 조회한다. 조회 실패가 이전 편집창 정리 후 도착하면 오래된 오류 안내를 띄우지 않는다.

## 검증·남은 범위

- `npm run test:shuttle-map`: 실제 지도/네트워크 연결 없이 SDK 모의 객체로 지도 생성 횟수·최신 값·listener 해제·늦은 callback·공유 script·좌표 동기화를 확인한다. 실제 지도 화면/외부 SDK/브라우저와 동일한 전체 동작을 보장하지 않는다.
- 노선/정류장/배정 서버 쓰기·권한·동시성·실제 운행·관제 지도 수명·다른 큰 화면 분리는 별도 미완료 항목이다. 기존 로드 오류의 SHUTTLE_ROUTE_SAVE_FAILED 코드도 이번에 일괄 변경하지 않았다.
