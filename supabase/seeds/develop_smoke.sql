-- Run only through seed-develop-smoke.ps1 (fixed Develop project ref).
begin;
set local timezone = 'Asia/Seoul';
set local lock_timeout = '5s';
set local statement_timeout = '40s';
create temporary table seed_accounts (slug text primary key, id uuid, email text) on commit drop;
insert into seed_accounts values __ACCOUNT_VALUES__;

create temporary table seed_branches on commit drop as
select n, 'devsmoke-__BATCH__-' || n as branch_id,
  gen_random_uuid() as schedule_id, gen_random_uuid() as package_id, gen_random_uuid() as option_id
from generate_series(1,2) n;
insert into public.branches(id,name)
select branch_id, '[DEV 테스트 __BATCH__] ' || case when n=1 then '본점' else '별관' end from seed_branches;

insert into public.users(id,username,email,name,role,branch_id,status)
select a.id, split_part(a.email,'@',1), a.email,
  '[DEV] ' || case a.slug
    when 'admin' then '관리자' when 'director-a' then '본점 원장'
    when 'director-b' then '별관 원장' when 'teacher' then '본점 선생님'
    when 'driver' then '본점 기사' when 'parent-a' then '본점 학부모'
    when 'parent-b' then '별관 학부모' else '페이지 테스트 학부모' end,
  case a.slug when 'admin' then 'admin' when 'director-a' then 'director' when 'director-b' then 'director'
    when 'teacher' then 'teacher' when 'driver' then 'driver' else 'user' end,
  case when a.slug <> 'admin' then b.branch_id end, 'active'
from seed_accounts a join seed_branches b on b.n=case when a.slug in ('director-b','parent-b') then 2 else 1 end
on conflict(id) do update set username=excluded.username,email=excluded.email,name=excluded.name,
  role=excluded.role,branch_id=excluded.branch_id,status=excluded.status;

create temporary table seed_children on commit drop as
select g.n, b.branch_id, b.schedule_id, b.package_id, b.option_id, a.id as parent_id,
  gen_random_uuid() as child_id, gen_random_uuid() as voucher_id,
  gen_random_uuid() as assignment_id, gen_random_uuid() as reservation_id,
  '테스트 원생 ' || lpad(g.n::text,2,'0') as child_name
from generate_series(1,25) as g(n)
join seed_branches b on b.n=case when g.n<=23 then 1 else 2 end
join seed_accounts a on a.slug=case when g.n<=3 then 'parent-a' when g.n<=23 then 'parent-pages' else 'parent-b' end;

insert into public.children(id,parent_id,child_name,child_birth,branch_id)
select child_id,parent_id,child_name,'2018-01-01',branch_id from seed_children;
update public.academy_students s set is_sms_enabled=false
from seed_children c where s.child_id=c.child_id and s.branch_id=c.branch_id;

insert into public.academy_teachers(id,branch_id,name,email)
select a.id,b.branch_id,'DEV 선생님',a.email
from seed_branches b cross join seed_accounts a where b.n=1 and a.slug='teacher';
insert into public.class_schedules(id,branch_id,target_class,day_of_week,start_time,end_time,max_people,teacher_id,is_active)
select b.schedule_id,b.branch_id,'DEV 체육 수업',
  (array['일','월','화','수','목','금','토'])[extract(dow from current_date)::int+1],
  '15:00'::time,'16:00'::time,30,case when b.n=1 then a.id end,true
from seed_branches b cross join seed_accounts a where a.slug='teacher';
insert into public.packages(id,branch_id,name,voucher_type)
select package_id,branch_id,'DEV 주 2회 이용권','lesson' from seed_branches;
insert into public.package_options(id,package_id,branch_id,label,price,total_count)
select option_id,package_id,branch_id,'DEV 30회',0,30 from seed_branches;
insert into public.user_packages(id,user_id,child_id,package_id,option_id,branch_id,package_name,
  total_count,remaining_count,status,beneficiary_type,valid_from,valid_until)
select voucher_id,parent_id,child_id,package_id,option_id,branch_id,
  'DEV 주 2회 이용권',30,30,'active','child',current_date,current_date+31 from seed_children;
insert into public.student_schedule_assignments(id,user_id,child_id,branch_id,schedule_id,starts_on)
select assignment_id,parent_id,child_id,branch_id,schedule_id,current_date from seed_children;
insert into public.reservations(id,user_id,child_id,branch_id,schedule_id,package_id,
  assignment_id,class_date,status,attendance_status)
select reservation_id,parent_id,child_id,branch_id,schedule_id,voucher_id,assignment_id,current_date,'confirmed','yet'
from seed_children;

-- One cancellable check-in per branch. No notification or payment calls.
update public.package_usage_logs u set status='consumed',consumed_at=now()
from seed_children c where c.n in (1,24) and u.reservation_id=c.reservation_id
  and u.user_package_id=c.voucher_id and u.status='held';
update public.user_packages p set remaining_count=29 from seed_children c where c.n in (1,24) and p.id=c.voucher_id;
update public.reservations r set attendance_status='등원' from seed_children c where c.n in (1,24) and r.id=c.reservation_id;
insert into public.attendance_logs(child_id,branch_id,date,status,check_in)
select child_id,branch_id,current_date,'등원',now() from seed_children where n in (1,24);

insert into public.shuttle_routes(branch_id,day_of_week,direction,class_schedule_id,name,is_active)
select b.branch_id,s.day_of_week,d.direction,b.schedule_id,'DEV 셔틀 ' || d.label,true
from seed_branches b join public.class_schedules s on s.id=b.schedule_id
cross join (values ('pickup','등원'),('dropoff','하원')) d(direction,label) where b.n=1;
insert into public.shuttle_route_assignments(route_id,child_id,class_schedule_id,direction,display_order)
select r.id,c.child_id,c.schedule_id,r.direction,c.n
from seed_children c join public.shuttle_routes r on r.branch_id=c.branch_id where c.n<=3;
insert into public.shuttle_status(shuttle_id,driver_id,branch_id,is_driving)
select a.id,a.id,b.branch_id,false from seed_accounts a cross join seed_branches b where a.slug='driver' and b.n=1;

insert into public.parent_journal_entries(journal_type,source_id,parent_id,child_id,branch_id,journal_date,title,
  author_name,child_name,class_name,content)
select d.kind,gen_random_uuid(),c.parent_id,c.child_id,c.branch_id,current_date,d.title,
  'DEV 선생님',c.child_name,'DEV 체육 수업',d.content
from seed_children c cross join (values ('study','DEV 학습일지','기초 동작을 연습했습니다.'),
  ('counsel','DEV 상담일지','다음 수업 목표를 확인했습니다.')) d(kind,title,content) where c.n=1;

do $guard$ begin
  if (select count(*) from public.package_usage_logs u join seed_children c on c.reservation_id=u.reservation_id
        where c.n in (1,24) and u.user_package_id=c.voucher_id and u.status='consumed') <> 2
    or (select count(*) from public.children c join seed_children s on s.child_id=c.id) <> 25
    or exists(select 1 from public.academy_students a join seed_children c on c.child_id=a.child_id where a.is_sms_enabled)
  then raise exception 'DEVELOP_SEED_VERIFICATION_FAILED'; end if;
end $guard$;
commit;
