begin;

-- 앱 자녀 한 명이 웹 학생 관리 행 여러 개에 연결되면 수업·청구·정류장
-- 설정의 기준 학생이 갈라집니다. 앱 미연결 학생의 null 값은 허용합니다.
create unique index if not exists academy_students_child_id_unique
  on public.academy_students(child_id)
  where child_id is not null;

commit;
