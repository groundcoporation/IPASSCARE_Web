-- Rollback-only companion to the virtual billing candidate. No network calls.
alter table ipasscare_preview_delivery.outbox add column request_payload jsonb;
alter table public.notices enable row level security;
create policy preview_notice_authenticated on public.notices for all to authenticated using(true) with check(true);
create policy preview_notice_branch_guard on public.notices as restrictive for all to authenticated
  using(coalesce((select ipasscare_preview_access.core_scope()) in ('*',nullif(branch_id,'')),false))
  with check(coalesce((select ipasscare_preview_access.core_scope()) in ('*',nullif(branch_id,'')),false));
create function public.simulate_tester_activity_notification(p_operation text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  scope text:=ipasscare_preview_access.core_scope();
  target uuid; payload jsonb; saved ipasscare_preview_delivery.outbox%rowtype;
  targets integer:=0; response jsonb; kind text; visible boolean; target_branch text; day date; action text;
begin
  if not ipasscare_preview_access.is_tester_actor() or scope !~ '^devsmoke-[a-f0-9]{10}-[12]$'
    then raise exception '[PERMISSION_DENIED]'; end if;
  if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' or p_operation is null
    then raise exception '[INPUT_INVALID]'; end if;
  begin
    if p_operation='send-journal-notification' then
      target:=(p_payload->>'journalId')::uuid;kind:=p_payload->>'journalType';
      if kind not in ('study','counsel') or kind is null
        or coalesce(p_payload->>'notificationKind','created') not in ('created','updated')
        then raise exception '[INPUT_INVALID]'; end if;
      payload:=jsonb_build_object('journalId',target,'journalType',kind,'notificationKind',coalesce(p_payload->>'notificationKind','created'));
    elsif p_operation='send-attendance-notification' then
      target:=(p_payload->>'child_id')::uuid;day:=(p_payload->>'service_date')::date;action:=p_payload->>'action';
      if day is null or action is null or action not in ('ride_in','check_in','check_out','ride_out')
        then raise exception '[INPUT_INVALID]'; end if;
      if (p_payload->>'branch_id') is distinct from scope then raise exception '[PERMISSION_DENIED]'; end if;
      payload:=jsonb_build_object('child_id',target,'branch_id',scope,'service_date',day,'action',action);
    elsif p_operation='send-notice-push' then
      target:=(p_payload->>'noticeId')::uuid;
      payload:=jsonb_build_object('noticeId',target);
    else raise exception '[INPUT_INVALID]'; end if;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception '[INPUT_INVALID]';
  end;
  if target is null then raise exception '[INPUT_INVALID]'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_request_id::text,0));
  select * into saved from ipasscare_preview_delivery.outbox where actor_id=auth.uid() and request_id=p_request_id;
  if found then
    if saved.branch_id is distinct from scope or saved.operation is distinct from p_operation
      or saved.request_payload is distinct from payload then raise exception '[CONFLICT_ERROR]'; end if;
    return saved.result;
  end if;
  if p_operation='send-journal-notification' then
    if kind='study' then
      select branch_id,is_parent_visible into target_branch,visible from public.academy_study_logs where id=target;
    else
      select branch_id,is_parent_visible into target_branch,visible from public.academy_counsel_logs where id=target;
    end if;
    if target_branch is distinct from scope then raise exception '[PERMISSION_DENIED]'; end if;
    if visible is distinct from true then raise exception '[INPUT_INVALID]'; end if;
    select count(distinct u.id) into targets from public.parent_journal_entries e
      join public.users u on u.id=e.parent_id and u.branch_id=scope and u.status='active'
      where e.source_id=target and e.journal_type=kind and e.branch_id=scope
        and u.email ~ '^ipass-dev-[a-f0-9]{10}-[a-z-]+@example\.com$';
  elsif p_operation='send-attendance-notification' then
    if not exists(select 1 from public.children where id=target and branch_id=scope and deleted_at is null)
      then raise exception '[PERMISSION_DENIED]'; end if;
    if not exists(select 1 from public.attendance_logs l where l.child_id=target and l.branch_id=scope and l.date=day
      and case action when 'ride_in' then l.shuttle_ride_time is not null when 'check_in' then l.check_in is not null
        when 'check_out' then l.check_out is not null when 'ride_out' then l.shuttle_drop_time is not null else false end)
      then raise exception '[INPUT_INVALID]'; end if;
    select count(*) into targets from public.users u join public.children c on c.parent_id=u.id
      where c.id=target and u.branch_id=scope and u.status='active'
        and u.email ~ '^ipass-dev-[a-f0-9]{10}-[a-z-]+@example\.com$';
  else
    if not exists(select 1 from public.notices where id=target and branch_id=scope)
      then raise exception '[PERMISSION_DENIED]'; end if;
    select count(*) into targets from public.users u where u.branch_id=scope and u.role='user' and u.status='active'
      and u.email ~ '^ipass-dev-[a-f0-9]{10}-[a-z-]+@example\.com$';
  end if;
  response:=jsonb_build_object('success',true,'testMode',true,'externalDelivery',false,
    'targetCount',targets,'simulatedCount',targets,'sentCount',0,'failedCount',0);
  insert into ipasscare_preview_delivery.outbox(actor_id,request_id,branch_id,operation,request_ids,request_payload,result)
    values(auth.uid(),p_request_id,scope,p_operation,array[target],payload,response);
  return response;
end $$;
revoke all on function public.simulate_tester_activity_notification(text,jsonb,uuid) from public,anon;
grant execute on function public.simulate_tester_activity_notification(text,jsonb,uuid) to authenticated;
