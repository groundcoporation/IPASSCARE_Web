-- Management-menu fixtures and probes: caller always rolls back.
create temporary table tester_menu_context as
select m.*,gen_random_uuid() own_teacher,gen_random_uuid() other_teacher,
  gen_random_uuid() own_class,gen_random_uuid() other_class,
  gen_random_uuid() own_spot,gen_random_uuid() other_spot,
  gen_random_uuid() own_route,gen_random_uuid() other_route,
  gen_random_uuid() own_assignment,gen_random_uuid() other_assignment,
  gen_random_uuid() own_vehicle,gen_random_uuid() other_vehicle
from tester_manual_context m;
grant select on tester_menu_context to authenticated,anon;
insert into public.academy_teachers(id,branch_id,name)
select own_teacher,own_branch,'synthetic-staff-own' from tester_menu_context
union all select other_teacher,other_branch,'synthetic-staff-other' from tester_menu_context;
insert into public.class_schedules(id,branch_id,target_class,day_of_week,start_time,end_time,teacher_id)
select own_class,own_branch,'synthetic-class-own','월',time '15:00',time '16:00',own_teacher from tester_menu_context
union all select other_class,other_branch,'synthetic-class-other','월',time '15:00',time '16:00',other_teacher from tester_menu_context;
insert into public.pickup_spots(id,branch_id,name)
select own_spot,own_branch,'synthetic-spot-own' from tester_menu_context
union all select other_spot,other_branch,'synthetic-spot-other' from tester_menu_context;
insert into public.shuttle_routes(id,branch_id,name,day_of_week,direction,class_schedule_id)
select own_route,own_branch,'synthetic-route-own','월','pickup',own_class from tester_menu_context
union all select other_route,other_branch,'synthetic-route-other','월','pickup',other_class from tester_menu_context;
insert into public.student_schedule_assignments(user_id,child_id,branch_id,schedule_id,starts_on)
select own_parent,own_child,own_branch,own_class,today from tester_menu_context
union all select other_parent,other_child,other_branch,other_class,today from tester_menu_context;
insert into public.shuttle_route_assignments(id,route_id,child_id,class_schedule_id,direction,pickup_spot_id)
select own_assignment,own_route,own_child,own_class,'pickup',own_spot from tester_menu_context
union all select other_assignment,other_route,other_child,other_class,'pickup',other_spot from tester_menu_context;
insert into public.pickup_settings(child_id,branch_id,area,apartment,detail_location,pickup_spot_id)
select own_child,own_branch,'synthetic','synthetic','synthetic',own_spot from tester_menu_context
union all select other_child,other_branch,'synthetic','synthetic','synthetic',other_spot from tester_menu_context;
insert into public.shuttle_status(shuttle_id,branch_id,is_driving,active_route_id)
select own_vehicle,own_branch,false,own_route from tester_menu_context
union all select other_vehicle,other_branch,false,other_route from tester_menu_context;
insert into public.shuttle_notification_logs(user_id,child_id,branch_id,service_date,direction,event_type,status,route_id)
select own_parent,own_child,own_branch,today,'pickup','departure','pending',own_route from tester_menu_context
union all select other_parent,other_child,other_branch,today,'pickup','departure','pending',other_route from tester_menu_context;
create function pg_temp.tester_reference_error(label text,statement text)
returns void language plpgsql security invoker as $ref$
declare ok boolean:=false; state text;
begin
  begin
    execute statement;
    raise exception using errcode='PZ001',message='TESTER_PROBE_ROLLBACK';
  exception
    when sqlstate 'PZ001' then null;
    when others then state:=sqlstate; ok:=sqlstate='P0001' and split_part(sqlerrm,' ',1)='[DATA_REFERENCE_ERROR]';
  end;
  insert into tester_write_results values(label,ok,state);
end $ref$;
set local role authenticated;
select pg_temp.tester_probe('menu_manual_teacher_create_delete', $probe$
  do $flow$ declare created uuid; begin
    insert into public.academy_teachers(branch_id,name) select own_branch,'synthetic-new' from tester_menu_context returning id into created;
    delete from public.academy_teachers where id=created;
    if exists(select 1 from public.academy_teachers where id=created) then raise exception 'TESTER_MENU_DELETE_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('menu_class_create_delete', $probe$
  do $flow$ declare created uuid; begin
    insert into public.class_schedules(branch_id,target_class,day_of_week,start_time,end_time,teacher_id)
    select own_branch,'synthetic-new','화',time '15:00',time '16:00',own_teacher from tester_menu_context returning id into created;
    delete from public.class_schedules where id=created;
    if exists(select 1 from public.class_schedules where id=created) then raise exception 'TESTER_MENU_DELETE_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('menu_spot_create_delete', $probe$
  do $flow$ declare created uuid; begin
    insert into public.pickup_spots(branch_id,name) select own_branch,'synthetic-new' from tester_menu_context returning id into created;
    delete from public.pickup_spots where id=created;
    if exists(select 1 from public.pickup_spots where id=created) then raise exception 'TESTER_MENU_DELETE_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('menu_academy_teachers_own_read', 'select id from public.academy_teachers where id=(select own_teacher from tester_menu_context)',1);
select pg_temp.tester_probe('menu_academy_teachers_other_read_denied', 'select id from public.academy_teachers where id=(select other_teacher from tester_menu_context)',0);
select pg_temp.tester_probe('menu_class_schedules_own_read', 'select id from public.class_schedules where id=(select own_class from tester_menu_context)',1);
select pg_temp.tester_probe('menu_class_schedules_other_read_denied', 'select id from public.class_schedules where id=(select other_class from tester_menu_context)',0);
select pg_temp.tester_probe('menu_pickup_spots_own_read', 'select id from public.pickup_spots where id=(select own_spot from tester_menu_context)',1);
select pg_temp.tester_probe('menu_pickup_spots_other_read_denied', 'select id from public.pickup_spots where id=(select other_spot from tester_menu_context)',0);
select pg_temp.tester_probe('menu_shuttle_routes_own_read', 'select id from public.shuttle_routes where id=(select own_route from tester_menu_context)',1);
select pg_temp.tester_probe('menu_shuttle_routes_other_read_denied', 'select id from public.shuttle_routes where id=(select other_route from tester_menu_context)',0);
select pg_temp.tester_probe('menu_shuttle_route_assignments_own_read', 'select id from public.shuttle_route_assignments where id=(select own_assignment from tester_menu_context)',1);
select pg_temp.tester_probe('menu_shuttle_route_assignments_other_read_denied', 'select id from public.shuttle_route_assignments where id=(select other_assignment from tester_menu_context)',0);
select pg_temp.tester_probe('menu_pickup_settings_own_read', 'select child_id from public.pickup_settings where child_id=(select own_child from tester_menu_context)',1);
select pg_temp.tester_probe('menu_pickup_settings_other_read_denied', 'select child_id from public.pickup_settings where child_id=(select other_child from tester_menu_context)',0);
select pg_temp.tester_probe('menu_shuttle_status_own_read', 'select shuttle_id from public.shuttle_status where shuttle_id=(select own_vehicle from tester_menu_context)',1);
select pg_temp.tester_probe('menu_shuttle_status_other_read_denied', 'select shuttle_id from public.shuttle_status where shuttle_id=(select other_vehicle from tester_menu_context)',0);
select pg_temp.tester_probe('menu_schedule_assignments_other_read_denied', 'select id from public.student_schedule_assignments where schedule_id=(select other_class from tester_menu_context)',0);
select pg_temp.tester_probe('menu_notification_logs_own_read', 'select id from public.shuttle_notification_logs where route_id=(select own_route from tester_menu_context)',1);
select pg_temp.tester_probe('menu_notification_logs_other_read_denied', 'select id from public.shuttle_notification_logs where route_id=(select other_route from tester_menu_context)',0);
select pg_temp.tester_probe('menu_academy_teachers_own_edit', 'update public.academy_teachers set memo=''synthetic-edited'' where id=(select own_teacher from tester_menu_context)',1);
select pg_temp.tester_probe('menu_academy_teachers_other_edit_denied', 'update public.academy_teachers set memo=''synthetic-edited'' where id=(select other_teacher from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_class_schedules_own_edit', 'update public.class_schedules set target_class=''synthetic-edited'' where id=(select own_class from tester_menu_context)',1);
select pg_temp.tester_probe('menu_class_schedules_other_edit_denied', 'update public.class_schedules set target_class=''synthetic-edited'' where id=(select other_class from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_pickup_spots_own_edit', 'update public.pickup_spots set name=''synthetic-edited'' where id=(select own_spot from tester_menu_context)',1);
select pg_temp.tester_probe('menu_pickup_spots_other_edit_denied', 'update public.pickup_spots set name=''synthetic-edited'' where id=(select other_spot from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_shuttle_routes_own_edit', 'update public.shuttle_routes set name=''synthetic-edited'' where id=(select own_route from tester_menu_context)',1);
select pg_temp.tester_probe('menu_shuttle_routes_other_edit_denied', 'update public.shuttle_routes set name=''synthetic-edited'' where id=(select other_route from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_shuttle_route_assignments_own_edit', 'update public.shuttle_route_assignments set display_order=9 where id=(select own_assignment from tester_menu_context)',1);
select pg_temp.tester_probe('menu_shuttle_route_assignments_other_edit_denied', 'update public.shuttle_route_assignments set display_order=9 where id=(select other_assignment from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_pickup_settings_own_edit', 'update public.pickup_settings set detail_location=''synthetic-edited'' where child_id=(select own_child from tester_menu_context)',1);
select pg_temp.tester_probe('menu_pickup_settings_other_edit_denied', 'update public.pickup_settings set detail_location=''synthetic-edited'' where child_id=(select other_child from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_class_foreign_teacher_denied', 'update public.class_schedules set teacher_id=(select other_teacher from tester_menu_context) where id=(select own_class from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_pickup_foreign_child_denied', 'insert into public.pickup_settings(child_id,branch_id,area,apartment,detail_location) select other_child,own_branch,''synthetic'',''synthetic'',''synthetic'' from tester_menu_context',0,true);
select pg_temp.tester_probe('menu_pickup_foreign_spot_denied', 'update public.pickup_settings set pickup_spot_id=(select other_spot from tester_menu_context) where child_id=(select own_child from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_dropoff_foreign_spot_denied', 'update public.pickup_settings set dropoff_spot_id=(select other_spot from tester_menu_context) where child_id=(select own_child from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_route_foreign_class_denied', 'update public.shuttle_routes set class_schedule_id=(select other_class from tester_menu_context) where id=(select own_route from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_assignment_foreign_route_denied', 'update public.shuttle_route_assignments set route_id=(select other_route from tester_menu_context) where id=(select own_assignment from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_assignment_foreign_child_denied', 'update public.shuttle_route_assignments set child_id=(select other_child from tester_menu_context) where id=(select own_assignment from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_assignment_foreign_spot_denied', 'update public.shuttle_route_assignments set pickup_spot_id=(select other_spot from tester_menu_context) where id=(select own_assignment from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_telemetry_insert_denied', 'insert into public.shuttle_status(shuttle_id,branch_id) select gen_random_uuid(),own_branch from tester_menu_context',0,true);
select pg_temp.tester_probe('menu_telemetry_update_denied', 'update public.shuttle_status set is_driving=true where shuttle_id=(select own_vehicle from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_telemetry_delete_denied', 'delete from public.shuttle_status where shuttle_id=(select own_vehicle from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_teacher_branch_move_denied', 'update public.academy_teachers set branch_id=(select other_branch from tester_menu_context) where id=(select own_teacher from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_class_branch_move_denied', 'update public.class_schedules set branch_id=(select other_branch from tester_menu_context) where id=(select own_class from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_spot_branch_move_denied', 'update public.pickup_spots set branch_id=(select other_branch from tester_menu_context) where id=(select own_spot from tester_menu_context)',0,true);
select pg_temp.tester_probe('menu_own_route_rpc', $probe$
  do $flow$ declare saved jsonb; c record; begin
    select * into strict c from tester_menu_context;
    for i in 1..2 loop
      saved:=public.save_shuttle_route_with_assignments(c.own_route,c.own_branch,'synthetic-route-edited','월','pickup',c.own_class,null,null,null,
        jsonb_build_array(jsonb_build_object('child_id',c.own_child,'class_schedule_id',c.own_class,'direction','pickup','pickup_spot_id',c.own_spot)));
    end loop;
    if saved->>'route_id' is distinct from c.own_route::text or (saved->>'assignment_count')::int is distinct from 1
      or not exists(select 1 from public.shuttle_routes where id=c.own_route and name='synthetic-route-edited')
      or (select count(*) from public.shuttle_route_assignments where route_id=c.own_route and child_id=c.own_child and pickup_spot_id=c.own_spot)<>1
    then raise exception 'TESTER_MENU_ROUTE_SAVE_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('menu_own_member_shuttle_rpc', $probe$
  do $flow$ declare saved jsonb; c record; begin
    select * into strict c from tester_menu_context;
    for i in 1..2 loop
      saved:=public.save_member_shuttle_settings(c.own_parent,
        jsonb_build_array(jsonb_build_object('child_id',c.own_child,'pickup_spot_id',c.own_spot,'is_active',true)),
        jsonb_build_array(jsonb_build_object('child_id',c.own_child,'route_id',c.own_route,'class_schedule_id',c.own_class,'direction','pickup','pickup_spot_id',c.own_spot)));
    end loop;
    if (saved->>'pickup_setting_count')::int is distinct from 1 or (saved->>'assignment_count')::int is distinct from 1
      or not exists(select 1 from public.pickup_settings where child_id=c.own_child and pickup_spot_id=c.own_spot and is_active)
      or (select count(*) from public.shuttle_route_assignments where route_id=c.own_route and child_id=c.own_child)<>1
    then raise exception 'TESTER_MENU_MEMBER_SAVE_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('menu_other_route_rpc_denied', 'select public.save_shuttle_route_with_assignments(other_route,other_branch,''synthetic-route-edited'',''월'',''pickup'',other_class,null,null,null,jsonb_build_array(jsonb_build_object(''child_id'',other_child,''class_schedule_id'',other_class,''direction'',''pickup'',''pickup_spot_id'',other_spot))) from tester_menu_context',0,true);
select pg_temp.tester_probe('menu_forged_route_rpc_denied', 'select public.save_shuttle_route_with_assignments(other_route,own_branch,''synthetic-route-edited'',''월'',''pickup'',own_class,null,null,null,jsonb_build_array(jsonb_build_object(''child_id'',own_child,''class_schedule_id'',own_class,''direction'',''pickup'',''pickup_spot_id'',own_spot))) from tester_menu_context',0,true);
select pg_temp.tester_probe('menu_other_member_shuttle_rpc_denied', 'select public.save_member_shuttle_settings(other_parent,jsonb_build_array(jsonb_build_object(''child_id'',own_child,''pickup_spot_id'',own_spot,''is_active'',true)),jsonb_build_array(jsonb_build_object(''child_id'',own_child,''route_id'',own_route,''class_schedule_id'',own_class,''direction'',''pickup'',''pickup_spot_id'',own_spot))) from tester_menu_context',0,true);
select pg_temp.tester_reference_error('menu_route_foreign_child_rpc_denied','select public.save_shuttle_route_with_assignments(own_route,own_branch,''synthetic-route-edited'',''월'',''pickup'',own_class,null,null,null,jsonb_build_array(jsonb_build_object(''child_id'',other_child,''class_schedule_id'',own_class,''direction'',''pickup'',''pickup_spot_id'',own_spot))) from tester_menu_context');
select pg_temp.tester_reference_error('menu_route_foreign_spot_rpc_denied','select public.save_shuttle_route_with_assignments(own_route,own_branch,''synthetic-route-edited'',''월'',''pickup'',own_class,null,null,null,jsonb_build_array(jsonb_build_object(''child_id'',own_child,''class_schedule_id'',own_class,''direction'',''pickup'',''pickup_spot_id'',other_spot))) from tester_menu_context');
select pg_temp.tester_reference_error('menu_member_foreign_child_rpc_denied','select public.save_member_shuttle_settings(own_parent,jsonb_build_array(jsonb_build_object(''child_id'',other_child,''pickup_spot_id'',own_spot,''is_active'',true)),jsonb_build_array(jsonb_build_object(''child_id'',other_child,''route_id'',own_route,''class_schedule_id'',own_class,''direction'',''pickup'',''pickup_spot_id'',own_spot))) from tester_menu_context');
select pg_temp.tester_reference_error('menu_member_foreign_spot_rpc_denied','select public.save_member_shuttle_settings(own_parent,jsonb_build_array(jsonb_build_object(''child_id'',own_child,''pickup_spot_id'',other_spot,''is_active'',true)),jsonb_build_array(jsonb_build_object(''child_id'',own_child,''route_id'',own_route,''class_schedule_id'',own_class,''direction'',''pickup'',''pickup_spot_id'',other_spot))) from tester_menu_context');
select pg_temp.tester_reference_error('menu_member_foreign_route_rpc_denied','select public.save_member_shuttle_settings(own_parent,jsonb_build_array(jsonb_build_object(''child_id'',own_child,''pickup_spot_id'',own_spot,''is_active'',true)),jsonb_build_array(jsonb_build_object(''child_id'',own_child,''route_id'',other_route,''class_schedule_id'',own_class,''direction'',''pickup'',''pickup_spot_id'',own_spot))) from tester_menu_context');
select pg_temp.tester_probe('menu_own_role_teacher_rpc', 'select public.update_member_role(own_parent,''teacher'') from tester_menu_context',1);
select pg_temp.tester_probe('menu_own_role_driver_rpc', 'select public.update_member_role(own_parent,''driver'') from tester_menu_context',1);
select pg_temp.tester_probe('menu_own_role_user_rpc', 'select public.update_member_role(own_parent,''user'') from tester_menu_context',1);
select pg_temp.tester_probe('menu_other_role_rpc_denied', 'select public.update_member_role(other_parent,''teacher'') from tester_menu_context',0,true);
select pg_temp.tester_probe('menu_admin_role_escalation_denied', 'select public.update_member_role(own_parent,''admin'') from tester_menu_context',0,true);
select pg_temp.tester_probe('menu_director_role_escalation_denied', 'select public.update_member_role(own_parent,''director'') from tester_menu_context',0,true);

reset role;
create temporary table tester_menu_requests(label text,statement text);
insert into tester_menu_requests values
 ('route','select public.save_shuttle_route_with_assignments(own_route,own_branch,''synthetic-route-edited'',''월'',''pickup'',own_class,null,null,null,jsonb_build_array(jsonb_build_object(''child_id'',own_child,''class_schedule_id'',own_class,''direction'',''pickup'',''pickup_spot_id'',own_spot))) from tester_menu_context'),
 ('member','select public.save_member_shuttle_settings(own_parent,jsonb_build_array(jsonb_build_object(''child_id'',own_child,''pickup_spot_id'',own_spot,''is_active'',true)),jsonb_build_array(jsonb_build_object(''child_id'',own_child,''route_id'',own_route,''class_schedule_id'',own_class,''direction'',''pickup'',''pickup_spot_id'',own_spot))) from tester_menu_context');
grant select on tester_menu_requests to authenticated;
update public.users set status='deleted' where id=(select actor from tester_probe_context);
set local role authenticated;
select pg_temp.tester_probe('menu_suspended_'||label,statement,0,true) from tester_menu_requests;
reset role;
update public.users set status='active' where id=(select actor from tester_probe_context);
update auth.users set raw_app_meta_data=raw_app_meta_data-'ipasscare_tester'-'ipasscare_test_branch'
where id=(select actor from tester_probe_context);
select set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated',
 'app_metadata',json_build_object('ipasscare_tester',true,'ipasscare_test_branch',own_branch))::text,true) from tester_probe_context;
set local role authenticated;
select pg_temp.tester_probe('menu_revoked_'||label,statement,0,true) from tester_menu_requests;
select pg_temp.tester_probe('menu_revoked_class_read_denied','select id from public.class_schedules',0);
select pg_temp.tester_probe('menu_revoked_teacher_read_denied','select id from public.academy_teachers',0);
reset role;
update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)
 ||jsonb_build_object('ipasscare_tester',true,'ipasscare_test_branch',(select own_branch from tester_probe_context))
where id=(select actor from tester_probe_context);
select set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true) from tester_probe_context;
set local role anon;
select pg_temp.tester_probe('menu_anon_class_read_denied','select id from public.class_schedules',0,true);
select pg_temp.tester_probe('menu_anon_route_rpc_denied','select public.save_shuttle_route_with_assignments(own_route,own_branch,''synthetic-route-edited'',''월'',''pickup'',own_class,null,null,null,jsonb_build_array(jsonb_build_object(''child_id'',own_child,''class_schedule_id'',own_class,''direction'',''pickup'',''pickup_spot_id'',own_spot))) from tester_menu_context',0,true);
reset role;
