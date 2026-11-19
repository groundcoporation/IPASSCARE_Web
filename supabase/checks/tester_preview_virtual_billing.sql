-- Rollback candidate only. Never place in the production migration queue.
create schema ipasscare_preview_delivery;
revoke all on schema ipasscare_preview_delivery from public,anon,authenticated;
create table ipasscare_preview_delivery.outbox(
  actor_id uuid not null,request_id uuid not null,branch_id text not null,
  operation text not null,request_ids uuid[] not null,result jsonb not null,
  created_at timestamptz not null default now(),primary key(actor_id,request_id)
);
revoke all on ipasscare_preview_delivery.outbox from public,anon,authenticated;
create function public.simulate_tester_billing_notification(p_operation text,p_ids uuid[],p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  scope text:=ipasscare_preview_access.core_scope();
  ids uuid[]; target uuid; receipt jsonb; response jsonb;
  saved ipasscare_preview_delivery.outbox%rowtype;
  bill public.academy_bills%rowtype;
  payment public.payment_requests%rowtype;
  recipient uuid; created integer:=0; skipped integer:=0;
begin
  if not ipasscare_preview_access.is_tester_actor() or scope !~ '^devsmoke-[a-f0-9]{10}-[12]$'
    then raise exception '[PERMISSION_DENIED]'; end if;
  if p_operation not in ('send-academy-bills','send-payment-reminders') or p_operation is null
    or p_request_id is null or p_ids is null or cardinality(p_ids) not between 1 and 100
    or array_position(p_ids,null) is not null
    then raise exception '[INPUT_INVALID]'; end if;
  select array_agg(distinct id order by id) into ids from unnest(p_ids) id;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_request_id::text,0));
  select * into saved from ipasscare_preview_delivery.outbox where actor_id=auth.uid() and request_id=p_request_id;
  if found then
    if saved.branch_id is distinct from scope or saved.operation is distinct from p_operation
      or saved.request_ids is distinct from ids then raise exception '[CONFLICT_ERROR]'; end if;
    return saved.result;
  end if;
  foreach target in array ids loop
    if p_operation='send-academy-bills' then
      select * into bill from public.academy_bills where id=target for update;
      if not found or bill.branch_id is distinct from scope then raise exception '[PERMISSION_DENIED]'; end if;
      select parent_user_id into recipient from public.academy_students where id=bill.student_id and branch_id=scope;
      if not exists(select 1 from public.package_options o join public.packages p on p.id=o.package_id
        where o.id=bill.package_option_id and o.branch_id=scope and p.branch_id=scope)
        then raise exception '[BILL_OPTION_INVALID]'; end if;
    else
      select * into payment from public.payment_requests where id=target for update;
      if not found or payment.branch_id is distinct from scope then raise exception '[PERMISSION_DENIED]'; end if;
      if payment.status not in ('pending','unpaid') or payment.status is null then raise exception '[INPUT_INVALID]'; end if;
      recipient:=payment.parent_id;
    end if;
    if recipient is null or not exists(select 1 from public.users u where u.id=recipient
      and u.branch_id=scope and u.status='active'
      and u.email ~ '^ipass-dev-[a-f0-9]{10}-[a-z-]+@example\.com$')
      then raise exception '[PERMISSION_DENIED]'; end if;
    if p_operation='send-academy-bills' then
      receipt:=public.create_academy_bill_payment_request(target);
      if receipt->>'created'='true' then created:=created+1; else skipped:=skipped+1; end if;
    end if;
  end loop;
  response:=jsonb_build_object('success',true,'testMode',true,'externalDelivery',false,
    'created',created,'skipped',skipped,'sent',case when p_operation='send-payment-reminders' then cardinality(ids) else created end,
    'failed',0,'results','[]'::jsonb);
  insert into ipasscare_preview_delivery.outbox(actor_id,request_id,branch_id,operation,request_ids,result)
    values(auth.uid(),p_request_id,scope,p_operation,ids,response);
  return response;
end $$;
revoke all on function public.simulate_tester_billing_notification(text,uuid[],uuid) from public,anon;
grant execute on function public.simulate_tester_billing_notification(text,uuid[],uuid) to authenticated;
