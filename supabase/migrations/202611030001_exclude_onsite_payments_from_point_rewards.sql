begin;

-- Onsite payments settle tuition and issue the purchased entitlement, but they
-- are not eligible for payer or referral/upline reward points.
create or replace function public.distribute_matrix_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payer_record record;
  upline_record record;
  policy_record record;
  idx integer;
  upline_id_text text;
  earned_points integer;
  lineage_len integer;
  distance integer;
  log_reason text;
  award_log_id uuid;
  v_db_reason_self text;
  v_db_reason_1st text;
  v_db_reason_2nd text;
  v_db_reason_3rd text;
begin
  if lower(coalesce(new.status, '')) <> 'paid' then
    return new;
  end if;

  -- Cash, offline card and offline transfer confirmations all use this source.
  -- Keep the payment and entitlement workflow intact while skipping rewards.
  if lower(coalesce(new.source, '')) = 'onsite' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and lower(coalesce(old.status, '')) = 'paid' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('payment-point-award:' || new.id::text));

  select id, username, level, lineage
    into payer_record
    from public.users
   where id = new.user_id;

  if not found then
    return new;
  end if;

  select value_text into v_db_reason_self
    from public.point_settings where key = 'self_payment_reason';
  v_db_reason_self := coalesce(v_db_reason_self, '본인 결제 혜택 적립');

  select value_text into v_db_reason_1st
    from public.point_settings where key = 'tier1_payment_reason';
  v_db_reason_1st := coalesce(v_db_reason_1st, '{username} 님의 결제 보너스');

  select value_text into v_db_reason_2nd
    from public.point_settings where key = 'indirect_payment_reason';
  v_db_reason_2nd := coalesce(v_db_reason_2nd, '입소문 릴레이 포인트 적립');

  select value_text into v_db_reason_3rd
    from public.point_settings where key = 'tier3_payment_reason';
  v_db_reason_3rd := coalesce(v_db_reason_3rd, '꼬꼬무 릴레이 포인트 적립');

  select * into policy_record
    from public.level_policies
   where level = payer_record.level;

  if found
     and coalesce(policy_record.self_rate, 0) > 0
     and coalesce(new.final_amount, 0) > 0 then
    earned_points := round(new.final_amount * (policy_record.self_rate / 100));

    if earned_points > 0 then
      award_log_id := null;
      insert into public.point_logs (
        user_id, amount, type, reason, related_user_id, payment_id, created_at
      ) values (
        new.user_id, earned_points, 'earn', v_db_reason_self,
        new.user_id, new.id, new.created_at
      )
      on conflict (payment_id, user_id)
        where payment_id is not null and amount > 0
      do nothing
      returning id into award_log_id;

      if award_log_id is not null then
        update public.users
           set points = coalesce(points, 0) + earned_points
         where id = new.user_id;
      end if;
    end if;
  end if;

  lineage_len := coalesce(array_length(payer_record.lineage, 1), 0);

  if lineage_len > 0 then
    for idx in reverse lineage_len .. 1 loop
      upline_id_text := payer_record.lineage[idx];
      distance := lineage_len - idx + 1;

      select id, level
        into upline_record
        from public.users
       where id::text = upline_id_text
         and status is distinct from 'deleted';

      if found then
        select * into policy_record
          from public.level_policies
         where level = upline_record.level;

        if found then
          earned_points := 0;

          if distance = 1 then
            earned_points := round(new.final_amount * (coalesce(policy_record.gen1_rate, 0) / 100));
            log_reason := replace(v_db_reason_1st, '{username}', coalesce(payer_record.username, '회원'));
          elsif distance = 2 then
            earned_points := round(new.final_amount * (coalesce(policy_record.gen2_rate, 0) / 100));
            log_reason := v_db_reason_2nd;
          else
            earned_points := coalesce(policy_record.gen3_fixed, 0);
            log_reason := v_db_reason_3rd;
          end if;

          if earned_points > 0 then
            award_log_id := null;
            insert into public.point_logs (
              user_id, amount, type, reason, related_user_id, payment_id, created_at
            ) values (
              upline_record.id, earned_points, 'earn', log_reason,
              new.user_id, new.id, new.created_at
            )
            on conflict (payment_id, user_id)
              where payment_id is not null and amount > 0
            do nothing
            returning id into award_log_id;

            if award_log_id is not null then
              update public.users
                 set points = coalesce(points, 0) + earned_points
               where id = upline_record.id;
            end if;
          end if;
        end if;
      end if;
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function public.distribute_matrix_points() from public;

comment on function public.distribute_matrix_points() is
  'Awards payment and referral points once per eligible paid payment; onsite payments are excluded.';

commit;
