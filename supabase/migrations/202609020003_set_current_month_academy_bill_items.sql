begin;

create or replace function public.set_current_month_academy_bill_items(
  p_student_id uuid,
  p_package_option_ids uuid[],
  p_reason text default '학생 관리에서 이번 달 청구 구성 변경'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.academy_students%rowtype;
  v_option public.package_options%rowtype;
  v_month text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
  v_requested_ids uuid[] := coalesce(p_package_option_ids, array[]::uuid[]);
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_student
  from public.academy_students
  where id = p_student_id;

  if v_student.id is null then
    raise exception '학생을 찾을 수 없습니다.';
  end if;
  if not public.can_manage_branch(v_student.branch_id) then
    raise exception '다른 지점 학생의 청구서는 처리할 수 없습니다.';
  end if;
  if coalesce(array_length(v_requested_ids, 1), 0) = 0
     and not exists (
       select 1 from public.academy_bills
       where student_id = p_student_id and bill_month = v_month
     ) then
    return jsonb_build_object('success', true, 'bill_ids', '[]'::jsonb, 'item_count', 0);
  end if;

  if not exists (
    select 1 from public.academy_bills
    where student_id = p_student_id and bill_month = v_month
  ) then
    select option.* into v_option
    from public.package_options option
    where option.id = v_requested_ids[1];

    if v_option.id is null then
      raise exception '청구할 이용권을 찾을 수 없습니다.';
    end if;

    insert into public.academy_bills(
      branch_id, student_id, class_schedule_id, package_option_id, bill_month,
      amount_due, amount_paid, billing_date, status, memo
    ) values (
      v_student.branch_id, v_student.id, null, v_option.id, v_month,
      v_option.price, 0, (now() at time zone 'Asia/Seoul')::date, 'unpaid',
      '학생 관리에서 이번 달 청구 생성'
    );
  end if;

  return public.revise_unpaid_academy_bill_items(
    p_student_id,
    v_month,
    v_requested_ids,
    p_reason
  );
end;
$$;

revoke all on function public.set_current_month_academy_bill_items(uuid, uuid[], text)
  from public, anon;
grant execute on function public.set_current_month_academy_bill_items(uuid, uuid[], text)
  to authenticated;

commit;
