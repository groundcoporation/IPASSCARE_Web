begin;

create or replace function public.delete_unpaid_academy_bill(
  p_bill_id uuid,
  p_reason text default '수납 관리에서 청구서 삭제'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.users%rowtype;
  v_bill public.academy_bills%rowtype;
  v_request public.payment_requests%rowtype;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), '수납 관리에서 청구서 삭제');
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;

  select * into v_actor from public.users
  where id = auth.uid() and coalesce(status, 'active') = 'active';
  if v_actor.id is null or v_actor.role not in ('admin', 'director', 'teacher', 'coach') then
    raise exception '청구서 삭제 권한이 없습니다.';
  end if;

  select * into v_bill from public.academy_bills where id = p_bill_id for update;
  if v_bill.id is null then raise exception '청구서를 찾을 수 없습니다.'; end if;
  if not public.can_manage_branch(v_bill.branch_id) then
    raise exception '다른 지점의 청구서는 삭제할 수 없습니다.';
  end if;
  if coalesce(v_bill.amount_paid, 0) > 0
     or coalesce(v_bill.status, 'unpaid') not in ('unpaid', 'declined', 'expired') then
    raise exception '결제 또는 수납이 시작된 청구서는 삭제할 수 없습니다.';
  end if;
  if exists (
    select 1 from public.payments payment
    where payment.academy_bill_id = v_bill.id
      and lower(coalesce(payment.status, '')) in ('scheduled', 'pending', 'paid')
  ) then
    raise exception '예약 또는 완료된 결제 내역이 있어 삭제할 수 없습니다.';
  end if;

  if v_bill.payment_request_id is not null then
    select * into v_request from public.payment_requests
    where id = v_bill.payment_request_id for update;
    if v_request.id is not null
       and coalesce(v_request.status, 'pending') not in ('pending', 'declined', 'expired') then
      raise exception '결제가 진행된 앱 청구서는 삭제할 수 없습니다.';
    end if;
    update public.payment_requests
    set status = 'expired', closed_at = now(), closed_by = v_actor.id,
        close_reason = '관리자 청구서 삭제', updated_at = now()
    where id = v_bill.payment_request_id and status = 'pending';
  end if;

  insert into public.academy_bill_revision_logs(
    bill_id, branch_id, previous_package_option_id, next_package_option_id,
    previous_amount_due, next_amount_due, reason, changed_by, action
  ) values (
    v_bill.id, v_bill.branch_id, v_bill.package_option_id, null,
    v_bill.amount_due, null, v_reason, v_actor.id, 'delete'
  );

  delete from public.academy_bills where id = v_bill.id;
  return jsonb_build_object('success', true, 'bill_id', v_bill.id);
end;
$$;

revoke all on function public.delete_unpaid_academy_bill(uuid, text) from public, anon;
grant execute on function public.delete_unpaid_academy_bill(uuid, text) to authenticated;

commit;
