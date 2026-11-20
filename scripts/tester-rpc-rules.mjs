// Rollback-candidate rules only, not production migrations.
// Each listed RPC has been individually reviewed; do not infer coverage for others.
const denied = "raise exception using errcode='42501',message='[PERMISSION_DENIED]';";
const reservationScope = `if not exists(select 1 from public.reservations r
  where r.id=p_reservation_id and r.branch_id=ipasscare_preview_access.core_scope()) then ${denied} end if;`;
const catalogScope = `if not exists(select 1 from public.packages p
  where p.id=p_package_id and p.branch_id=ipasscare_preview_access.core_scope()) then ${denied} end if;`;
export const testerRpcRules = new Map([
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
