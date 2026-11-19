-- High-impact RPC checks. All fixtures and changes are rolled back by the caller.
set local role authenticated;
select pg_temp.tester_probe('rpc_own_child_delete_allowed', $probe$
  do $flow$ declare result jsonb; begin
    result:=public.soft_delete_child((select own_child from tester_manual_context));
    if result->>'success' is distinct from 'true'
      or not exists(select 1 from public.children where id=(select own_child from tester_manual_context) and deleted_at is not null)
      or not exists(select 1 from public.user_packages where id=(select own_pass from tester_manual_context) and status='inactive')
    then raise exception 'TESTER_CHILD_DELETE_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('rpc_other_child_delete_denied',
  'select public.soft_delete_child((select other_child from tester_manual_context))',0,true);
select pg_temp.tester_probe('rpc_own_reservation_delete_allowed', $probe$
  do $flow$ declare result jsonb; begin
    result:=public.soft_delete_reservation((select own_reservation from tester_manual_context));
    if result->>'success' is distinct from 'true'
      or not exists(select 1 from public.reservations where id=(select own_reservation from tester_manual_context) and deleted_at is not null)
    then raise exception 'TESTER_RESERVATION_DELETE_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('rpc_other_reservation_delete_denied',
  'select public.soft_delete_reservation((select other_reservation from tester_manual_context))',0,true);
select pg_temp.tester_probe('rpc_cancel_no_extra_uses_on_repeat', $probe$
  do $flow$ declare cancelled jsonb; repeated jsonb; begin
    cancelled:=public.cancel_class_reservation((select own_reservation from tester_manual_context),(select own_parent from tester_manual_context));
    repeated:=public.cancel_class_reservation((select own_reservation from tester_manual_context),(select own_parent from tester_manual_context));
    if cancelled->>'success' is distinct from 'true' or repeated->>'status' is distinct from 'not_found'
      or (select remaining_count from public.user_packages where id=(select own_pass from tester_manual_context)) is distinct from 3
      or exists(select 1 from public.package_usage_logs where reservation_id=(select own_reservation from tester_manual_context) and status='held')
    then raise exception 'TESTER_CANCEL_OVER_RESTORE'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('rpc_cancel_other_owner_denied',
  'select public.cancel_class_reservation((select other_reservation from tester_manual_context),(select other_parent from tester_manual_context))',0,true);
select pg_temp.tester_probe('rpc_cancel_forged_owner_denied',
  'select public.cancel_class_reservation((select own_reservation from tester_manual_context),(select other_parent from tester_manual_context))',0,true);
select pg_temp.tester_probe('rpc_referral_replay_denied',
  'select public.process_referral_points((select own_parent from tester_manual_context),(select other_parent from tester_manual_context),99999999,''synthetic'')',0,true);
select pg_temp.tester_probe('rpc_own_makeup_credit_allowed', $probe$
  do $flow$ declare granted jsonb; repeated jsonb; begin
    granted:=public.grant_makeup_credit((select own_reservation from tester_manual_context),30,'synthetic');
    repeated:=public.grant_makeup_credit((select own_reservation from tester_manual_context),30,'synthetic');
    if granted->>'created' is distinct from 'true' or repeated->>'created' is distinct from 'false'
      or granted->>'credit_id' is distinct from repeated->>'credit_id'
    then raise exception 'TESTER_MAKEUP_DUPLICATED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('rpc_other_makeup_credit_denied',
  'select public.grant_makeup_credit((select other_reservation from tester_manual_context),30,''synthetic'')',0,true);
select pg_temp.tester_probe('rpc_own_beneficiary_allowed', $probe$
  do $flow$ declare result jsonb; begin
    result:=public.assign_user_package_beneficiary((select own_pass from tester_manual_context),'child',(select own_child from tester_manual_context));
    if result->>'success' is distinct from 'true'
      or result->>'child_id' is distinct from (select own_child::text from tester_manual_context)
    then raise exception 'TESTER_BENEFICIARY_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('rpc_other_beneficiary_denied',
  'select public.assign_user_package_beneficiary((select other_pass from tester_manual_context),''child'',(select other_child from tester_manual_context))',0,true);
select pg_temp.tester_probe('rpc_forged_child_beneficiary_denied',
  'select public.assign_user_package_beneficiary((select own_pass from tester_manual_context),''child'',(select other_child from tester_manual_context))',0,true);
select pg_temp.tester_probe('rpc_other_lesson_checkin_denied',
  'select public.process_lesson_check_in((select other_reservation from tester_manual_context),null,null,null)',0,true);

reset role;
-- One reusable set of requests tests both suspension and a stale cached JWT.
create temporary table tester_sensitive_requests(label text,statement text);
insert into tester_sensitive_requests values
  ('child_delete','select public.soft_delete_child((select own_child from tester_manual_context))'),
  ('reservation_delete','select public.soft_delete_reservation((select own_reservation from tester_manual_context))'),
  ('cancel','select public.cancel_class_reservation((select own_reservation from tester_manual_context),(select own_parent from tester_manual_context))'),
  ('makeup','select public.grant_makeup_credit((select own_reservation from tester_manual_context),30,''synthetic'')'),
  ('beneficiary','select public.assign_user_package_beneficiary((select own_pass from tester_manual_context),''child'',(select own_child from tester_manual_context))'),
  ('lesson','select public.process_lesson_check_in((select own_reservation from tester_manual_context),null,null,null)');
grant select on tester_sensitive_requests to authenticated;
update public.users set status='deleted' where id=(select actor from tester_probe_context);
set local role authenticated;
select pg_temp.tester_probe('suspended_rpc_'||label,statement,0,true) from tester_sensitive_requests;
reset role;
update public.users set status='active' where id=(select actor from tester_probe_context);
update auth.users set raw_app_meta_data=raw_app_meta_data-'ipasscare_tester'-'ipasscare_test_branch'
where id=(select actor from tester_probe_context);
select set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated',
  'app_metadata',json_build_object('ipasscare_tester',true,'ipasscare_test_branch',own_branch))::text,true) from tester_probe_context;
set local role authenticated;
select pg_temp.tester_probe('revoked_rpc_'||label,statement,0,true) from tester_sensitive_requests;
reset role;
update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)
  ||jsonb_build_object('ipasscare_tester',true,'ipasscare_test_branch',(select own_branch from tester_probe_context))
where id=(select actor from tester_probe_context);
select set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true) from tester_probe_context;
