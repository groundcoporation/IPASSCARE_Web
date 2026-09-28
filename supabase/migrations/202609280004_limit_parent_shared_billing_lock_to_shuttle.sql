begin;

-- Parent-owned lesson products are purchases that have not yet been assigned
-- to a child. They must not lock every linked child's monthly tuition plan.
-- Only child-owned products and intentionally shared shuttle products lock it.
do $$
declare
  v_function_definition text;
  v_updated_definition text;
  v_old_condition constant text :=
    'or (up.child_id is null and up.user_id = v_student.parent_user_id))';
  v_new_condition constant text :=
    'or (up.child_id is null and up.user_id = v_student.parent_user_id'
    || ' and up.voucher_type = ''shuttle''))';
begin
  select pg_catalog.pg_get_functiondef(proc.oid)
    into v_function_definition
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'save_current_month_student_billing_draft_locked'
    and pg_catalog.pg_get_function_identity_arguments(proc.oid)
      = 'p_student_id uuid, p_package_option_ids uuid[]';

  if v_function_definition is null then
    raise exception '잠금 청구 저장 함수를 찾을 수 없습니다. 202609280003 마이그레이션을 먼저 적용해 주세요.';
  end if;

  v_updated_definition := replace(
    v_function_definition,
    v_old_condition,
    v_new_condition
  );
  if v_updated_definition = v_function_definition then
    raise exception '학부모 공용 이용권 잠금 조건을 찾지 못했습니다. 함수 버전을 확인해 주세요.';
  end if;

  execute v_updated_definition;
end;
$$;

revoke all on function public.save_current_month_student_billing_draft_locked(uuid, uuid[])
  from public, anon, authenticated;

comment on function public.save_current_month_student_billing_draft_locked(uuid, uuid[]) is
  'Locks child-owned packages and parent-shared shuttle packages only; unassigned parent lesson purchases do not lock a child billing plan.';

commit;
