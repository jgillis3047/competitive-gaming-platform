-- Fix wallet/challenge SQL functions after balance_vc / amount_vc columns were dropped.
-- expire_open_challenges() already uses entry_fee_cents but calls apply_wallet_delta(),
-- which still referenced balance_vc and caused 42703 errors from the edge function.

begin;

-- Obsolete dual-column sync triggers (columns no longer exist).
drop trigger if exists trg_sync_wallet_accounts_money on public.wallet_accounts;
drop trigger if exists trg_sync_wallet_transactions_money on public.wallet_transactions;
drop function if exists public.sync_wallet_money_columns();

create or replace function public.apply_wallet_delta(
  p_user_id uuid,
  p_amount_vc integer,
  p_source text,
  p_source_ref uuid default null,
  p_memo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_balance integer;
  v_next integer;
  v_type text;
begin
  if p_user_id is null then
    raise exception 'apply_wallet_delta: missing user';
  end if;

  if p_amount_vc is null or p_amount_vc = 0 then
    raise exception 'apply_wallet_delta: amount must be non-zero';
  end if;

  if p_source is null or length(trim(p_source)) = 0 then
    raise exception 'apply_wallet_delta: missing source';
  end if;

  select id, balance_cents
    into v_wallet_id, v_balance
  from public.wallet_accounts
  where user_id = p_user_id
  for update;

  if v_wallet_id is null then
    insert into public.wallet_accounts(user_id, balance_cents)
    values (p_user_id, 0)
    returning id, balance_cents into v_wallet_id, v_balance;
  end if;

  v_next := coalesce(v_balance, 0) + p_amount_vc;

  if v_next < 0 then
    raise exception 'apply_wallet_delta: insufficient balance';
  end if;

  update public.wallet_accounts
    set balance_cents = v_next,
        updated_at = now()
  where id = v_wallet_id;

  v_type :=
    case
      when p_source = 'redeem' then 'redeem'
      when p_source like 'entry_fee%' then 'entry_fee'
      when p_source = 'refund' then 'entry_fee'
      when p_source in ('win', 'reward', 'game_result') then 'win'
      when p_source = 'bonus' then 'bonus'
      else 'bonus'
    end;

  insert into public.wallet_transactions(
    wallet_id,
    type,
    description,
    amount_cents,
    source,
    source_ref,
    status
  )
  values(
    v_wallet_id,
    v_type,
    coalesce(p_memo, p_source),
    p_amount_vc,
    p_source,
    p_source_ref::text,
    'posted'
  );
end;
$$;

create or replace function public.cancel_challenge(
  p_challenge_id uuid,
  p_reason text default 'creator_cancelled'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry int;
  v_creator_id uuid;
  v_status text;
begin
  if p_challenge_id is null then
    raise exception 'cancel_challenge: missing challenge id';
  end if;

  select status, coalesce(entry_fee_cents, 0)
    into v_status, v_entry
  from public.challenges
  where id = p_challenge_id
  for update;

  if v_status is null then
    raise exception 'cancel_challenge: challenge not found';
  end if;

  if v_status <> 'open' then
    raise exception 'cancel_challenge: only open challenges can be cancelled';
  end if;

  select user_id
    into v_creator_id
  from public.challenge_players
  where challenge_id = p_challenge_id and role = 'creator'
  limit 1;

  if v_entry > 0 and v_creator_id is not null then
    begin
      perform public.apply_wallet_delta(v_creator_id, v_entry, 'refund', p_challenge_id, 'Creator cancelled');
    exception when unique_violation then
      null;
    end;
  end if;

  update public.challenges
  set status = 'completed',
      winner_user_id = null,
      cancel_reason = coalesce(p_reason, 'creator_cancelled'),
      settlement_status = 'cancelled',
      canceled_at = now(),
      updated_at = now()
  where id = p_challenge_id;
end;
$$;

create or replace function public.settle_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch record;
  creator_user uuid;
  opponent_user uuid;
  winner_user uuid;
  creator_wallet uuid;
  opponent_wallet uuid;
  winner_wallet uuid;
  entry_fee int;
  reward int;
begin
  select *
  into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    return;
  end if;

  if ch.settled_at is not null then
    return;
  end if;

  if ch.status <> 'completed' then
    return;
  end if;

  entry_fee := coalesce(ch.entry_fee_cents, 0);
  reward := coalesce(ch.win_reward_cents, 0);
  winner_user := ch.winner_user_id;

  select user_id into creator_user
  from public.challenge_players
  where challenge_id = p_challenge_id and role = 'creator'
  limit 1;

  select user_id into opponent_user
  from public.challenge_players
  where challenge_id = p_challenge_id and role = 'opponent'
  limit 1;

  if creator_user is null or opponent_user is null then
    update public.challenges
      set settlement_status = 'error',
          updated_at = now()
    where id = p_challenge_id;
    return;
  end if;

  select id into creator_wallet from public.wallet_accounts where user_id = creator_user limit 1;
  select id into opponent_wallet from public.wallet_accounts where user_id = opponent_user limit 1;

  if winner_user is null then
    if entry_fee > 0 then
      insert into public.wallet_transactions
        (wallet_id, type, description, amount_cents, source, source_ref, status)
      values
        (creator_wallet, 'entry_fee', 'Refund: challenge tie', entry_fee, 'refund', p_challenge_id::text, 'posted');

      update public.wallet_accounts
        set balance_cents = balance_cents + entry_fee
      where id = creator_wallet;

      insert into public.wallet_transactions
        (wallet_id, type, description, amount_cents, source, source_ref, status)
      values
        (opponent_wallet, 'entry_fee', 'Refund: challenge tie', entry_fee, 'refund', p_challenge_id::text, 'posted');

      update public.wallet_accounts
        set balance_cents = balance_cents + entry_fee
      where id = opponent_wallet;
    end if;

    update public.challenges
      set settled_at = now(),
          settlement_status = 'refunded',
          updated_at = now()
    where id = p_challenge_id;

    return;
  end if;

  select id into winner_wallet from public.wallet_accounts where user_id = winner_user limit 1;

  if reward > 0 then
    insert into public.wallet_transactions
      (wallet_id, type, description, amount_cents, source, source_ref, status)
    values
      (winner_wallet, 'win', 'Win: challenge payout', reward, 'reward', p_challenge_id::text, 'posted');

    update public.wallet_accounts
      set balance_cents = balance_cents + reward
    where id = winner_wallet;
  end if;

  update public.challenges
    set settled_at = now(),
        settlement_status = 'paid',
        updated_at = now()
  where id = p_challenge_id;
end;
$$;

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

create or replace function public.create_wallet_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallet_accounts (user_id, balance_cents)
  values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.handle_new_user_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallet_accounts (user_id, balance_cents)
  values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Daily rewards RPC (text source_ref for non-uuid refs like daily_2026-05-29).
create or replace function public.credit_wallet(
  p_user_id uuid,
  p_amount integer,
  p_source_type text,
  p_source_ref text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_balance integer;
  v_next integer;
  v_type text;
begin
  if p_user_id is null then
    raise exception 'credit_wallet: missing user';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'credit_wallet: amount must be non-zero';
  end if;

  select id, balance_cents
    into v_wallet_id, v_balance
  from public.wallet_accounts
  where user_id = p_user_id
  for update;

  if v_wallet_id is null then
    insert into public.wallet_accounts(user_id, balance_cents)
    values (p_user_id, 0)
    returning id, balance_cents into v_wallet_id, v_balance;
  end if;

  v_next := coalesce(v_balance, 0) + p_amount;

  if v_next < 0 then
    raise exception 'credit_wallet: insufficient balance';
  end if;

  update public.wallet_accounts
    set balance_cents = v_next,
        updated_at = now()
  where id = v_wallet_id;

  v_type :=
    case
      when p_source_type = 'redeem' then 'redeem'
      when p_source_type like 'entry_fee%' then 'entry_fee'
      when p_source_type in ('win', 'reward', 'game_result') then 'win'
      else 'bonus'
    end;

  insert into public.wallet_transactions(
    wallet_id,
    type,
    description,
    amount_cents,
    source,
    source_ref,
    status
  )
  values(
    v_wallet_id,
    v_type,
    coalesce(p_note, p_source_type),
    p_amount,
    coalesce(p_source_type, 'bonus'),
    p_source_ref,
    'posted'
  );
end;
$$;

grant execute on function public.credit_wallet(uuid, integer, text, text, text) to authenticated;
grant execute on function public.credit_wallet(uuid, integer, text, text, text) to service_role;

commit;
