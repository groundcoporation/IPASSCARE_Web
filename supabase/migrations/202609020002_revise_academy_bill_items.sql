begin;

alter table public.academy_bill_revision_logs
  add column if not exists action text not null default 'replace';

alter table public.academy_bill_revision_logs
  alter column bill_id drop not null,
  alter column previous_amount_due drop not null,
  alter column next_amount_due drop not null;

alter table public.academy_bill_revision_logs
  drop constraint if exists academy_bill_revision_logs_bill_id_fkey;
alter table public.academy_bill_revision_logs
  add constraint academy_bill_revision_logs_bill_id_fkey
  foreign key (bill_id) references public.academy_bills(id) on delete set null;

create or replace function public.revise_unpaid_academy_bill_items(
  p_student_id uuid,
  p_bill_month text,
  p_package_option_ids uuid[],
  p_reason text default '청구 이용권 구성 변경'
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
  v_branch_id text;
  v_current_month text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
  v_next_month text := to_char((now() at time zone 'Asia/Seoul') + interval '1 month', 'YYYY-MM');
  v_reason text := coalesce(nullif(btrim(p_reason), ''), '청구 이용권 구성 변경');
  v_requested_ids uuid[] := coalesce(p_package_option_ids, array[]::uuid[]);
  v_requested_count integer;
  v_valid_count integer;
  v_had_app_invoice boolean := false;
  v_bill_ids uuid[] := array[]::uuid[];
  v_new_bill_id uuid;
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
    raise exception '청구 구성 변경 권한이 없습니다.';
  end if;
  if p_bill_month not in (v_current_month, v_next_month) then
    raise exception '이번 달과 다음 달 청구서만 변경할 수 있습니다.';
  end if;

  select bill.branch_id into v_branch_id
  from public.academy_bills bill
  where bill.student_id = p_student_id
    and bill.bill_month = p_bill_month
  limit 1;

  if v_branch_id is null then
    raise exception '편집할 청구서를 찾을 수 없습니다.';
  end if;
  if not public.can_manage_branch(v_branch_id) then
    raise exception '다른 지점의 청구서는 변경할 수 없습니다.';
  end if;

  perform 1
  from public.academy_bills bill
  where bill.student_id = p_student_id
    and bill.bill_month = p_bill_month
  for update;

  if exists (
    select 1
    from public.academy_bills bill
    where bill.student_id = p_student_id
      and bill.bill_month = p_bill_month
      and (
        coalesce(bill.amount_paid, 0) > 0
        or coalesce(bill.status, 'unpaid') not in ('unpaid', 'declined', 'expired')
      )
  ) then
    raise exception '결제 또는 수납이 시작된 청구가 있어 구성을 변경할 수 없습니다.';
  end if;

  if exists (
    select 1
    from public.payments payment
    join public.academy_bills bill on bill.id = payment.academy_bill_id
    where bill.student_id = p_student_id
      and bill.bill_month = p_bill_month
      and lower(coalesce(payment.status, '')) in ('scheduled', 'pending', 'paid')
  ) then
    raise exception '예약 또는 완료된 결제 내역이 있어 청구 구성을 변경할 수 없습니다.';
  end if;

  select count(*) into v_requested_count
  from (select distinct unnest(v_requested_ids) as id) requested;

  select count(*) into v_valid_count
  from (
    select distinct requested.id
    from unnest(v_requested_ids) requested(id)
    join public.package_options option on option.id = requested.id
    join public.packages package on package.id = option.package_id
    where coalesce(option.price, 0) > 0
      and coalesce(option.branch_id, package.branch_id) is not distinct from v_branch_id
      and coalesce(package.voucher_type, 'lesson') <> 'gps'
  ) valid;

  if v_valid_count <> v_requested_count then
    raise exception '선택한 이용권 중 이 지점에서 청구할 수 없는 항목이 있습니다.';
  end if;

  for v_bill in
    select *
    from public.academy_bills bill
    where bill.student_id = p_student_id
      and bill.bill_month = p_bill_month
  loop
    if v_bill.payment_request_id is not null then
      v_had_app_invoice := true;
      if exists (
        select 1 from public.payment_requests request
        where request.id = v_bill.payment_request_id
          and coalesce(request.status, 'pending') not in ('pending', 'declined', 'expired')
      ) then
        raise exception '결제가 진행된 앱 청구서가 있어 변경할 수 없습니다.';
      end if;

      update public.payment_requests
      set status = 'expired',
          closed_at = now(),
          closed_by = v_actor.id,
          close_reason = '관리자 청구 이용권 구성 변경',
          updated_at = now()
      where id = v_bill.payment_request_id
        and status = 'pending';
    end if;

    insert into public.academy_bill_revision_logs(
      bill_id, branch_id, previous_package_option_id, next_package_option_id,
      previous_amount_due, next_amount_due, reason, changed_by, action
    ) values (
      v_bill.id, v_branch_id, v_bill.package_option_id, null,
      v_bill.amount_due, null, v_reason, v_actor.id, 'remove'
    );
  end loop;

  delete from public.academy_bills bill
  where bill.student_id = p_student_id
    and bill.bill_month = p_bill_month;

  for v_option in
    select option.*
    from public.package_options option
    join (select distinct unnest(v_requested_ids) as id) requested on requested.id = option.id
    order by option.display_order nulls last, option.price, option.id
  loop
    insert into public.academy_bills(
      branch_id, student_id, class_schedule_id, package_option_id, bill_month,
      amount_due, amount_paid, billing_date, status, memo,
      revision, revised_at, revised_by
    ) values (
      v_branch_id, p_student_id, null, v_option.id, p_bill_month,
      v_option.price, 0, (now() at time zone 'Asia/Seoul')::date, 'unpaid',
      '관리자 청구 이용권 구성 편집', 1, now(), v_actor.id
    ) returning id into v_new_bill_id;

    v_bill_ids := array_append(v_bill_ids, v_new_bill_id);

    insert into public.academy_bill_revision_logs(
      bill_id, branch_id, previous_package_option_id, next_package_option_id,
      previous_amount_due, next_amount_due, reason, changed_by, action
    ) values (
      v_new_bill_id, v_branch_id, null, v_option.id,
      null, v_option.price, v_reason, v_actor.id, 'add'
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'student_id', p_student_id,
    'bill_month', p_bill_month,
    'bill_ids', to_jsonb(v_bill_ids),
    'item_count', coalesce(array_length(v_bill_ids, 1), 0),
    'had_app_invoice', v_had_app_invoice
  );
end;
$$;

revoke all on function public.revise_unpaid_academy_bill_items(uuid, text, uuid[], text)
  from public, anon;
grant execute on function public.revise_unpaid_academy_bill_items(uuid, text, uuid[], text)
  to authenticated;

commit;
