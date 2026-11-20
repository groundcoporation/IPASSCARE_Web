// Rollback-candidate rules only, not production migrations.
// Each listed RPC has been individually reviewed; do not infer coverage for others.
const denied = "raise exception using errcode='42501',message='[PERMISSION_DENIED]';";
const reservationScope = `if not exists(select 1 from public.reservations r
  where r.id=p_reservation_id and r.branch_id=ipasscare_preview_access.core_scope()) then ${denied} end if;`;
const catalogScope = `if not exists(select 1 from public.packages p
  where p.id=p_package_id and p.branch_id=ipasscare_preview_access.core_scope()) then ${denied} end if;`;
const studentScope = `if not exists(select 1 from public.academy_students s
  where s.id=p_student_id and s.branch_id=ipasscare_preview_access.core_scope()
    and (s.parent_user_id is null or exists(select 1 from public.users u where u.id=s.parent_user_id and u.branch_id=s.branch_id))
    and (s.child_id is null or exists(select 1 from public.children c where c.id=s.child_id and c.branch_id=s.branch_id
      and (s.parent_user_id is null or c.parent_id=s.parent_user_id)))) then ${denied} end if;`;
const classesScope = (...arrays) => `if exists(select 1 from unnest(${arrays.map(a=>`coalesce(${a},array[]::uuid[])`).join(' || ')}) selected(id)
  where not exists(select 1 from public.class_schedules s where s.id=selected.id
    and s.branch_id=ipasscare_preview_access.core_scope())) then ${denied} end if;`;
const optionsScope = (...arrays) => `if exists(select 1 from unnest(${arrays.map(a=>`coalesce(${a},array[]::uuid[])`).join(' || ')}) selected(id)
  where not exists(select 1 from public.package_options o join public.packages p on p.id=o.package_id
    where o.id=selected.id and o.branch_id=ipasscare_preview_access.core_scope()
      and p.branch_id=ipasscare_preview_access.core_scope())) then ${denied} end if;`;
const allMonthsScope = studentScope + classesScope('p_current_schedule_ids','p_next_schedule_ids')
  + optionsScope('p_current_package_option_ids','p_next_package_option_ids');
const planScope = `if not exists(select 1 from public.academy_student_monthly_plans p
  join public.academy_students s on s.id=p.student_id
  where p.id=p_plan_id and p.branch_id=ipasscare_preview_access.core_scope() and s.branch_id=p.branch_id)
  then ${denied} end if;`;
const memberChildScope = `if not exists(select 1 from public.children c join public.users u on u.id=c.parent_id
  where c.id=p_child_id and c.parent_id=p_user_id and c.branch_id=ipasscare_preview_access.core_scope()
    and u.branch_id=c.branch_id) then ${denied} end if;`;
export const testerPackageGrantScope = memberChildScope+optionsScope('array[p_package_option_id]')+classesScope('p_schedule_ids');
export const testerRpcRules = new Map([
  ['list_offline_payments(text,text)', `if p_branch_id is distinct from ipasscare_preview_access.core_scope() then ${denied} end if;`],
  ['schedule_offline_payment(uuid,integer,text,timestamp with time zone,text)', `if not exists(select 1 from public.academy_bills b
    where b.id=p_bill_id and b.branch_id=ipasscare_preview_access.core_scope()) then ${denied} end if;`],
  ...['confirm_offline_payment(uuid,text)','cancel_offline_payment(uuid,text)'].map(signature=>[signature,`if not exists(
    select 1 from public.payments p join public.users u on u.id=p.user_id
    where p.id=p_payment_id and p.branch_id=ipasscare_preview_access.core_scope() and u.branch_id=p.branch_id
      and (p.academy_bill_id is null or exists(select 1 from public.academy_bills b where b.id=p.academy_bill_id and b.branch_id=p.branch_id)))
    then ${denied} end if;`]),
  ['add_current_month_student_additional_billing_plan(uuid,uuid)', studentScope+optionsScope('array[p_package_option_id]')],
  ['delete_planned_additional_student_billing_item(uuid)', planScope],
  ['correct_billing_plan_to_owned_package(uuid,uuid)', planScope+`if not exists(select 1 from public.user_packages u
    join public.academy_student_monthly_plans p on p.id=p_plan_id
    join public.academy_students s on s.id=p.student_id
    join public.package_options o on o.id=u.option_id join public.packages product on product.id=o.package_id
    where u.id=p_user_package_id and u.branch_id=ipasscare_preview_access.core_scope()
      and u.child_id=s.child_id and u.user_id=s.parent_user_id
      and o.branch_id=u.branch_id and product.branch_id=u.branch_id) then ${denied} end if;`],
  // Testers must use the request-ID wrapper. The legacy API has no idempotency key.
  ['grant_member_package_with_schedule(uuid,uuid,uuid,date,uuid[])', denied],
  ['sync_current_month_child_schedule_with_package(uuid,uuid,uuid,uuid[])', memberChildScope+classesScope('p_schedule_ids')+`if not exists(
    select 1 from public.user_packages u where u.id=p_package_id and u.user_id=p_user_id
      and u.branch_id=ipasscare_preview_access.core_scope()) then ${denied} end if;`],
  ['save_student_schedule_and_billing_all_months(uuid,uuid[],uuid[],boolean,date,uuid[],uuid[],boolean)', allMonthsScope],
  ['save_student_schedule_and_billing_all_months(uuid,uuid[],uuid[],boolean,date,uuid[],uuid[])', allMonthsScope],
  ['save_current_month_student_schedule_and_billing(uuid,uuid[],boolean,uuid[])', studentScope+classesScope('p_schedule_ids')+optionsScope('p_package_option_ids')],
  ['save_future_month_student_schedule_and_billing(uuid,date,uuid[],uuid[])', studentScope+classesScope('p_schedule_ids')+optionsScope('p_package_option_ids')],
  ['sync_current_and_next_month_student_schedules(uuid,uuid[],boolean)', studentScope+classesScope('p_schedule_ids')],
  ['sync_current_month_student_schedules(uuid,uuid[])', studentScope+classesScope('p_schedule_ids')],
  ['sync_future_month_student_schedules(uuid,date,uuid[])', studentScope+classesScope('p_schedule_ids')],
  ['save_current_month_student_billing_draft(uuid,uuid[])', studentScope+optionsScope('p_package_option_ids')],
  ['save_student_monthly_package_plan(uuid,date,uuid[])', studentScope+optionsScope('p_package_option_ids')],
  ['reconcile_current_month_active_package_plans(uuid,uuid[])', studentScope+optionsScope('p_package_option_ids')],
  ['sync_current_month_child_schedule(uuid,uuid,uuid[])',
    `if not exists(select 1 from public.children c join public.users u on u.id=c.parent_id
      where c.id=p_child_id and c.parent_id=p_user_id
        and c.branch_id=ipasscare_preview_access.core_scope() and u.branch_id=c.branch_id) then ${denied} end if;`
    +classesScope('p_schedule_ids')],
  ['save_shuttle_route_with_assignments(uuid,text,text,text,text,uuid,text,double precision,double precision,jsonb)',
    `if p_branch_id is distinct from ipasscare_preview_access.core_scope() then ${denied} end if;
    if p_route_id is not null and not exists(select 1 from public.shuttle_routes r
      where r.id=p_route_id and r.branch_id=ipasscare_preview_access.core_scope()) then ${denied} end if;`],
  ['save_member_shuttle_settings(uuid,jsonb,jsonb)',
    `if not exists(select 1 from public.users u where u.id=p_user_id
      and u.branch_id=ipasscare_preview_access.core_scope()) then ${denied} end if;`],
  ['save_package_catalog(uuid,text,text,text,text,integer,boolean,boolean,text,jsonb)',
    `if p_branch_id is distinct from ipasscare_preview_access.core_scope() then ${denied} end if;
    if p_package_id is not null then ${catalogScope} end if;`],
  ['set_package_catalog_active(uuid,boolean)', catalogScope],
  ['retire_or_delete_package_catalog(uuid)', catalogScope],
  ['update_member_role(uuid,text)', ''],
  ['list_role_manageable_members(text)', ''],
  ['soft_delete_child(uuid)', `if not exists(select 1 from public.children c
    where c.id=p_child_id and c.branch_id=ipasscare_preview_access.core_scope()) then ${denied} end if;`],
  ['soft_delete_reservation(uuid)', reservationScope],
  ['cancel_class_reservation(uuid,uuid)', `if not exists(select 1 from public.reservations r
    where r.id=p_reservation_id and r.user_id=p_user_id
      and r.branch_id=ipasscare_preview_access.core_scope()) then ${denied} end if;
    -- The legacy implementation blindly adds one remaining use. For testers,
    -- use soft cancellation, whose reservation trigger releases the hold once.
    return public.soft_delete_reservation(p_reservation_id);`],
  ['process_referral_points(uuid,uuid,integer,text)', denied],
  ['grant_makeup_credit(uuid,integer,text)', `if not exists(select 1 from public.reservations r
    where r.id=p_origin_reservation_id and r.deleted_at is null
      and r.branch_id=ipasscare_preview_access.core_scope()) then ${denied} end if;`],
  ['assign_user_package_beneficiary(uuid,text,uuid)', `if not exists(select 1 from public.user_packages p
    where p.id=p_package_id and p.branch_id=ipasscare_preview_access.core_scope()) then ${denied} end if;
    if p_beneficiary_type='child' and not ipasscare_preview_access.valid_child_link(p_child_id,
      ipasscare_preview_access.core_scope()) then ${denied} end if;`],
  ['process_lesson_check_in(uuid,uuid,text,date)', `if p_reservation_id is not null then
      ${reservationScope}
    elsif p_branch_id is distinct from ipasscare_preview_access.core_scope()
      or not ipasscare_preview_access.valid_child_link(p_child_id,ipasscare_preview_access.core_scope())
    then ${denied} end if;`],
]);

export function patchTesterRpc(definition, rule) {
  const boundary = /\r?\nbegin\r?\n/i;
  if (!boundary.test(definition) || !/security definer/i.test(definition)) throw new Error('TESTER_RPC_LAYOUT_CHANGED');
  return definition.replace(boundary, () => `\nbegin\n  if ipasscare_preview_access.is_tester_actor() then
    if ipasscare_preview_access.core_scope()='' then ${denied} end if;
    ${rule}
  end if;\n`)+';';
}
