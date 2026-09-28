create table if not exists public.parent_journal_entries (
  id uuid primary key default gen_random_uuid(),
  journal_type text not null check (journal_type in ('study', 'counsel')),
  source_id uuid not null,
  parent_id uuid not null references public.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  branch_id text,
  journal_date date not null,
  title text not null,
  author_name text not null,
  child_name text not null,
  class_name text,
  category text,
  content text not null,
  homework text,
  special_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journal_type, source_id, parent_id, child_id)
);

create index if not exists parent_journal_entries_parent_date_idx
  on public.parent_journal_entries (parent_id, journal_date desc, created_at desc);

alter table public.parent_journal_entries enable row level security;

drop policy if exists parent_journal_entries_parent_read on public.parent_journal_entries;
create policy parent_journal_entries_parent_read
  on public.parent_journal_entries for select
  to authenticated
  using (parent_id = auth.uid());

grant select on public.parent_journal_entries to authenticated;

alter table public.notifications
  add column if not exists journal_entry_id uuid references public.parent_journal_entries(id) on delete set null;

create unique index if not exists notifications_user_journal_entry_key
  on public.notifications (user_id, journal_entry_id);

create or replace function public.sync_study_log_to_parents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.parent_journal_entries
    where journal_type = 'study' and source_id = old.id;
    return old;
  end if;

  delete from public.parent_journal_entries
  where journal_type = 'study' and source_id = new.id;

  insert into public.parent_journal_entries (
    journal_type, source_id, parent_id, child_id, branch_id, journal_date,
    title, author_name, child_name, class_name, content, homework, special_note,
    created_at, updated_at
  )
  select distinct
    'study', new.id, c.parent_id, c.id, new.branch_id, new.lesson_date,
    new.title, new.teacher_name, c.child_name, new.class_name, new.content,
    new.homework, new.special_note, coalesce(new.created_at, now()), coalesce(new.updated_at, now())
  from public.student_schedule_assignments ssa
  join public.children c on c.id = ssa.child_id
  where ssa.schedule_id = new.class_schedule_id
    and coalesce(ssa.is_active, true)
    and (ssa.starts_on is null or ssa.starts_on <= new.lesson_date)
    and (ssa.ends_on is null or ssa.ends_on >= new.lesson_date)
    and c.parent_id is not null
    and c.deleted_at is null;

  return new;
end;
$$;

create or replace function public.sync_counsel_log_to_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.parent_journal_entries
    where journal_type = 'counsel' and source_id = old.id;
    return old;
  end if;

  delete from public.parent_journal_entries
  where journal_type = 'counsel' and source_id = new.id;

  insert into public.parent_journal_entries (
    journal_type, source_id, parent_id, child_id, branch_id, journal_date,
    title, author_name, child_name, category, content, created_at, updated_at
  )
  select
    'counsel', new.id, coalesce(s.parent_user_id, c.parent_id), c.id,
    new.branch_id, new.counsel_date, new.category || ' 상담일지',
    new.counselor_name, coalesce(nullif(s.student_name, ''), c.child_name),
    new.category, new.content, coalesce(new.created_at, now()), coalesce(new.updated_at, now())
  from public.academy_students s
  join public.children c on c.id = s.child_id and c.deleted_at is null
  where s.id = new.student_id
    and coalesce(s.parent_user_id, c.parent_id) is not null;

  return new;
end;
$$;

drop trigger if exists sync_study_log_to_parents_trigger on public.academy_study_logs;
create trigger sync_study_log_to_parents_trigger
after insert or update or delete on public.academy_study_logs
for each row execute function public.sync_study_log_to_parents();

drop trigger if exists sync_counsel_log_to_parent_trigger on public.academy_counsel_logs;
create trigger sync_counsel_log_to_parent_trigger
after insert or update or delete on public.academy_counsel_logs
for each row execute function public.sync_counsel_log_to_parent();

-- Existing logs are published through the same trigger logic.
update public.academy_study_logs set updated_at = updated_at;
update public.academy_counsel_logs set updated_at = updated_at;
