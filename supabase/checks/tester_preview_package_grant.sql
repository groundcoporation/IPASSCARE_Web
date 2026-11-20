-- Candidate only, never a standalone migration. Caller pins Develop and rolls back.
create table ipasscare_preview_access.package_grant_requests(
  actor_id uuid not null, request_id uuid not null, branch_id text not null,
  payload jsonb not null, response jsonb not null, created_at timestamptz not null default now(),
  primary key(actor_id,request_id)
);
revoke all on ipasscare_preview_access.package_grant_requests from public,anon,authenticated;
create function public.grant_tester_member_package_with_schedule(
  p_request_id uuid,p_user_id uuid,p_child_id uuid,p_package_option_id uuid,p_target_month date,p_schedule_ids uuid[]
) returns jsonb language plpgsql security definer set search_path='' as $grant$
declare scope text; request_payload jsonb; cached ipasscare_preview_access.package_grant_requests%rowtype; result jsonb;
begin
  scope:=ipasscare_preview_access.core_scope();
  if not ipasscare_preview_access.is_tester_actor() or scope in ('','*') then
    raise exception using errcode='42501',message='[PERMISSION_DENIED]';
  end if;
  if p_request_id is null or p_user_id is null or p_child_id is null or p_package_option_id is null or p_target_month is null then
    raise exception '[INPUT_INVALID]';
  end if;
  -- Validate target scope before replaying an old response, including after branch changes.
  if not exists(select 1 from public.children c join public.users u on u.id=c.parent_id
    where c.id=p_child_id and c.parent_id=p_user_id and c.branch_id=scope and u.branch_id=scope)
    or not exists(select 1 from public.package_options o join public.packages p on p.id=o.package_id
      where o.id=p_package_option_id and o.branch_id=scope and p.branch_id=scope)
    or exists(select 1 from unnest(coalesce(p_schedule_ids,array[]::uuid[])) x(id)
      where not exists(select 1 from public.class_schedules s where s.id=x.id and s.branch_id=scope)) then
    raise exception using errcode='42501',message='[PERMISSION_DENIED]';
  end if;
  request_payload:=jsonb_build_object('user_id',p_user_id,'child_id',p_child_id,'option_id',p_package_option_id,
    'month',date_trunc('month',p_target_month)::date,'schedules',coalesce(p_schedule_ids,array[]::uuid[]));
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_request_id::text,0));
  select * into cached from ipasscare_preview_access.package_grant_requests
  where actor_id=auth.uid() and request_id=p_request_id;
  if found then
    if cached.branch_id is distinct from scope or cached.payload is distinct from request_payload then
      raise exception '[CONFLICT_ERROR]';
    end if;
    return cached.response||jsonb_build_object('replayed',true);
  end if;
  result:=ipasscare_preview_access.grant_member_package_with_schedule(
    p_user_id,p_child_id,p_package_option_id,p_target_month,p_schedule_ids);
  result:=result||jsonb_build_object('testMode',true,'externalDelivery',false,'replayed',false);
  insert into ipasscare_preview_access.package_grant_requests(actor_id,request_id,branch_id,payload,response)
  values(auth.uid(),p_request_id,scope,request_payload,result);
  return result;
end $grant$;
revoke all on function public.grant_tester_member_package_with_schedule(uuid,uuid,uuid,uuid,date,uuid[]) from public,anon;
grant execute on function public.grant_tester_member_package_with_schedule(uuid,uuid,uuid,uuid,date,uuid[]) to authenticated;
