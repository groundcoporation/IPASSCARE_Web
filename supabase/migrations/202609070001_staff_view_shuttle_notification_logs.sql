begin;

drop policy if exists "Staff can view shuttle notification logs"
  on public.shuttle_notification_logs;

create policy "Staff can view shuttle notification logs"
on public.shuttle_notification_logs
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.users staff
    where staff.id = auth.uid()
      and public.is_staff_role(staff.role)
      and (
        staff.role = 'admin'
        or staff.branch_id is not distinct from shuttle_notification_logs.branch_id
      )
  )
);

commit;
