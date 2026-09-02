begin;

alter table public.academy_bills
  add column if not exists revision integer not null default 1,
  add column if not exists revised_at timestamptz,
  add column if not exists revised_by uuid references public.users(id) on delete set null;

create table if not exists public.academy_bill_revision_logs (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.academy_bills(id) on delete cascade,
  branch_id text not null references public.branches(id) on delete cascade,
  previous_package_option_id uuid references public.package_options(id) on delete set null,
  next_package_option_id uuid references public.package_options(id) on delete set null,
  previous_amount_due integer not null,
  next_amount_due integer not null,
  reason text not null,
  changed_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists academy_bill_revision_logs_bill_created_idx
  on public.academy_bill_revision_logs(bill_id, created_at desc);

alter table public.academy_bill_revision_logs enable row level security;

drop policy if exists "Staff can view permitted academy bill revisions"
  on public.academy_bill_revision_logs;
create policy "Staff can view permitted academy bill revisions"
on public.academy_bill_revision_logs
for select
to authenticated
using (public.can_manage_branch(branch_id));

create or replace function public.revise_unpaid_academy_bill(
  p_bill_id uuid,
  p_package_option_id uuid,
  p_reason text default '청구 이용권 변경'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.users%rowtype;
  v_bill public.academy_bills%rowtype;
  v_option public.package_options%rowtype;
  v_package public.packages%rowtype;
  v_request public.payment_requests%rowtype;
  v_current_month text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
  v_next_month text := to_char((now() at time zone 'Asia/Seoul') + interval '1 month', 'YYYY-MM');
  v_reason text := coalesce(nullif(btrim(p_reason), ''), '청구 이용권 변경');
  v_had_app_invoice boolean := false;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_actor
  from public.users
  where id = auth.uid()
    and coalesce(status, 'active') = 'active';

  if v_actor.id is null
     or v_actor.role not in ('admin', 'director', 'teacher', 'coach') then
    raise exception '청구 이용권 변경 권한이 없습니다.';
  end if;

  select * into v_bill
  from public.academy_bills
  where id = p_bill_id
  for update;

  if v_bill.id is null then
    raise exception '청구서를 찾을 수 없습니다.';
  end if;
  if not public.can_manage_branch(v_bill.branch_id) then
    raise exception '다른 지점의 청구서는 변경할 수 없습니다.';
  end if;
  if v_bill.bill_month not in (v_current_month, v_next_month) then
    raise exception '이번 달과 다음 달 청구서만 변경할 수 있습니다.';
  end if;
  if coalesce(v_bill.amount_paid, 0) > 0
     or coalesce(v_bill.status, 'unpaid') not in ('unpaid', 'declined', 'expired') then
    raise exception '결제 또는 수납이 시작된 청구서는 변경할 수 없습니다.';
  end if;
  if exists (
    select 1
    from public.payments payment
    where payment.academy_bill_id = v_bill.id
      and lower(coalesce(payment.status, '')) in ('scheduled', 'pending', 'paid')
  ) then
    raise exception '예약 또는 완료된 결제 내역이 있어 청구서를 변경할 수 없습니다.';
  end if;

  select * into v_option
  from public.package_options
  where id = p_package_option_id;

  if v_option.id is null or coalesce(v_option.price, 0) <= 0 then
    raise exception '변경할 이용권 옵션 또는 금액이 올바르지 않습니다.';
  end if;
  if v_option.id is not distinct from v_bill.package_option_id then
    raise exception '현재 청구 이용권과 다른 이용권을 선택해 주세요.';
  end if;

  select * into v_package
  from public.packages
  where id = v_option.package_id;

  if v_package.id is null
     or coalesce(v_option.branch_id, v_package.branch_id) is distinct from v_bill.branch_id then
    raise exception '이 지점에서 사용할 수 없는 이용권입니다.';
  end if;

  if v_bill.payment_request_id is not null then
    v_had_app_invoice := true;
    select * into v_request
    from public.payment_requests
    where id = v_bill.payment_request_id
    for update;

    if v_request.id is not null
       and coalesce(v_request.status, 'pending') not in ('pending', 'declined', 'expired') then
      raise exception '결제가 진행된 앱 청구서는 변경할 수 없습니다.';
    end if;

    if v_request.id is not null and v_request.status = 'pending' then
      update public.payment_requests
      set status = 'expired',
          closed_at = now(),
          closed_by = v_actor.id,
          close_reason = '관리자 청구 이용권 변경',
          updated_at = now()
      where id = v_request.id;
    end if;
  end if;

  insert into public.academy_bill_revision_logs(
    bill_id,
    branch_id,
    previous_package_option_id,
    next_package_option_id,
    previous_amount_due,
    next_amount_due,
    reason,
    changed_by
  ) values (
    v_bill.id,
    v_bill.branch_id,
    v_bill.package_option_id,
    v_option.id,
    v_bill.amount_due,
    v_option.price,
    v_reason,
    v_actor.id
  );

  update public.academy_bills
  set package_option_id = v_option.id,
      amount_due = v_option.price,
      amount_paid = 0,
      status = 'unpaid',
      payment_method = null,
      payment_date = null,
      payment_request_id = null,
      app_sent_at = null,
      revision = revision + 1,
      revised_at = now(),
      revised_by = v_actor.id
  where id = v_bill.id;

  return jsonb_build_object(
    'success', true,
    'bill_id', v_bill.id,
    'package_option_id', v_option.id,
    'amount_due', v_option.price,
    'had_app_invoice', v_had_app_invoice
  );
end;
$$;

revoke all on function public.revise_unpaid_academy_bill(uuid, uuid, text)
  from public, anon;
grant execute on function public.revise_unpaid_academy_bill(uuid, uuid, text)
  to authenticated;

comment on function public.revise_unpaid_academy_bill(uuid, uuid, text)
  is 'Changes the package option and amount of an unpaid current/next-month academy bill without modifying an owned user package.';

commit;
