begin;

-- A revision records that an operator explicitly chose the package set for a
-- month.  Package rows from the latest revision remain effective until a newer
-- revision is saved.  Keeping the header separate is important: an empty
-- revision means "stop billing" and must not reveal an older package again.
create table if not exists public.academy_student_billing_plan_revisions (
  student_id uuid not null references public.academy_students(id) on delete cascade,
  branch_id text not null references public.branches(id) on delete restrict,
  effective_month date not null,
  created_by uuid references public.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, effective_month),
  constraint academy_student_billing_plan_revisions_month_start
    check (effective_month = date_trunc('month', effective_month)::date)
);

create index if not exists academy_student_billing_plan_revisions_branch_month_idx
  on public.academy_student_billing_plan_revisions(branch_id, effective_month);

alter table public.academy_student_billing_plan_revisions enable row level security;

drop policy if exists "Staff can view student billing plan revisions"
  on public.academy_student_billing_plan_revisions;
create policy "Staff can view student billing plan revisions"
on public.academy_student_billing_plan_revisions
for select to authenticated
using (public.can_manage_branch(branch_id));

drop policy if exists "Staff can manage student billing plan revisions"
  on public.academy_student_billing_plan_revisions;
create policy "Staff can manage student billing plan revisions"
on public.academy_student_billing_plan_revisions
for all to authenticated
using (public.can_manage_branch(branch_id))
with check (public.can_manage_branch(branch_id));

-- Existing monthly package selections become the first effective revisions.
insert into public.academy_student_billing_plan_revisions (
  student_id, branch_id, effective_month, created_by, created_at, updated_at
)
select plan.student_id,
       plan.branch_id,
       plan.effective_month,
       max(plan.created_by::text)::uuid,
       min(plan.created_at),
       max(plan.updated_at)
from public.academy_student_monthly_plans plan
where plan.item_type = 'package'
  and coalesce(plan.billing_source, 'standard') = 'standard'
group by plan.student_id, plan.branch_id, plan.effective_month
on conflict (student_id, effective_month) do nothing;

create or replace function public.save_student_monthly_package_plan(
  p_student_id uuid,
  p_effective_month date,
  p_package_option_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.academy_students%rowtype;
  v_actor public.users%rowtype;
  v_month date := date_trunc('month', p_effective_month)::date;
  v_option_ids uuid[];
  v_invalid_count integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_effective_month is null or p_effective_month <> v_month then
    raise exception '적용 월은 해당 월의 1일이어야 합니다.';
  end if;
  if v_month < date_trunc('month', now() at time zone 'Asia/Seoul')::date then
    raise exception '이미 지난 달의 이용권 설정은 변경할 수 없습니다.';
  end if;

  select * into v_actor
  from public.users
  where id = auth.uid() and coalesce(status, 'active') = 'active';
  if v_actor.id is null or v_actor.role not in ('admin', 'director', 'teacher', 'coach') then
    raise exception '청구 예정 이용권을 저장할 권한이 없습니다.';
  end if;

  select * into v_student
  from public.academy_students
  where id = p_student_id
  for update;
  if v_student.id is null then
    raise exception '학생을 찾을 수 없습니다.';
  end if;
  if not public.can_manage_branch(v_student.branch_id) then
    raise exception '다른 지점 학생의 이용권 설정은 변경할 수 없습니다.';
  end if;

  select coalesce(array_agg(distinct requested.id), array[]::uuid[])
    into v_option_ids
  from unnest(coalesce(p_package_option_ids, array[]::uuid[])) requested(id);

  select count(*) into v_invalid_count
  from unnest(v_option_ids) requested(id)
  left join public.package_options option_row on option_row.id = requested.id
  left join public.packages package_row on package_row.id = option_row.package_id
  where option_row.id is null
     or coalesce(option_row.branch_id, package_row.branch_id) is distinct from v_student.branch_id
     or coalesce(package_row.voucher_type, 'lesson') = 'gps';
  if v_invalid_count > 0 then
    raise exception '선택한 이용권 중 이 지점에서 청구할 수 없는 항목이 있습니다.';
  end if;

  if exists (
    select 1
    from public.academy_student_monthly_plans plan
    where plan.student_id = v_student.id
      and plan.effective_month = v_month
      and plan.item_type = 'package'
      and plan.status = 'applied'
  ) or exists (
    select 1
    from public.academy_bills bill
    where bill.student_id = v_student.id
      and bill.bill_month = to_char(v_month, 'YYYY-MM')
      and coalesce(bill.status, 'unpaid') not in ('cancelled', 'void', 'deleted')
  ) then
    raise exception '이미 청구 또는 갱신이 확정된 달의 이용권은 변경할 수 없습니다.';
  end if;

  insert into public.academy_student_billing_plan_revisions (
    student_id, branch_id, effective_month, created_by, updated_at
  ) values (
    v_student.id, v_student.branch_id, v_month, v_actor.id, now()
  )
  on conflict (student_id, effective_month) do update
    set branch_id = excluded.branch_id,
        created_by = excluded.created_by,
        updated_at = now();

  delete from public.academy_student_monthly_plans plan
  where plan.student_id = v_student.id
    and plan.effective_month = v_month
    and plan.item_type = 'package'
    and coalesce(plan.billing_source, 'standard') = 'standard'
    and plan.status = 'planned';

  insert into public.academy_student_monthly_plans (
    student_id, branch_id, effective_month, item_type, class_schedule_id,
    package_option_id, billing_cycle, payment_day, status, billing_source, created_by
  )
  select v_student.id, v_student.branch_id, v_month, 'package', null,
         requested.id, '월 기간제', '매월 1일', 'planned', 'standard', v_actor.id
  from unnest(v_option_ids) requested(id)
  where not exists (
    select 1
    from public.academy_student_monthly_plans existing
    where existing.student_id = v_student.id
      and existing.effective_month = v_month
      and existing.item_type = 'package'
      and existing.package_option_id = requested.id
      and coalesce(existing.billing_source, 'standard') = 'standard'
  );

  return jsonb_build_object(
    'success', true,
    'effective_month', v_month,
    'package_count', cardinality(v_option_ids)
  );
end;
$$;

revoke all on function public.save_student_monthly_package_plan(uuid, date, uuid[])
  from public, anon;
grant execute on function public.save_student_monthly_package_plan(uuid, date, uuid[])
  to authenticated;

-- Preserve the existing lock-aware current-month implementation behind a
-- private helper, then record a revision only after that operation succeeds.
-- This also records an empty revision when billing is explicitly stopped.
alter function public.save_current_month_student_billing_draft(uuid, uuid[])
  rename to save_current_month_student_billing_draft_locked;

revoke all on function public.save_current_month_student_billing_draft_locked(uuid, uuid[])
  from public, anon, authenticated;

create or replace function public.save_current_month_student_billing_draft(
  p_student_id uuid,
  p_package_option_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_student public.academy_students%rowtype;
  v_month date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
begin
  v_result := public.save_current_month_student_billing_draft_locked(
    p_student_id,
    p_package_option_ids
  );

  select * into v_student
  from public.academy_students
  where id = p_student_id;

  insert into public.academy_student_billing_plan_revisions (
    student_id, branch_id, effective_month, created_by, updated_at
  ) values (
    v_student.id, v_student.branch_id, v_month, auth.uid(), now()
  )
  on conflict (student_id, effective_month) do update
    set branch_id = excluded.branch_id,
        created_by = excluded.created_by,
        updated_at = now();

  return v_result || jsonb_build_object('recurs_until_changed', true);
end;
$$;

revoke all on function public.save_current_month_student_billing_draft(uuid, uuid[])
  from public, anon;
grant execute on function public.save_current_month_student_billing_draft(uuid, uuid[])
  to authenticated;

-- Keep schedule and billing-plan changes atomic. A failed billing validation
-- must not leave only the class schedule changed (or vice versa).
create or replace function public.save_current_month_student_schedule_and_billing(
  p_student_id uuid,
  p_schedule_ids uuid[],
  p_apply_next_month boolean,
  p_package_option_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule_result jsonb;
  v_billing_result jsonb;
begin
  v_schedule_result := public.sync_current_and_next_month_student_schedules(
    p_student_id,
    coalesce(p_schedule_ids, array[]::uuid[]),
    coalesce(p_apply_next_month, false)
  );
  v_billing_result := public.save_current_month_student_billing_draft(
    p_student_id,
    coalesce(p_package_option_ids, array[]::uuid[])
  );
  return jsonb_build_object(
    'success', true,
    'schedule', v_schedule_result,
    'billing', v_billing_result
  );
end;
$$;

revoke all on function public.save_current_month_student_schedule_and_billing(uuid, uuid[], boolean, uuid[])
  from public, anon;
grant execute on function public.save_current_month_student_schedule_and_billing(uuid, uuid[], boolean, uuid[])
  to authenticated;

create or replace function public.save_future_month_student_schedule_and_billing(
  p_student_id uuid,
  p_effective_month date,
  p_schedule_ids uuid[],
  p_package_option_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule_result jsonb;
  v_billing_result jsonb;
begin
  v_schedule_result := public.sync_future_month_student_schedules(
    p_student_id,
    p_effective_month,
    coalesce(p_schedule_ids, array[]::uuid[])
  );
  v_billing_result := public.save_student_monthly_package_plan(
    p_student_id,
    p_effective_month,
    coalesce(p_package_option_ids, array[]::uuid[])
  );
  return jsonb_build_object(
    'success', true,
    'schedule', v_schedule_result,
    'billing', v_billing_result
  );
end;
$$;

revoke all on function public.save_future_month_student_schedule_and_billing(uuid, date, uuid[], uuid[])
  from public, anon;
grant execute on function public.save_future_month_student_schedule_and_billing(uuid, date, uuid[], uuid[])
  to authenticated;

-- Automatic runs can overlap (manual retry, scheduler retry, or a timeout).
-- Serialize one student/month/option and derive all bill fields server-side so
-- the Edge Function cannot create duplicate or cross-branch ledger rows.
create or replace function public.ensure_automatic_student_plan_bill(
  p_plan_id uuid,
  p_bill_month text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan record;
  v_bill_id uuid;
  v_class_schedule_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '서비스 작업 전용 함수입니다.';
  end if;
  if p_bill_month is null or p_bill_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception '청구 월 형식이 올바르지 않습니다.';
  end if;

  select plan.id,
         plan.student_id,
         plan.branch_id,
         plan.package_option_id,
         option_row.price::integer as amount_due,
         package_row.name as package_name,
         option_row.label as option_label
    into v_plan
  from public.academy_student_monthly_plans plan
  join public.academy_students student
    on student.id = plan.student_id
   and student.branch_id = plan.branch_id
  join public.users parent
    on parent.id = student.parent_user_id
   and parent.status = 'active'
  join public.academy_billing_automation_targets auto_target
    on auto_target.student_id = student.id
   and auto_target.branch_id = student.branch_id
   and auto_target.is_enabled
  join public.package_options option_row
    on option_row.id = plan.package_option_id
  join public.packages package_row
    on package_row.id = option_row.package_id
  where plan.id = p_plan_id
    and plan.item_type = 'package'
    and plan.status in ('planned', 'applied')
    and coalesce(package_row.voucher_type, 'lesson') <> 'gps'
    and (
      student.child_id is null
      or exists (
        select 1 from public.children child
        where child.id = student.child_id and child.deleted_at is null
      )
    );

  if not found or coalesce(v_plan.amount_due, 0) <= 0 then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_plan.student_id::text),
    pg_catalog.hashtext(p_bill_month || ':' || v_plan.package_option_id::text)
  );

  select bill.id into v_bill_id
  from public.academy_bills bill
  where bill.student_id = v_plan.student_id
    and bill.package_option_id = v_plan.package_option_id
    and bill.bill_month = p_bill_month
  order by bill.created_at
  limit 1;
  if v_bill_id is not null then
    return v_bill_id;
  end if;

  select class_plan.class_schedule_id into v_class_schedule_id
  from public.academy_student_monthly_plans class_plan
  where class_plan.student_id = v_plan.student_id
    and class_plan.effective_month = (p_bill_month || '-01')::date
    and class_plan.item_type = 'class'
    and class_plan.status in ('planned', 'applied')
  order by class_plan.created_at
  limit 1;

  insert into public.academy_bills (
    branch_id, student_id, class_schedule_id, package_option_id,
    bill_month, amount_due, amount_paid, billing_date, status, memo
  ) values (
    v_plan.branch_id,
    v_plan.student_id,
    v_class_schedule_id,
    v_plan.package_option_id,
    p_bill_month,
    v_plan.amount_due,
    0,
    (p_bill_month || '-01')::date,
    'unpaid',
    concat('자동 청구 | 지정 이용권: ', v_plan.package_name,
           ' (', coalesce(v_plan.option_label, '옵션'), ')')
  ) returning id into v_bill_id;

  return v_bill_id;
end;
$$;

revoke all on function public.ensure_automatic_student_plan_bill(uuid, text)
  from public, anon, authenticated;
grant execute on function public.ensure_automatic_student_plan_bill(uuid, text)
  to service_role;

-- Rows inserted by other trusted workflows also establish a revision.
create or replace function public.record_current_student_billing_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.item_type = 'package'
     and coalesce(new.billing_source, 'standard') = 'standard' then
    insert into public.academy_student_billing_plan_revisions (
      student_id, branch_id, effective_month, created_by, updated_at
    ) values (
      new.student_id, new.branch_id, new.effective_month,
      coalesce(new.created_by, auth.uid()), now()
    )
    on conflict (student_id, effective_month) do update
      set branch_id = excluded.branch_id,
          updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_record_current_student_billing_revision
  on public.academy_student_monthly_plans;
create trigger trg_record_current_student_billing_revision
after insert or update of package_option_id, status
on public.academy_student_monthly_plans
for each row execute function public.record_current_student_billing_revision();

revoke all on function public.record_current_student_billing_revision()
  from public, anon, authenticated;

comment on table public.academy_student_billing_plan_revisions is
  'Effective-dated package billing selections. The latest revision remains active until a newer revision, including an empty revision, is saved.';

commit;
