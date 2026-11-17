begin;

alter table public.academy_students add column if not exists archived_at timestamptz;
-- The web roster no longer has a physical-delete path for authenticated staff.
revoke delete on public.academy_students from public, anon, authenticated;

create or replace function public.archive_academy_student(
  p_student_id uuid, p_child_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_student public.academy_students%rowtype;
  v_child public.children%rowtype;
  v_parent public.users%rowtype;
  v_at timestamptz := now();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_total int := 0;
  v_remaining int := 0;
  v_paid numeric := 0;
begin
  if auth.uid() is null then raise exception '[AUTH_REQUIRED]'; end if;
  if (p_student_id is null) = (p_child_id is null) then raise exception '[INPUT_INVALID]'; end if;

  if p_student_id is not null then
    select * into v_student from public.academy_students where id = p_student_id for update;
    if not found then raise exception '[DATA_REFERENCE_ERROR]'; end if;
    if not public.can_manage_academy_journal(v_student.branch_id) then raise exception '[PERMISSION_DENIED]'; end if;
    if v_student.archived_at is not null then return jsonb_build_object('status','already_archived'); end if;
  end if;

  if coalesce(p_child_id,v_student.child_id) is not null then
    select * into v_child from public.children where id = coalesce(p_child_id,v_student.child_id) for update;
    if not found or v_child.branch_id is null then raise exception '[DATA_REFERENCE_ERROR]'; end if;
    if not public.can_manage_academy_journal(v_child.branch_id) then raise exception '[PERMISSION_DENIED]'; end if;
    if v_student.id is null then
      select * into v_student from public.academy_students where child_id = v_child.id for update;
      if not found then
        insert into public.academy_students(child_id,parent_user_id,branch_id,student_name,attendance_code,is_sms_enabled)
        values(v_child.id,v_child.parent_id,v_child.branch_id,coalesce(v_child.child_name,'원생'),
          'APP-' || upper(substr(replace(v_child.id::text,'-',''),1,8)),false)
        returning * into v_student;
      end if;
    end if;
    if v_student.branch_id is distinct from v_child.branch_id
      or v_student.parent_user_id is distinct from v_child.parent_id
    then raise exception '[DATA_REFERENCE_ERROR]'; end if;
    if v_student.archived_at is not null then return jsonb_build_object('status','already_archived'); end if;
  end if;

  select * into v_parent from public.users where id = v_student.parent_user_id;
  if v_child.id is not null then
    if exists (select 1 from public.reservations r
      where r.child_id=v_child.id and r.branch_id=v_student.branch_id and r.class_date=v_today
        and r.deleted_at is null and r.pickup_shuttle_status='boarded' and r.dropoff_shuttle_status='pending'
    ) then raise exception '[CONFLICT_ERROR]'; end if;

    -- Preserve completed attendance, bills, payments and journals.
    update public.reservations set status='canceled', deleted_at=v_at, deleted_by=auth.uid()
    where child_id=v_child.id and branch_id=v_student.branch_id and class_date>=v_today
      and deleted_at is null and coalesce(attendance_status,'yet') in ('yet','확인전','예약')
      and pickup_shuttle_status <> 'boarded' and dropoff_shuttle_status <> 'dropped_off'
      and not exists (select 1 from public.package_usage_logs u
         where u.reservation_id=reservations.id and u.status='consumed');

    perform p.id from public.user_packages p where p.child_id=v_child.id and p.branch_id=v_student.branch_id
      order by p.id for update;
    select coalesce(sum(greatest(total_count,0)),0),
      coalesce(sum(least(greatest(remaining_count,0),greatest(total_count,0))),0),
      coalesce(sum(greatest(price,0)),0)
    into v_total,v_remaining,v_paid
    from public.user_packages where child_id=v_child.id and branch_id=v_student.branch_id and status='active';
    update public.package_usage_logs u set status='released',released_at=v_at
    from public.user_packages p
    where p.id=u.user_package_id and p.child_id=v_child.id and p.branch_id=v_student.branch_id and u.status='held';
    update public.user_packages set status='inactive'
    where child_id=v_child.id and branch_id=v_student.branch_id and status in ('active','pending','pending_payment','free_trial');
    update public.pickup_settings set is_active=false
    where child_id=v_child.id and branch_id=v_student.branch_id;
    update public.student_schedule_assignments set is_active=false,
      ends_on=greatest(starts_on,least(coalesce(ends_on,v_today),v_today)),updated_at=v_at
    where child_id=v_child.id and branch_id=v_student.branch_id and is_active;
    delete from public.shuttle_route_assignments a using public.shuttle_routes r
    where a.route_id=r.id and a.child_id=v_child.id and r.branch_id=v_student.branch_id;
    update public.children set deleted_at=v_at,deleted_by=auth.uid()
    where id=v_child.id and deleted_at is null;
  end if;

  update public.academy_students set archived_at=v_at,is_sms_enabled=false where id=v_student.id;
  update public.academy_student_classes set status='inactive'
  where student_id=v_student.id and status='active';
  update public.academy_student_monthly_plans set status='cancelled',updated_at=v_at
  where student_id=v_student.id and branch_id=v_student.branch_id and status='planned'
    and effective_month>=date_trunc('month',v_today::timestamp)::date;
  update public.academy_billing_automation_targets set is_enabled=false,updated_at=v_at,updated_by=auth.uid()
  where student_id=v_student.id and branch_id=v_student.branch_id;

  insert into public.user_withdrawals(user_id,user_name,phone,child_id,child_name,attendance_code,branch_id,
    reason,source,event_type,paid_amount,total_count,used_count,remaining_count,refund_status)
  values (v_student.parent_user_id,coalesce(v_parent.name,v_student.parent_name),
    coalesce(v_student.mother_phone,v_student.father_phone,v_student.student_phone),v_student.child_id,
    v_student.student_name,v_student.attendance_code,v_student.branch_id,
    coalesce(nullif(left(btrim(p_reason),300),''),'수강 종료'), 'admin','academy_withdrawal',
    v_paid,v_total,v_total-v_remaining,v_remaining,case when v_remaining>0 then 'pending' else 'none' end);
  return jsonb_build_object('status','archived');
end;
$$;

revoke all on function public.archive_academy_student(uuid,uuid,text) from public, anon;
grant execute on function public.archive_academy_student(uuid,uuid,text) to authenticated;

-- Block late or stale new bill creation, but leave existing bill settlement
-- and corrections that keep the same student untouched.
create or replace function public.require_active_student_for_new_bill()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.student_id is not distinct from new.student_id then return new; end if;
  end if;
  perform 1 from public.academy_students s
    where s.id=new.student_id and s.archived_at is null for share;
  if not found then raise exception '[BILL_STUDENT_INVALID]'; end if;
  return new;
end;
$$;
revoke all on function public.require_active_student_for_new_bill() from public, anon, authenticated;
drop trigger if exists require_active_student_for_new_bill on public.academy_bills;
create trigger require_active_student_for_new_bill before insert or update of student_id on public.academy_bills
for each row execute function public.require_active_student_for_new_bill();

commit;
