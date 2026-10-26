-- Fix expire_open_challenges() after VC -> cents migration.
-- The previous function referenced challenges.entry_fee_vc, which no longer exists.

begin;

create or replace function public.expire_open_challenges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
  v_entry int;
  v_creator_id uuid;
begin
  for r in
    select id, entry_fee_cents
    from public.challenges
    where status = 'open'
      and expires_at is not null
      and expires_at < now()
    for update
  loop
    v_entry := coalesce(r.entry_fee_cents, 0);

    select user_id into v_creator_id
    from public.challenge_players
    where challenge_id = r.id and role = 'creator'
    limit 1;

    if v_entry > 0 and v_creator_id is not null then
      begin
        perform public.apply_wallet_delta(v_creator_id, v_entry, 'refund', r.id, 'Expired refund');
      exception
        when unique_violation then
          -- idempotent refund guard
          null;
      end;
    end if;

    update public.challenges
      set status = 'completed',
          winner_user_id = null,
          canceled_at = now(),
          cancel_reason = 'expired',
          settlement_status = coalesce(settlement_status, 'cancelled'),
          updated_at = now()
    where id = r.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

commit;
