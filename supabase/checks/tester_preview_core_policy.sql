-- Develop-only policy candidate. The transaction always rolls back.
-- Review/test outside the shared migration queue; this does not authorize release.
begin;
set local lock_timeout = '4s';
set local statement_timeout = '25s';

do $guard$
begin
  if (select count(*) from public.branches
      where id ~ '^devsmoke-[a-f0-9]{10}-[12]$') < 2
    or exists (select 1 from public.branches where id !~ '^devsmoke-[a-f0-9]{10}-[12]$')
  then raise exception 'TESTER_PREVIEW_SYNTHETIC_FIXTURES_REQUIRED'; end if;

  -- Refuse if the expected policy baseline has changed.
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and ((c.relname in ('children', 'attendance_logs') and not c.relrowsecurity)
          or (c.relname in ('academy_students', 'academy_bills') and c.relrowsecurity))) <> 4
    or exists (select 1 from pg_policies where schemaname = 'public'
        and tablename in ('children', 'attendance_logs'))
  then raise exception 'TESTER_PREVIEW_POLICY_BASELINE_CHANGED'; end if;
end $guard$;

create schema ipasscare_preview_access;
revoke all on schema ipasscare_preview_access from public;
grant usage on schema ipasscare_preview_access to authenticated;

-- Use server-controlled Auth metadata as the scope, not a client-supplied filter
-- or the editable public profile. A stale tester token never regains broad access.
create function ipasscare_preview_access.core_scope()
returns text
language sql stable security definer set search_path = ''
as $scope$
  select coalesce((
    select case
      when a.raw_app_meta_data -> 'ipasscare_tester' = 'true'::jsonb then
        case when a.raw_app_meta_data ->> 'ipasscare_test_branch' ~ '^devsmoke-[a-f0-9]{10}-[12]$'
          and u.role = 'director' and u.status = 'active'
          and u.branch_id = a.raw_app_meta_data ->> 'ipasscare_test_branch'
        then u.branch_id else '' end
      when auth.jwt() -> 'app_metadata' -> 'ipasscare_tester' = 'true'::jsonb then ''
      else '*' end
    from auth.users a join public.users u on u.id = a.id
    where a.id = auth.uid()
  ), '');
$scope$;
revoke all on function ipasscare_preview_access.core_scope() from public, anon, authenticated;
grant execute on function ipasscare_preview_access.core_scope() to authenticated;

create function ipasscare_preview_access.is_tester_actor()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select a.raw_app_meta_data->'ipasscare_tester'='true'::jsonb
    from auth.users a where a.id=auth.uid()),false)
    or coalesce(auth.jwt()->'app_metadata'->'ipasscare_tester'='true'::jsonb,false);
$$;
revoke all on function ipasscare_preview_access.is_tester_actor() from public,anon;
grant execute on function ipasscare_preview_access.is_tester_actor() to authenticated;
-- SECURITY INVOKER is intentional: a definer trigger would bypass this guard.
-- Existing trusted server/definer RPCs retain their context and need separate audit.
create function ipasscare_preview_access.guard_tester_profile()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('anon','authenticated') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if current_user='authenticated' and ipasscare_preview_access.is_tester_actor() then
    if tg_op<>'UPDATE' then raise exception using errcode='42501',message='[PERMISSION_DENIED]'; end if;
    if old.id is distinct from auth.uid()
      or (to_jsonb(new)-array['name','phone','birth_date','push_token'])
        is distinct from (to_jsonb(old)-array['name','phone','birth_date','push_token'])
    then raise exception using errcode='42501',message='[PERMISSION_DENIED]'; end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function ipasscare_preview_access.guard_tester_profile() from public,anon,authenticated;
create trigger preview_guard_tester_profile before insert or update or delete on public.users
for each row execute function ipasscare_preview_access.guard_tester_profile();

alter table public.children enable row level security;
alter table public.attendance_logs enable row level security;

-- Preserve authenticated access for existing non-tester fixtures on these two
-- tables only. Anonymous access is no longer allowed. The restrictive policy
-- below also applies if another permissive policy is later added.
create policy preview_core_children_authenticated on public.children
  for all to authenticated using (true) with check (true);
create policy preview_core_attendance_authenticated on public.attendance_logs
  for all to authenticated using (true) with check (true);

do $policies$
declare
  table_name text;
begin
  foreach table_name in array array['children', 'attendance_logs', 'academy_students', 'academy_bills'] loop
    execute format('create policy preview_core_branch_guard on public.%I as restrictive for all to authenticated
      using (coalesce((select ipasscare_preview_access.core_scope()) in (''*'', nullif(branch_id, '''')), false))
      with check (coalesce((select ipasscare_preview_access.core_scope()) in (''*'', nullif(branch_id, '''')), false))', table_name);
  end loop;
end $policies$;

-- A matching branch string alone must not allow links to another branch's rows.
create function ipasscare_preview_access.valid_child_link(target_child uuid, target_branch text)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_child is null or exists (
    select 1 from public.children c where c.id = target_child and c.branch_id = target_branch
  );
$$;
create function ipasscare_preview_access.valid_student_link(target_student uuid, target_branch text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.academy_students s where s.id = target_student and s.branch_id = target_branch
  );
$$;
revoke all on function ipasscare_preview_access.valid_child_link(uuid,text) from public,anon;
revoke all on function ipasscare_preview_access.valid_student_link(uuid,text) from public,anon;
grant execute on function ipasscare_preview_access.valid_child_link(uuid,text) to authenticated;
grant execute on function ipasscare_preview_access.valid_student_link(uuid,text) to authenticated;
create policy preview_attendance_link_guard on public.attendance_logs as restrictive
  for all to authenticated using (true)
  with check ((select ipasscare_preview_access.core_scope()) = '*'
    or ipasscare_preview_access.valid_child_link(child_id,branch_id));
create policy preview_student_link_guard on public.academy_students as restrictive
  for all to authenticated using (true)
  with check ((select ipasscare_preview_access.core_scope()) = '*'
    or ipasscare_preview_access.valid_child_link(child_id,branch_id));
create policy preview_bill_link_guard on public.academy_bills as restrictive
  for all to authenticated using (true)
  with check ((select ipasscare_preview_access.core_scope()) = '*'
    or ipasscare_preview_access.valid_student_link(student_id,branch_id));

-- Read-only fixture queries using a transaction-local tester identity. No tester
-- permissions or fixtures are changed on the project after rollback.
do $check$
declare
  actor uuid;
  own_branch text;
  other_branch text;
begin
  select u.id, u.branch_id, left(u.branch_id, -1) || '2'
    into strict actor, own_branch, other_branch
  from public.users u
  where u.role = 'director' and u.status = 'active'
    and u.email ~ '^ipass-dev-[a-f0-9]{10}-director-a@example\.com$'
    and u.branch_id ~ '^devsmoke-[a-f0-9]{10}-1$'
  order by u.branch_id limit 1;

  if not exists (select 1 from public.children where branch_id = own_branch)
    or not exists (select 1 from public.children where branch_id = other_branch)
    or not exists (select 1 from public.attendance_logs where branch_id = own_branch)
    or not exists (select 1 from public.attendance_logs where branch_id = other_branch)
  then raise exception 'TESTER_PREVIEW_CROSS_BRANCH_FIXTURES_MISSING'; end if;

  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('ipasscare_tester', true, 'ipasscare_test_branch', own_branch)
  where id = actor;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if ipasscare_preview_access.core_scope() is distinct from own_branch
    or not exists (select 1 from public.children where branch_id = own_branch)
    or not exists (select 1 from public.attendance_logs where branch_id = own_branch)
    or exists (select 1 from public.children where branch_id is distinct from own_branch)
    or exists (select 1 from public.attendance_logs where branch_id is distinct from own_branch)
    or exists (select 1 from public.academy_students where branch_id is distinct from own_branch)
    or exists (select 1 from public.academy_bills where branch_id is distinct from own_branch)
  then raise exception 'TESTER_PREVIEW_CORE_SCOPE_FAILED'; end if;
  execute 'reset role';

  execute 'set local role anon';
  if exists (select 1 from public.children) or exists (select 1 from public.attendance_logs)
  then raise exception 'TESTER_PREVIEW_ANONYMOUS_SCOPE_FAILED'; end if;
  execute 'reset role';
end $check$;

select json_build_object(
  'core_read_scope_passed', true,
  'tables_checked', 4,
  'permanent_changes', false,
  'write_paths_verified', false,
  'release_approved', false
) as tester_core_report;
rollback;
