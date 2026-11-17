begin;

create or replace function public.can_manage_academy_journal(p_branch_id text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid()) and u.status = 'active'
      and u.role in ('admin','director','teacher','coach')
      and (u.role = 'admin' or (p_branch_id is not null and u.branch_id = p_branch_id))
  );
$$;
revoke all on function public.can_manage_academy_journal(text) from public, anon;
grant execute on function public.can_manage_academy_journal(text) to authenticated;

-- Remove legacy unconditional permissions. The parent app continues to read
-- its own copies from parent_journal_entries, not these internal tables.
revoke all on public.academy_study_logs, public.academy_counsel_logs from public, anon;
alter table public.academy_study_logs enable row level security;
alter table public.academy_counsel_logs enable row level security;
drop policy if exists "Allow anon read/write to academy_study_logs" on public.academy_study_logs;
drop policy if exists "Allow authenticated full access to academy_study_logs" on public.academy_study_logs;
drop policy if exists "Allow anon read/write to academy_counsel_logs" on public.academy_counsel_logs;
drop policy if exists "Allow authenticated full access to academy_counsel_logs" on public.academy_counsel_logs;

drop policy if exists scoped_study_journal on public.academy_study_logs;
drop policy if exists scoped_counsel_journal on public.academy_counsel_logs;
do $policy_guard$ begin
  if exists (select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename in ('academy_study_logs','academy_counsel_logs') and permissive='PERMISSIVE')
  then raise exception 'REVIEW_UNEXPECTED_JOURNAL_POLICY_BEFORE_DEPLOY'; end if;
end $policy_guard$;

create policy scoped_study_journal on public.academy_study_logs for all to authenticated
using (public.can_manage_academy_journal(branch_id))
with check (
  branch_id is not null and public.can_manage_academy_journal(branch_id)
  and (student_id is null or exists (
    select 1 from public.academy_students s where s.id = academy_study_logs.student_id and s.branch_id = academy_study_logs.branch_id
  ))
  and (class_schedule_id is null or exists (
    select 1 from public.class_schedules c where c.id = academy_study_logs.class_schedule_id and c.branch_id = academy_study_logs.branch_id
  ))
);

create policy scoped_counsel_journal on public.academy_counsel_logs for all to authenticated
using (public.can_manage_academy_journal(branch_id))
with check (
  branch_id is not null and public.can_manage_academy_journal(branch_id)
  and exists (
    select 1 from public.academy_students s where s.id = academy_counsel_logs.student_id and s.branch_id = academy_counsel_logs.branch_id
  )
);

create or replace function public.delete_unpaid_app_payment_request(
  p_request_id uuid, p_reason text default '수납 관리에서 어플 관리자 직접 청구 삭제'
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor public.users%rowtype;
  v_request public.payment_requests%rowtype;
begin
  if auth.uid() is null then raise exception '[AUTH_REQUIRED]'; end if;
  select * into v_actor from public.users where id = auth.uid() and status = 'active';
  if v_actor.role is null or v_actor.role not in ('admin','director','teacher','coach') then
    raise exception '[PERMISSION_DENIED]';
  end if;

  select * into v_request from public.payment_requests where id = p_request_id for update;
  if not found then raise exception '[BILL_NOT_FOUND]'; end if;
  if v_actor.role <> 'admin' and (v_actor.branch_id is null or v_actor.branch_id is distinct from v_request.branch_id) then
    raise exception '[PERMISSION_DENIED]';
  end if;
  if v_request.issued_source is distinct from 'admin_app' or exists (
    select 1 from public.academy_bills b where b.payment_request_id = v_request.id
  ) then raise exception '[CONFLICT_ERROR]'; end if;

  if coalesce(v_request.status,'') not in ('pending','declined','expired','cancelled')
    or v_request.paid_at is not null
    or nullif(btrim(v_request.kspay_tr_no),'') is not null
    or nullif(btrim(v_request.kspay_auth_no),'') is not null
  then raise exception '[BILL_PAYMENT_EXISTS]'; end if;

  delete from public.payment_requests where id = v_request.id;
  return jsonb_build_object('success',true,'request_id',v_request.id);
end;
$$;
revoke all on function public.delete_unpaid_app_payment_request(uuid,text) from public, anon;
grant execute on function public.delete_unpaid_app_payment_request(uuid,text) to authenticated;

commit;
