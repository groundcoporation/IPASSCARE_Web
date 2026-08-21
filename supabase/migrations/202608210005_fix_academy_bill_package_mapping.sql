begin;

alter table public.academy_bills
  add column if not exists package_option_id uuid
  references public.package_options(id) on delete set null;

create index if not exists academy_bills_package_option_id_idx
  on public.academy_bills(package_option_id);

create index if not exists academy_bills_student_month_option_idx
  on public.academy_bills(student_id, bill_month, package_option_id);

-- Recover the most likely option for old bills. New bills always persist the
-- exact option and no longer rely on this price/class inference.
update public.academy_bills bill
set package_option_id = (
  select mapping.package_option_id
  from public.academy_student_classes mapping
  join public.package_options option_row
    on option_row.id = mapping.package_option_id
  where mapping.student_id = bill.student_id
    and coalesce(mapping.status, 'active') = 'active'
    and (
      bill.class_schedule_id is null
      or mapping.class_schedule_id = bill.class_schedule_id
    )
  order by
    case when option_row.price = bill.amount_due then 0 else 1 end,
    mapping.registered_at desc nulls last
  limit 1
)
where bill.package_option_id is null;

-- The existing confirm_offline_payment RPC creates user_packages after a bill
-- is fully paid. Align that new pass with the bill's exact option and child in
-- a BEFORE INSERT trigger, without replacing the app's existing RPC.
create or replace function public.align_billed_user_package()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.academy_bills%rowtype;
  v_student public.academy_students%rowtype;
  v_option public.package_options%rowtype;
  v_package public.packages%rowtype;
begin
  if new.payment_id is null then
    return new;
  end if;

  select bill.*
  into v_bill
  from public.payments payment
  join public.academy_bills bill
    on bill.id = payment.academy_bill_id
  where payment.id = new.payment_id
    and bill.package_option_id is not null;

  if v_bill.id is null then
    return new;
  end if;

  select * into v_student
  from public.academy_students
  where id = v_bill.student_id;

  select * into v_option
  from public.package_options
  where id = v_bill.package_option_id;

  if v_student.id is null or v_option.id is null then
    return new;
  end if;

  select * into v_package
  from public.packages
  where id = v_option.package_id;

  new.user_id := v_student.parent_user_id;
  new.option_id := v_option.id;
  new.package_id := v_package.id;
  new.package_name := concat_ws(' - ', v_package.name, v_option.label);
  new.price := coalesce(v_option.price, v_bill.amount_due);
  new.total_count := greatest(coalesce(v_option.total_count, 1), 1);
  new.remaining_count := greatest(coalesce(v_option.total_count, 1), 1);
  new.weekly_limit := v_option.weekly_limit;
  new.voucher_type := coalesce(v_package.voucher_type, 'lesson');
  new.branch_id := v_bill.branch_id;
  new.child_id := v_student.child_id;
  new.child_name := case when v_student.child_id is not null then v_student.student_name else null end;
  new.beneficiary_type := case when v_student.child_id is not null then 'child' else 'self' end;

  return new;
end;
$$;

drop trigger if exists align_billed_user_package_before_insert
  on public.user_packages;

create trigger align_billed_user_package_before_insert
before insert on public.user_packages
for each row
execute function public.align_billed_user_package();

revoke all on function public.align_billed_user_package() from public, anon, authenticated;

commit;
