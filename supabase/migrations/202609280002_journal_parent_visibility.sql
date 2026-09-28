alter table public.academy_study_logs
  add column if not exists is_parent_visible boolean not null default false;

alter table public.academy_counsel_logs
  add column if not exists is_parent_visible boolean not null default false;

create or replace function public.sync_study_log_to_parents()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.parent_journal_entries where journal_type = 'study' and source_id = old.id;
    return old;
  end if;
  delete from public.parent_journal_entries where journal_type = 'study' and source_id = new.id;
  if not coalesce(new.is_parent_visible, false) then return new; end if;
  insert into public.parent_journal_entries (
    journal_type, source_id, parent_id, child_id, branch_id, journal_date,
    title, author_name, child_name, class_name, content, homework, special_note,
    created_at, updated_at
  )
  select distinct 'study', new.id, c.parent_id, c.id, new.branch_id, new.lesson_date,
    new.title, new.teacher_name, c.child_name, new.class_name, new.content,
    new.homework, new.special_note, coalesce(new.created_at, now()), coalesce(new.updated_at, now())
  from public.student_schedule_assignments ssa
  join public.children c on c.id = ssa.child_id
  where ssa.schedule_id = new.class_schedule_id and coalesce(ssa.is_active, true)
    and (ssa.starts_on is null or ssa.starts_on <= new.lesson_date)
    and (ssa.ends_on is null or ssa.ends_on >= new.lesson_date)
    and c.parent_id is not null and c.deleted_at is null;
  return new;
end;
$$;

create or replace function public.sync_counsel_log_to_parent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.parent_journal_entries where journal_type = 'counsel' and source_id = old.id;
    return old;
  end if;
  delete from public.parent_journal_entries where journal_type = 'counsel' and source_id = new.id;
  if not coalesce(new.is_parent_visible, false) then return new; end if;
  insert into public.parent_journal_entries (
    journal_type, source_id, parent_id, child_id, branch_id, journal_date,
    title, author_name, child_name, category, content, created_at, updated_at
  )
  select 'counsel', new.id, coalesce(s.parent_user_id, c.parent_id), c.id,
    new.branch_id, new.counsel_date, new.category || ' 상담일지', new.counselor_name,
    coalesce(nullif(s.student_name, ''), c.child_name), new.category, new.content,
    coalesce(new.created_at, now()), coalesce(new.updated_at, now())
  from public.academy_students s
  join public.children c on c.id = s.child_id and c.deleted_at is null
  where s.id = new.student_id and coalesce(s.parent_user_id, c.parent_id) is not null;
  return new;
end;
$$;

-- Before this feature, journals were staff-only. Keep them private until staff explicitly publishes them.
delete from public.parent_journal_entries;
