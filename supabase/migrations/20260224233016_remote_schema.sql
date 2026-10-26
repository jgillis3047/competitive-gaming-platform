


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."rematch_offer_status" AS ENUM (
    'pending',
    'accepted',
    'declined',
    'expired'
);


ALTER TYPE "public"."rematch_offer_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pair_key"("a" "uuid", "b" "uuid") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when a::text < b::text then a::text || ':' || b::text
    else b::text || ':' || a::text
  end;
$$;


ALTER FUNCTION "public"."_pair_key"("a" "uuid", "b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_refund_creator_on_expire"("p_challenge_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  ch record;
  creator_wallet_id uuid;
  entry_fee int;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found then return; end if;

  entry_fee := coalesce(ch.entry_fee_vc, 0);
  if entry_fee <= 0 then return; end if;

  select id into creator_wallet_id from public.wallet_accounts where user_id = ch.created_by;
  if creator_wallet_id is null then return; end if;

  begin
    insert into public.wallet_transactions(wallet_account_id, amount_vc, source, source_ref)
    values (creator_wallet_id, entry_fee, 'refund', p_challenge_id::text);

    update public.wallet_accounts set balance_vc = balance_vc + entry_fee where id = creator_wallet_id;
  exception when unique_violation then
  end;
end;
$$;


ALTER FUNCTION "public"."_refund_creator_on_expire"("p_challenge_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_wallet_delta"("p_user_id" "uuid", "p_amount_vc" integer, "p_source" "text", "p_source_ref" "uuid" DEFAULT NULL::"uuid", "p_memo" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  -- Ensure wallet exists
  select id, balance_vc
    into v_wallet_id, v_balance
  from public.wallet_accounts
  where user_id = p_user_id
  for update;

  if v_wallet_id is null then
    insert into public.wallet_accounts(user_id, balance_vc)
    values (p_user_id, 0)
    returning id, balance_vc into v_wallet_id, v_balance;
  end if;

  v_next := coalesce(v_balance, 0) + p_amount_vc;

  if v_next < 0 then
    raise exception 'apply_wallet_delta: insufficient VC';
  end if;

  update public.wallet_accounts
    set balance_vc = v_next,
        updated_at = now()
  where id = v_wallet_id;

  -- ✅ Map source → allowed type buckets: win | entry_fee | bonus | redeem
  v_type :=
    case
      when p_source = 'redeem' then 'redeem'
      when p_source like 'entry_fee%' then 'entry_fee'
      when p_source = 'refund' then 'entry_fee'  -- ✅ refunds are reversals of entry fees
      when p_source in ('win', 'reward', 'game_result') then 'win'
      when p_source = 'bonus' then 'bonus'
      else 'bonus'
    end;

  insert into public.wallet_transactions(
    wallet_id,
    type,
    description,
    amount_vc,
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
    p_source_ref,
    'posted'
  );

end;
$$;


ALTER FUNCTION "public"."apply_wallet_delta"("p_user_id" "uuid", "p_amount_vc" integer, "p_source" "text", "p_source_ref" "uuid", "p_memo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_challenge"("p_challenge_id" "uuid", "p_reason" "text" DEFAULT 'creator_cancelled'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_entry int;
  v_creator_id uuid;
  v_status text;
begin
  if p_challenge_id is null then
    raise exception 'cancel_challenge: missing challenge id';
  end if;

  -- lock challenge row and read current state
  select status, coalesce(entry_fee_vc, 0)
    into v_status, v_entry
  from public.challenges
  where id = p_challenge_id
  for update;

  if v_status is null then
    raise exception 'cancel_challenge: challenge not found';
  end if;

  -- Only allow cancel if still open (optional but recommended)
  if v_status <> 'open' then
    raise exception 'cancel_challenge: only open challenges can be cancelled';
  end if;

  -- find creator
  select user_id
    into v_creator_id
  from public.challenge_players
  where challenge_id = p_challenge_id and role = 'creator'
  limit 1;

  -- refund creator if entry fee exists
  if v_entry > 0 and v_creator_id is not null then
    begin
      perform public.apply_wallet_delta(v_creator_id, v_entry, 'refund', p_challenge_id, 'Creator cancelled');
    exception when unique_violation then
      null;
    end;
  end if;

  -- IMPORTANT: status cannot be 'cancelled' due to check constraint
  update public.challenges
  set status = 'completed',                     -- ✅ allowed
      winner_user_id = null,
      cancel_reason = coalesce(p_reason, 'creator_cancelled'),
      settlement_status = 'cancelled',
      canceled_at = now(),
      updated_at = now()
  where id = p_challenge_id;

end;
$$;


ALTER FUNCTION "public"."cancel_challenge"("p_challenge_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_wallet_for_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.wallet_accounts (user_id, balance_vc)
  values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."create_wallet_for_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_challenges_and_refund"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  c record;
  t record;
  refunded_count int := 0;
  expire_count int := 0;
begin
  -- Find expired challenges (open or in_progress) that aren't completed/canceled yet
  for c in
    select *
    from public.challenges
    where status in ('open', 'in_progress')
      and expires_at is not null
      and expires_at <= now()
      and completed_at is null
      and canceled_at is null
  loop
    -- Mark canceled with an explicit reason based on current status
    update public.challenges
    set
      status = 'canceled',
      canceled_at = now(),
      cancel_reason = case
        when c.status = 'open' then 'expired'
        else 'in_progress_timeout'
      end,
      settlement_status = coalesce(settlement_status, 'refunded')
    where id = c.id
      and status in ('open', 'in_progress')
      and canceled_at is null;

    if found then
      expire_count := expire_count + 1;
    end if;

    -- Refund any entry fees tied to this challenge (idempotent)
    for t in
      select *
      from public.wallet_transactions
      where source_ref = c.id::text
        and source in ('entry_fee_creator', 'entry_fee_opponent')
        and amount_vc < 0
    loop
      -- only refund once per original transaction
      if not exists (
        select 1
        from public.wallet_transactions r
        where r.source = 'refund'
          and r.source_ref = c.id::text
          and r.wallet_id = t.wallet_id
          and r.amount_vc = abs(t.amount_vc)
      ) then
        insert into public.wallet_transactions (
          wallet_id, amount_vc, source, source_ref, status, description
        )
        values (
          t.wallet_id,
          abs(t.amount_vc),
          'refund',
          c.id::text,
          'posted',
          'Auto-refund for expired challenge'
        );

        update public.wallet_accounts
        set balance_vc = balance_vc + abs(t.amount_vc),
            updated_at = now()
        where id = t.wallet_id;

        refunded_count := refunded_count + 1;
      end if;
    end loop;
  end loop;

  return expire_count;
end;
$$;


ALTER FUNCTION "public"."expire_challenges_and_refund"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_open_challenges"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r record;
  v_count int := 0;
  v_entry int;
  v_creator_id uuid;
begin
  for r in
    select id, entry_fee_vc
    from public.challenges
    where status = 'open'
      and expires_at is not null
      and expires_at < now()
    for update
  loop
    v_entry := coalesce(r.entry_fee_vc, 0);

    select user_id into v_creator_id
    from public.challenge_players
    where challenge_id = r.id and role = 'creator'
    limit 1;

    -- refund creator if they paid an entry fee
    if v_entry > 0 and v_creator_id is not null then
      begin
        -- keep source as 'refund' (apply_wallet_delta maps it to allowed type)
        perform public.apply_wallet_delta(v_creator_id, v_entry, 'refund', r.id, 'Expired refund');
      exception
        when unique_violation then
          -- ignore duplicate refund attempts
          null;
      end;
    end if;

    -- ✅ 'cancelled' not allowed by challenges_status_check → use 'completed'
    update public.challenges
      set status = 'completed',
          winner_user_id = null, -- optional: expired = no winner
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


ALTER FUNCTION "public"."expire_open_challenges"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_challenge"("p_challenge_id" "uuid", "p_winner_user_id" "uuid", "p_is_tie" boolean, "p_summary" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_status text;
  v_entry_fee bigint;
  v_win_reward bigint;
  v_p1 uuid;
  v_p2 uuid;
begin
  -- Must be logged in
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Lock challenge row so we can't double-complete
  select status, coalesce(entry_fee_vc,0), coalesce(win_reward_vc,0)
    into v_status, v_entry_fee, v_win_reward
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found';
  end if;

  -- Only participants can finalize
  if not exists (
    select 1 from public.challenge_players
    where challenge_id = p_challenge_id
      and user_id = auth.uid()
  ) then
    raise exception 'Not a participant';
  end if;

  -- Already completed? return success (idempotent)
  if v_status = 'completed' then
    return jsonb_build_object('ok', true, 'already_completed', true);
  end if;

  -- Get the two players
  select min(user_id), max(user_id)
    into v_p1, v_p2
  from public.challenge_players
  where challenge_id = p_challenge_id;

  if v_p1 is null or v_p2 is null then
    raise exception 'Both players not present';
  end if;

  -- Mark completed
  update public.challenges
  set status = 'completed',
      winner_user_id = case when p_is_tie then null else p_winner_user_id end,
      completed_at = now()
  where id = p_challenge_id
    and status <> 'completed';

  -- Event in the thread
  insert into public.challenge_events (challenge_id, type, actor_user_id, body, payload)
  values (
    p_challenge_id,
    'completed',
    auth.uid(),
    coalesce(p_summary, 'Match completed.'),
    jsonb_build_object(
      'winner_user_id', p_winner_user_id,
      'is_tie', p_is_tie
    )
  );

  -- Wallet payouts
  if p_is_tie then
    -- Refund entry fee to both (only if fee > 0)
    if v_entry_fee > 0 then
      update public.wallets set balance_vc = balance_vc + v_entry_fee where user_id = v_p1;
      update public.wallets set balance_vc = balance_vc + v_entry_fee where user_id = v_p2;
    end if;
  else
    -- Winner gets win_reward_vc (if > 0)
    if v_win_reward > 0 then
      update public.wallets set balance_vc = balance_vc + v_win_reward where user_id = p_winner_user_id;
    end if;
  end if;

  -- Feed post (tweet-style)
  insert into public.feed_posts (user_id, type, body, payload)
  values (
    case when p_is_tie then null else p_winner_user_id end,
    'challenge_result',
    coalesce(p_summary, 'Match completed.'),
    jsonb_build_object(
      'challenge_id', p_challenge_id,
      'winner_user_id', p_winner_user_id,
      'is_tie', p_is_tie,
      'entry_fee_vc', v_entry_fee,
      'win_reward_vc', v_win_reward
    )
  );

  return jsonb_build_object('ok', true, 'already_completed', false);
end;
$$;


ALTER FUNCTION "public"."finalize_challenge"("p_challenge_id" "uuid", "p_winner_user_id" "uuid", "p_is_tie" boolean, "p_summary" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_thread"("other_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  me uuid := auth.uid();
  low_id uuid;
  high_id uuid;
  pk text;
  tid uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  if other_user_id is null then
    raise exception 'other_user_id required';
  end if;

  if me < other_user_id then
    low_id := me; high_id := other_user_id;
  else
    low_id := other_user_id; high_id := me;
  end if;

  pk := public.thread_pair_key(me, other_user_id);

  select id into tid
  from public.threads
  where pair_key = pk;

  if tid is not null then
    return tid;
  end if;

  insert into public.threads (pair_key, user_low, user_high, last_message_at)
  values (pk, low_id, high_id, now())
  returning id into tid;

  return tid;
end;
$$;


ALTER FUNCTION "public"."get_or_create_thread"("other_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_thread_by_users"("a" "uuid", "b" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  pk text;
  tid uuid;
  low uuid;
  high uuid;
begin
  if a is null or b is null then
    raise exception 'a and b are required';
  end if;

  pk := public._pair_key(a,b);

  select id into tid
  from public.threads
  where pair_key = pk
  limit 1;

  if tid is not null then
    return tid;
  end if;

  -- sort to store as low/high (matches your games tab query)
  if a::text < b::text then
    low := a; high := b;
  else
    low := b; high := a;
  end if;

  insert into public.threads (pair_key, user_low, user_high, last_message_at, last_preview)
  values (pk, low, high, now(), null)
  returning id into tid;

  return tid;
end;
$$;


ALTER FUNCTION "public"."get_or_create_thread_by_users"("a" "uuid", "b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_wallet"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.wallet_accounts (user_id, balance_vc)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user_wallet"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_rematch_offer"("p_offer_id" "uuid", "p_accept" boolean) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_offer record;
  v_new_challenge_id uuid;
  v_now timestamptz := now();
begin
  -- Load + lock the offer row (prevents double-accept race)
  select *
  into v_offer
  from public.rematch_offers
  where id = p_offer_id
  for update;

  if not found then
    raise exception 'Rematch offer not found';
  end if;

  -- Only the invited player can respond
  if v_offer.to_user_id <> auth.uid() then
    raise exception 'Not allowed: only invited opponent can respond';
  end if;

  -- Must be pending
  if coalesce(v_offer.status, '') <> 'pending' then
    -- return existing accepted challenge if you later store it; for now just return null
    return null;
  end if;

  if not p_accept then
    update public.rematch_offers
      set status = 'declined',
          responded_at = v_now
    where id = p_offer_id;

    -- Optional: thread message
    insert into public.thread_messages (thread_id, sender_id, type, challenge_id, rematch_offer_id, payload)
    values (
      v_offer.thread_id,
      null,
      'system',
      v_offer.source_challenge_id,
      v_offer.id,
      jsonb_build_object('label','❌ Rematch declined.')
    );

    return null;
  end if;

  -- ACCEPT: create a new challenge.
  -- "created_by" should be the person who offered the rematch (from_user_id)
  insert into public.challenges (
    title,
    game_type,
    status,
    entry_fee_vc,
    win_reward_vc,
    created_by,
    invite_only,
    invited_user_id,
    opponent_user_id,
    expires_at,
    created_at,
    updated_at
  )
  values (
    'Rematch',
    v_offer.proposed_game_key,
    'open',
    v_offer.proposed_entry_fee,
    v_offer.proposed_prize,
    v_offer.from_user_id,
    true,
    v_offer.to_user_id,
    v_offer.to_user_id,
    now() + interval '60 minutes',
    v_now,
    v_now
  )
  returning id into v_new_challenge_id;

  -- Insert BOTH challenge_players rows (this is the part RLS was blocking)
  insert into public.challenge_players (challenge_id, user_id, role, score, submitted, checked_in_at, reported_winner_user_id)
  values
    (v_new_challenge_id, v_offer.from_user_id, 'creator', null, false, null, null),
    (v_new_challenge_id, v_offer.to_user_id,   'opponent', null, false, null, null);

  -- Mark offer accepted
  update public.rematch_offers
    set status = 'accepted',
        responded_at = v_now
  where id = p_offer_id;

  -- Optional: system message in thread pointing to new challenge
  insert into public.thread_messages (thread_id, sender_id, type, challenge_id, rematch_offer_id, payload)
  values (
    v_offer.thread_id,
    null,
    'system',
    v_new_challenge_id,
    v_offer.id,
    jsonb_build_object('label','✅ Rematch accepted. New challenge created.', 'new_challenge_id', v_new_challenge_id)
  );

  return v_new_challenge_id;
end;
$$;


ALTER FUNCTION "public"."respond_to_rematch_offer"("p_offer_id" "uuid", "p_accept" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_rematch_offer"("p_offer_id" "uuid", "p_responder_id" "uuid", "p_accept" boolean) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_offer record;
  v_new_challenge_id uuid;
begin

  -- Lock offer row
  select *
  into v_offer
  from public.rematch_offers
  where id = p_offer_id
  for update;

  if not found then
    raise exception 'Offer not found';
  end if;

  if v_offer.status <> 'pending' then
    return null;
  end if;

  if v_offer.to_user_id <> p_responder_id then
    raise exception 'Not authorized';
  end if;

  ------------------------------------------------
  -- DECLINE
  ------------------------------------------------
  if not p_accept then

    update public.rematch_offers
    set status = 'declined',
        responded_at = now()
    where id = p_offer_id;

    return null;
  end if;

  ------------------------------------------------
  -- ACCEPT
  ------------------------------------------------

  -- Create challenge
  insert into public.challenges (
    title,
    kind,
    game_type,
    status,
    entry_fee_vc,
    win_reward_vc,
    created_by,
    opponent_user_id,
    invite_only,
    invited_user_id,
    created_at,
    updated_at
  )
  values (
    'Rematch',
    'phone',
    v_offer.proposed_game_key,
    'accepted',
    v_offer.proposed_entry_fee,
    v_offer.proposed_prize,
    p_responder_id,
    v_offer.from_user_id,
    true,
    v_offer.from_user_id,
    now(),
    now()
  )
  returning id into v_new_challenge_id;

  -- Insert players
  insert into public.challenge_players (
    challenge_id,
    user_id,
    role,
    submitted,
    score
  )
  values
  (v_new_challenge_id, p_responder_id, 'creator', false, null),
  (v_new_challenge_id, v_offer.from_user_id, 'opponent', false, null);

  -- Mark offer accepted
  update public.rematch_offers
  set status = 'accepted',
      responded_at = now()
  where id = p_offer_id;

  return v_new_challenge_id;

end;
$$;


ALTER FUNCTION "public"."respond_to_rematch_offer"("p_offer_id" "uuid", "p_responder_id" "uuid", "p_accept" boolean) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."thread_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "challenge_id" "uuid",
    "rematch_offer_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "text" NOT NULL
);


ALTER TABLE "public"."thread_messages" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_thread_message"("p_thread_id" "uuid", "p_type" "text", "p_sender_id" "uuid", "p_challenge_id" "uuid", "p_payload" "jsonb") RETURNS "public"."thread_messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_row public.thread_messages;
begin
  insert into public.thread_messages (
    thread_id,
    type,
    sender_id,
    challenge_id,
    payload
  )
  values (
    p_thread_id,
    p_type,
    p_sender_id,
    p_challenge_id,
    p_payload
  )
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."send_thread_message"("p_thread_id" "uuid", "p_type" "text", "p_sender_id" "uuid", "p_challenge_id" "uuid", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_default_expires_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.expires_at is null then
    new.expires_at := now() + interval '30 minutes';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_default_expires_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_challenge"("p_challenge_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
  -- Lock challenge row
  select *
  into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    return;
  end if;

  -- Idempotency
  if ch.settled_at is not null then
    return;
  end if;

  if ch.status <> 'completed' then
    return;
  end if;

  entry_fee := coalesce(ch.entry_fee_vc, 0);
  reward := coalesce(ch.win_reward_vc, 0);
  winner_user := ch.winner_user_id;

  -- Resolve players
  select user_id
  into creator_user
  from public.challenge_players
  where challenge_id = p_challenge_id
    and role = 'creator'
  limit 1;

  select user_id
  into opponent_user
  from public.challenge_players
  where challenge_id = p_challenge_id
    and role = 'opponent'
  limit 1;

  -- 🚨 FIX: graceful exit if players missing
  if creator_user is null or opponent_user is null then
    update public.challenges
      set settlement_status = 'error',
          updated_at = now()
    where id = p_challenge_id;

    return;
  end if;

  -- Resolve wallets
  select id into creator_wallet
  from public.wallet_accounts
  where user_id = creator_user
  limit 1;

  select id into opponent_wallet
  from public.wallet_accounts
  where user_id = opponent_user
  limit 1;

  -- =========================
  -- TIE → REFUND BOTH
  -- =========================
  if winner_user is null then
    if entry_fee > 0 then
      insert into public.wallet_transactions
        (wallet_id, type, description, amount_vc, source, source_ref, status)
      values
        (creator_wallet, 'entry_fee', 'Refund: challenge tie', entry_fee, 'refund', p_challenge_id::text, 'posted');

      update public.wallet_accounts
        set balance_vc = balance_vc + entry_fee
      where id = creator_wallet;

      insert into public.wallet_transactions
        (wallet_id, type, description, amount_vc, source, source_ref, status)
      values
        (opponent_wallet, 'entry_fee', 'Refund: challenge tie', entry_fee, 'refund', p_challenge_id::text, 'posted');

      update public.wallet_accounts
        set balance_vc = balance_vc + entry_fee
      where id = opponent_wallet;
    end if;

    update public.challenges
      set settled_at = now(),
          settlement_status = 'refunded',
          updated_at = now()
    where id = p_challenge_id;

    return;
  end if;

  -- =========================
  -- WINNER → PAY REWARD
  -- =========================
  select id into winner_wallet
  from public.wallet_accounts
  where user_id = winner_user
  limit 1;

  if reward > 0 then
    insert into public.wallet_transactions
      (wallet_id, type, description, amount_vc, source, source_ref, status)
    values
      (winner_wallet, 'win', 'Win: challenge payout', reward, 'reward', p_challenge_id::text, 'posted');

    update public.wallet_accounts
      set balance_vc = balance_vc + reward
    where id = winner_wallet;
  end if;

  update public.challenges
    set settled_at = now(),
        settlement_status = 'paid',
        updated_at = now()
  where id = p_challenge_id;

end;
$$;


ALTER FUNCTION "public"."settle_challenge"("p_challenge_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."thread_pair_key"("a" "uuid", "b" "uuid") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when a < b then a::text || ':' || b::text
    else b::text || ':' || a::text
  end
$$;


ALTER FUNCTION "public"."thread_pair_key"("a" "uuid", "b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wallet_accounts_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."wallet_accounts_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wallet_transactions_set_type"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.type is null then
    new.type :=
      case
        when new.source like 'entry_fee%' then 'entry_fee'
        when new.source = 'reward' then 'reward'
        when new.source = 'refund' then 'refund'
        when new.source = 'redeem' then 'redeem'
        when new.source = 'bonus' then 'bonus'
        else 'bonus'
      end;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."wallet_transactions_set_type"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "challenge_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "actor_user_id" "uuid",
    "target_user_id" "uuid",
    "body" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."challenge_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "challenge_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "score" integer,
    "submitted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'player'::"text" NOT NULL,
    "checked_in_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "result_payload" "jsonb",
    "reported_winner_user_id" "uuid"
);


ALTER TABLE "public"."challenge_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_turns" (
    "challenge_id" "uuid" NOT NULL,
    "current_turn_user_id" "uuid",
    "state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "move_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."challenge_turns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "game_type" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "entry_fee_vc" integer DEFAULT 0 NOT NULL,
    "win_reward_vc" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "winner_user_id" "uuid",
    "settled_at" timestamp with time zone,
    "settlement_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "canceled_at" timestamp with time zone,
    "canceled_by" "uuid",
    "cancel_reason" "text",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:02:00'::interval),
    "message" "text",
    "kind" "text" DEFAULT 'phone'::"text" NOT NULL,
    "in_person_rules" "jsonb",
    "checkin_deadline" timestamp with time zone,
    "share_code" "text",
    "opponent_user_id" "uuid",
    "invited_user_id" "uuid",
    "invite_only" boolean DEFAULT false NOT NULL,
    CONSTRAINT "challenges_invite_only_requires_user" CHECK ((("invite_only" = false) OR ("invited_user_id" IS NOT NULL))),
    CONSTRAINT "challenges_kind_check" CHECK (("kind" = ANY (ARRAY['phone'::"text", 'in_person'::"text", 'admin_event'::"text"]))),
    CONSTRAINT "challenges_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'accepted'::"text", 'in-progress'::"text", 'checked-in'::"text", 'completed'::"text", 'cancelled'::"text", 'disputed'::"text"]))),
    CONSTRAINT "challenges_winner_requires_completed" CHECK ((("winner_user_id" IS NULL) OR ("status" = 'completed'::"text")))
);


ALTER TABLE "public"."challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "media_type" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "duration_ms" integer,
    "width" integer,
    "height" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "post_media_media_type_check" CHECK (("media_type" = ANY (ARRAY['video'::"text", 'image'::"text"])))
);


ALTER TABLE "public"."post_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "challenge_id" "uuid",
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "caption" "text",
    "kind" "text" DEFAULT 'social'::"text" NOT NULL,
    "media_path" "text",
    "media_type" "text",
    "media_mime" "text",
    "media_width" integer,
    "media_height" integer,
    "media_duration_ms" integer,
    CONSTRAINT "posts_media_type_check" CHECK (("media_type" = ANY (ARRAY['video'::"text", 'image'::"text"])))
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "rating" integer DEFAULT 1000 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    "phone" "text",
    "display_name" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rematch_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "to_user_id" "uuid" NOT NULL,
    "source_challenge_id" "uuid",
    "proposed_game_key" "text" NOT NULL,
    "proposed_entry_fee" integer NOT NULL,
    "proposed_prize" integer NOT NULL,
    "status" "public"."rematch_offer_status" DEFAULT 'pending'::"public"."rematch_offer_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone
);


ALTER TABLE "public"."rematch_offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_key" "text" NOT NULL,
    "user_low" "uuid" NOT NULL,
    "user_high" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_message_at" timestamp with time zone,
    "last_preview" "text"
);


ALTER TABLE "public"."threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "balance_vc" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wallet_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "amount_vc" integer DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'game_result'::"text" NOT NULL,
    "source_ref" "text",
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    CONSTRAINT "wallet_transactions_type_check" CHECK (("type" = ANY (ARRAY['win'::"text", 'entry_fee'::"text", 'bonus'::"text", 'redeem'::"text", 'refund'::"text"])))
);


ALTER TABLE "public"."wallet_transactions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."challenge_events"
    ADD CONSTRAINT "challenge_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenge_players"
    ADD CONSTRAINT "challenge_players_challenge_id_user_id_key" UNIQUE ("challenge_id", "user_id");



ALTER TABLE ONLY "public"."challenge_players"
    ADD CONSTRAINT "challenge_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenge_turns"
    ADD CONSTRAINT "challenge_turns_challenge_id_key" UNIQUE ("challenge_id");



ALTER TABLE ONLY "public"."challenge_turns"
    ADD CONSTRAINT "challenge_turns_pkey" PRIMARY KEY ("challenge_id");



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_media"
    ADD CONSTRAINT "post_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rematch_offers"
    ADD CONSTRAINT "rematch_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."thread_messages"
    ADD CONSTRAINT "thread_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_pair_key_key" UNIQUE ("pair_key");



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_accounts"
    ADD CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id");



CREATE INDEX "challenge_events_actor_idx" ON "public"."challenge_events" USING "btree" ("actor_user_id");



CREATE INDEX "challenge_events_challenge_id_created_at_idx" ON "public"."challenge_events" USING "btree" ("challenge_id", "created_at" DESC);



CREATE INDEX "challenge_turns_turn_idx" ON "public"."challenge_turns" USING "btree" ("current_turn_user_id");



CREATE INDEX "challenges_expires_at_idx" ON "public"."challenges" USING "btree" ("expires_at");



CREATE INDEX "challenges_invited_user_id_idx" ON "public"."challenges" USING "btree" ("invited_user_id");



CREATE INDEX "challenges_settlement_status_idx" ON "public"."challenges" USING "btree" ("settlement_status");



CREATE UNIQUE INDEX "challenges_share_code_uidx" ON "public"."challenges" USING "btree" ("share_code");



CREATE INDEX "challenges_status_idx" ON "public"."challenges" USING "btree" ("status");



CREATE INDEX "idx_challenge_players_challenge_id" ON "public"."challenge_players" USING "btree" ("challenge_id");



CREATE INDEX "idx_challenge_players_checked_in" ON "public"."challenge_players" USING "btree" ("challenge_id", "checked_in_at");



CREATE INDEX "idx_challenge_players_reported_winner" ON "public"."challenge_players" USING "btree" ("challenge_id", "reported_winner_user_id");



CREATE INDEX "idx_challenges_kind" ON "public"."challenges" USING "btree" ("kind");



CREATE INDEX "idx_post_media_post_id" ON "public"."post_media" USING "btree" ("post_id");



CREATE INDEX "idx_post_media_post_id_sort" ON "public"."post_media" USING "btree" ("post_id", "sort_order");



CREATE INDEX "idx_posts_challenge_id" ON "public"."posts" USING "btree" ("challenge_id");



CREATE INDEX "idx_posts_created_at" ON "public"."posts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_posts_user_id" ON "public"."posts" USING "btree" ("user_id");



CREATE INDEX "ix_challenge_players_challenge" ON "public"."challenge_players" USING "btree" ("challenge_id");



CREATE INDEX "ix_challenges_status_expires" ON "public"."challenges" USING "btree" ("status", "expires_at");



CREATE INDEX "post_media_created_at_idx" ON "public"."post_media" USING "btree" ("created_at");



CREATE INDEX "post_media_post_id_idx" ON "public"."post_media" USING "btree" ("post_id");



CREATE INDEX "post_media_user_id_idx" ON "public"."post_media" USING "btree" ("user_id");



CREATE INDEX "posts_challenge_id_idx" ON "public"."posts" USING "btree" ("challenge_id");



CREATE INDEX "posts_created_at_idx" ON "public"."posts" USING "btree" ("created_at");



CREATE INDEX "posts_user_id_idx" ON "public"."posts" USING "btree" ("user_id");



CREATE UNIQUE INDEX "profiles_email_key" ON "public"."profiles" USING "btree" ("lower"("email")) WHERE ("email" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_phone_key" ON "public"."profiles" USING "btree" ("phone") WHERE ("phone" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_username_key" ON "public"."profiles" USING "btree" ("lower"("username")) WHERE ("username" IS NOT NULL);



CREATE INDEX "rematch_offers_status_idx" ON "public"."rematch_offers" USING "btree" ("status");



CREATE INDEX "rematch_offers_thread_id_idx" ON "public"."rematch_offers" USING "btree" ("thread_id");



CREATE INDEX "rematch_offers_to_user_id_idx" ON "public"."rematch_offers" USING "btree" ("to_user_id");



CREATE INDEX "thread_messages_challenge_id_idx" ON "public"."thread_messages" USING "btree" ("challenge_id");



CREATE INDEX "thread_messages_thread_created_idx" ON "public"."thread_messages" USING "btree" ("thread_id", "created_at");



CREATE INDEX "thread_messages_thread_id_created_at_idx" ON "public"."thread_messages" USING "btree" ("thread_id", "created_at" DESC);



CREATE INDEX "threads_last_message_at_idx" ON "public"."threads" USING "btree" ("last_message_at" DESC);



CREATE UNIQUE INDEX "threads_pair_key_unique" ON "public"."threads" USING "btree" ("pair_key");



CREATE UNIQUE INDEX "threads_pair_unique" ON "public"."threads" USING "btree" ("user_low", "user_high");



CREATE INDEX "threads_user_high_idx" ON "public"."threads" USING "btree" ("user_high");



CREATE INDEX "threads_user_low_idx" ON "public"."threads" USING "btree" ("user_low");



CREATE UNIQUE INDEX "ux_challenge_players_challenge_user" ON "public"."challenge_players" USING "btree" ("challenge_id", "user_id");



CREATE UNIQUE INDEX "ux_wallet_accounts_user_id" ON "public"."wallet_accounts" USING "btree" ("user_id");



CREATE UNIQUE INDEX "wallet_accounts_user_id_idx" ON "public"."wallet_accounts" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "trg_set_default_expires_at" BEFORE INSERT ON "public"."challenges" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_expires_at"();



CREATE OR REPLACE TRIGGER "trg_threads_updated_at" BEFORE UPDATE ON "public"."threads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_wallet_transactions_set_type" BEFORE INSERT ON "public"."wallet_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."wallet_transactions_set_type"();



CREATE OR REPLACE TRIGGER "wallet_accounts_touch_updated_at_trg" BEFORE UPDATE ON "public"."wallet_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."wallet_accounts_touch_updated_at"();



ALTER TABLE ONLY "public"."challenge_events"
    ADD CONSTRAINT "challenge_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."challenge_events"
    ADD CONSTRAINT "challenge_events_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_events"
    ADD CONSTRAINT "challenge_events_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."challenge_players"
    ADD CONSTRAINT "challenge_players_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_players"
    ADD CONSTRAINT "challenge_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_turns"
    ADD CONSTRAINT "challenge_turns_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_turns"
    ADD CONSTRAINT "challenge_turns_current_turn_user_id_fkey" FOREIGN KEY ("current_turn_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_opponent_user_id_fkey" FOREIGN KEY ("opponent_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_winner_user_id_fkey" FOREIGN KEY ("winner_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."post_media"
    ADD CONSTRAINT "post_media_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_media"
    ADD CONSTRAINT "post_media_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rematch_offers"
    ADD CONSTRAINT "rematch_offers_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rematch_offers"
    ADD CONSTRAINT "rematch_offers_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rematch_offers"
    ADD CONSTRAINT "rematch_offers_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."thread_messages"
    ADD CONSTRAINT "thread_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."thread_messages"
    ADD CONSTRAINT "thread_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_user_high_fkey" FOREIGN KEY ("user_high") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_user_low_fkey" FOREIGN KEY ("user_low") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_accounts"
    ADD CONSTRAINT "wallet_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet_accounts"("id") ON DELETE CASCADE;



ALTER TABLE "public"."challenge_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "challenge_events_insert_participants" ON "public"."challenge_events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenge_events"."challenge_id") AND ("cp"."user_id" = "auth"."uid"())))));



CREATE POLICY "challenge_events_select_participants" ON "public"."challenge_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenge_events"."challenge_id") AND ("cp"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."challenge_players" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "challenge_players_insert_own" ON "public"."challenge_players" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "challenge_players_insert_self" ON "public"."challenge_players" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "challenge_players_select" ON "public"."challenge_players" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "challenge_players_select_auth" ON "public"."challenge_players" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "challenge_players_update_own" ON "public"."challenge_players" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "challenge_players_update_self" ON "public"."challenge_players" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."challenge_turns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "challenge_turns_insert_creator_only" ON "public"."challenge_turns" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."challenges" "c"
  WHERE (("c"."id" = "challenge_turns"."challenge_id") AND ("c"."created_by" = "auth"."uid"())))));



CREATE POLICY "challenge_turns_select_participants" ON "public"."challenge_turns" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenge_turns"."challenge_id") AND ("cp"."user_id" = "auth"."uid"())))));



CREATE POLICY "challenge_turns_update_only_current_turn" ON "public"."challenge_turns" FOR UPDATE USING ((("current_turn_user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenge_turns"."challenge_id") AND ("cp"."user_id" = "auth"."uid"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenge_turns"."challenge_id") AND ("cp"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."challenges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "challenges_delete_own" ON "public"."challenges" FOR DELETE TO "authenticated" USING (("created_by" = "auth"."uid"()));



CREATE POLICY "challenges_insert_own" ON "public"."challenges" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "challenges_select" ON "public"."challenges" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "challenges_select_auth" ON "public"."challenges" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "challenges_update_creator" ON "public"."challenges" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "challenges_update_own" ON "public"."challenges" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "challenges_update_participants" ON "public"."challenges" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenges"."id") AND ("cp"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenges"."id") AND ("cp"."user_id" = "auth"."uid"())))));



CREATE POLICY "challenges_update_policy" ON "public"."challenges" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "created_by") OR ("auth"."uid"() = "winner_user_id") OR ("status" = 'open'::"text"))) WITH CHECK ((("auth"."uid"() = "created_by") OR ("auth"."uid"() = "winner_user_id") OR ("status" = ANY (ARRAY['accepted'::"text", 'in-progress'::"text", 'completed'::"text"]))));



CREATE POLICY "delete own posts" ON "public"."posts" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "delete_own_media" ON "public"."post_media" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "delete_own_posts" ON "public"."posts" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "insert challenge events if participant" ON "public"."challenge_events" FOR INSERT WITH CHECK (((("actor_user_id" IS NULL) OR ("actor_user_id" = "auth"."uid"())) AND ((EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenge_events"."challenge_id") AND ("cp"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."challenges" "c"
  WHERE (("c"."id" = "challenge_events"."challenge_id") AND ("c"."created_by" = "auth"."uid"())))))));



CREATE POLICY "insert challenge posts only after completion" ON "public"."posts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND ("challenge_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."challenge_players" "cp"
     JOIN "public"."challenges" "c" ON (("c"."id" = "cp"."challenge_id")))
  WHERE (("cp"."challenge_id" = "posts"."challenge_id") AND ("cp"."user_id" = "auth"."uid"()) AND ("cp"."checked_in_at" IS NOT NULL) AND ("c"."completed_at" IS NOT NULL))))));



CREATE POLICY "insert global posts anytime" ON "public"."posts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND ("challenge_id" IS NULL)));



CREATE POLICY "insert turns if participant" ON "public"."challenge_turns" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenge_turns"."challenge_id") AND ("cp"."user_id" = "auth"."uid"())))));



CREATE POLICY "insert_media_for_own_posts" ON "public"."post_media" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "insert_own_posts" ON "public"."posts" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."post_media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "post_media_delete_owner" ON "public"."post_media" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "post_media_insert_own" ON "public"."post_media" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "post_media_insert_owner" ON "public"."post_media" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "post_media_read_public" ON "public"."post_media" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND (("p"."visibility" = 'public'::"text") OR ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "post_media_select_visible_parent" ON "public"."post_media" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND (("p"."user_id" = "auth"."uid"()) OR (("p"."challenge_id" IS NULL) AND (COALESCE("p"."visibility", 'public'::"text") = 'public'::"text")) OR (("p"."challenge_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."challenge_players" "cp"
          WHERE (("cp"."challenge_id" = "p"."challenge_id") AND ("cp"."user_id" = "auth"."uid"()))))))))));



CREATE POLICY "post_media_update_owner" ON "public"."post_media" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND ("p"."user_id" = "auth"."uid"())))))) WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND ("p"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "posts_delete_own" ON "public"."posts" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "posts_delete_owner" ON "public"."posts" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "posts_insert_own" ON "public"."posts" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "posts_insert_owner" ON "public"."posts" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "posts_read" ON "public"."posts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "posts_read_public" ON "public"."posts" FOR SELECT USING ((("visibility" = 'public'::"text") OR ("user_id" = "auth"."uid"())));



CREATE POLICY "posts_select_challenge_participants" ON "public"."posts" FOR SELECT TO "authenticated" USING ((("challenge_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "posts"."challenge_id") AND ("cp"."user_id" = "auth"."uid"()))))));



CREATE POLICY "posts_select_owner" ON "public"."posts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "posts_select_public_global" ON "public"."posts" FOR SELECT TO "authenticated" USING ((("challenge_id" IS NULL) AND (COALESCE("visibility", 'public'::"text") = 'public'::"text")));



CREATE POLICY "posts_update_own" ON "public"."posts" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "posts_update_owner" ON "public"."posts" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_all" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "read challenge events if participant" ON "public"."challenge_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenge_events"."challenge_id") AND ("cp"."user_id" = "auth"."uid"())))));



CREATE POLICY "read challenge posts for participants" ON "public"."posts" FOR SELECT TO "authenticated" USING ((("challenge_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "posts"."challenge_id") AND ("cp"."user_id" = "auth"."uid"()))))));



CREATE POLICY "read global posts" ON "public"."posts" FOR SELECT TO "authenticated" USING ((("challenge_id" IS NULL) AND (("visibility" = 'public'::"text") OR ("user_id" = "auth"."uid"()))));



CREATE POLICY "read turns if participant" ON "public"."challenge_turns" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenge_turns"."challenge_id") AND ("cp"."user_id" = "auth"."uid"())))));



CREATE POLICY "read_media_if_post_readable" ON "public"."post_media" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND (("p"."visibility" = 'public'::"text") OR ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "read_public_or_own_posts" ON "public"."posts" FOR SELECT USING ((("visibility" = 'public'::"text") OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."rematch_offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rematch_offers_delete_participants" ON "public"."rematch_offers" FOR DELETE USING ((("auth"."uid"() = "from_user_id") OR ("auth"."uid"() = "to_user_id")));



CREATE POLICY "rematch_offers_insert_from_user" ON "public"."rematch_offers" FOR INSERT WITH CHECK (("auth"."uid"() = "from_user_id"));



CREATE POLICY "rematch_offers_insert_member" ON "public"."rematch_offers" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "from_user_id") AND (EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "rematch_offers"."thread_id") AND (("t"."user_low" = "auth"."uid"()) OR ("t"."user_high" = "auth"."uid"())))))));



CREATE POLICY "rematch_offers_no_delete" ON "public"."rematch_offers" FOR DELETE USING (false);



CREATE POLICY "rematch_offers_select_member" ON "public"."rematch_offers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "rematch_offers"."thread_id") AND (("t"."user_low" = "auth"."uid"()) OR ("t"."user_high" = "auth"."uid"()))))));



CREATE POLICY "rematch_offers_select_participants" ON "public"."rematch_offers" FOR SELECT USING ((("auth"."uid"() = "from_user_id") OR ("auth"."uid"() = "to_user_id")));



CREATE POLICY "rematch_offers_update_member" ON "public"."rematch_offers" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "to_user_id") AND (EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "rematch_offers"."thread_id") AND (("t"."user_low" = "auth"."uid"()) OR ("t"."user_high" = "auth"."uid"()))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "rematch_offers"."thread_id") AND (("t"."user_low" = "auth"."uid"()) OR ("t"."user_high" = "auth"."uid"()))))));



CREATE POLICY "rematch_offers_update_participants" ON "public"."rematch_offers" FOR UPDATE USING ((("auth"."uid"() = "from_user_id") OR ("auth"."uid"() = "to_user_id"))) WITH CHECK ((("auth"."uid"() = "from_user_id") OR ("auth"."uid"() = "to_user_id")));



ALTER TABLE "public"."thread_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "thread_messages_insert" ON "public"."thread_messages" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "thread_messages"."thread_id") AND (("auth"."uid"() = "t"."user_low") OR ("auth"."uid"() = "t"."user_high"))))) AND (("sender_id" IS NULL) OR ("sender_id" = "auth"."uid"()))));



CREATE POLICY "thread_messages_insert_member" ON "public"."thread_messages" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "thread_messages"."thread_id") AND (("auth"."uid"() = "t"."user_low") OR ("auth"."uid"() = "t"."user_high"))))) AND (("sender_id" = "auth"."uid"()) OR ("sender_id" IS NULL))));



CREATE POLICY "thread_messages_insert_members" ON "public"."thread_messages" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "thread_messages"."thread_id") AND (("t"."user_low" = "auth"."uid"()) OR ("t"."user_high" = "auth"."uid"()))))));



CREATE POLICY "thread_messages_select" ON "public"."thread_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "thread_messages"."thread_id") AND (("auth"."uid"() = "t"."user_low") OR ("auth"."uid"() = "t"."user_high"))))));



CREATE POLICY "thread_messages_select_member" ON "public"."thread_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "thread_messages"."thread_id") AND (("auth"."uid"() = "t"."user_low") OR ("auth"."uid"() = "t"."user_high"))))));



CREATE POLICY "thread_messages_select_members" ON "public"."thread_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "thread_messages"."thread_id") AND (("t"."user_low" = "auth"."uid"()) OR ("t"."user_high" = "auth"."uid"()))))));



CREATE POLICY "thread_messages_update_resolve_prompt" ON "public"."thread_messages" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "thread_messages"."thread_id") AND (("t"."user_low" = "auth"."uid"()) OR ("t"."user_high" = "auth"."uid"()))))) AND (COALESCE(("payload" ->> 'kind'::"text"), ''::"text") = 'prompt'::"text") AND ((("payload" ->> 'target_user_id'::"text") IS NULL) OR (("payload" ->> 'target_user_id'::"text") = ("auth"."uid"())::"text")))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "thread_messages"."thread_id") AND (("t"."user_low" = "auth"."uid"()) OR ("t"."user_high" = "auth"."uid"()))))) AND (COALESCE(("payload" ->> 'kind'::"text"), ''::"text") = 'prompt'::"text") AND ((("payload" ->> 'target_user_id'::"text") IS NULL) OR (("payload" ->> 'target_user_id'::"text") = ("auth"."uid"())::"text"))));



ALTER TABLE "public"."threads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "threads_insert_member" ON "public"."threads" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_low") OR ("auth"."uid"() = "user_high")));



CREATE POLICY "threads_select" ON "public"."threads" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_low") OR ("auth"."uid"() = "user_high")));



CREATE POLICY "threads_select_member" ON "public"."threads" FOR SELECT USING ((("auth"."uid"() = "user_low") OR ("auth"."uid"() = "user_high")));



CREATE POLICY "threads_select_members" ON "public"."threads" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_low") OR ("auth"."uid"() = "user_high")));



CREATE POLICY "threads_update" ON "public"."threads" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_low") OR ("auth"."uid"() = "user_high"))) WITH CHECK ((("auth"."uid"() = "user_low") OR ("auth"."uid"() = "user_high")));



CREATE POLICY "threads_update_member" ON "public"."threads" FOR UPDATE USING ((("auth"."uid"() = "user_low") OR ("auth"."uid"() = "user_high"))) WITH CHECK ((("auth"."uid"() = "user_low") OR ("auth"."uid"() = "user_high")));



CREATE POLICY "turns_insert_by_creator" ON "public"."challenge_turns" FOR INSERT WITH CHECK (("auth"."uid"() IN ( SELECT "challenge_players"."user_id"
   FROM "public"."challenge_players"
  WHERE ("challenge_players"."challenge_id" = "challenge_turns"."challenge_id"))));



CREATE POLICY "turns_update_by_current_player" ON "public"."challenge_turns" FOR UPDATE USING (("auth"."uid"() = "current_turn_user_id"));



CREATE POLICY "update own posts" ON "public"."posts" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "update turns if current player" ON "public"."challenge_turns" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenge_turns"."challenge_id") AND ("cp"."user_id" = "auth"."uid"())))) AND ("current_turn_user_id" = "auth"."uid"()))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenge_turns"."challenge_id") AND ("cp"."user_id" = "auth"."uid"())))));



CREATE POLICY "update turns if participant" ON "public"."challenge_turns" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenge_turns"."challenge_id") AND ("cp"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."challenge_players" "cp"
  WHERE (("cp"."challenge_id" = "challenge_turns"."challenge_id") AND ("cp"."user_id" = "auth"."uid"())))));



CREATE POLICY "update_own_media" ON "public"."post_media" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "update_own_posts" ON "public"."posts" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."wallet_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_accounts_insert_own" ON "public"."wallet_accounts" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "wallet_accounts_select_own" ON "public"."wallet_accounts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "wallet_accounts_update_own" ON "public"."wallet_accounts" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."wallet_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_transactions_insert_own" ON "public"."wallet_transactions" FOR INSERT TO "authenticated" WITH CHECK (("wallet_id" IN ( SELECT "wallet_accounts"."id"
   FROM "public"."wallet_accounts"
  WHERE ("wallet_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "wallet_transactions_select_own" ON "public"."wallet_transactions" FOR SELECT TO "authenticated" USING (("wallet_id" IN ( SELECT "wallet_accounts"."id"
   FROM "public"."wallet_accounts"
  WHERE ("wallet_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "wallet_tx_insert_own_wallet" ON "public"."wallet_transactions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."wallet_accounts" "wa"
  WHERE (("wa"."id" = "wallet_transactions"."wallet_id") AND ("wa"."user_id" = "auth"."uid"())))));



CREATE POLICY "wallet_tx_select_own_wallet" ON "public"."wallet_transactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."wallet_accounts" "wa"
  WHERE (("wa"."id" = "wallet_transactions"."wallet_id") AND ("wa"."user_id" = "auth"."uid"())))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."_pair_key"("a" "uuid", "b" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_pair_key"("a" "uuid", "b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_pair_key"("a" "uuid", "b" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_refund_creator_on_expire"("p_challenge_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_refund_creator_on_expire"("p_challenge_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_refund_creator_on_expire"("p_challenge_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_wallet_delta"("p_user_id" "uuid", "p_amount_vc" integer, "p_source" "text", "p_source_ref" "uuid", "p_memo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_wallet_delta"("p_user_id" "uuid", "p_amount_vc" integer, "p_source" "text", "p_source_ref" "uuid", "p_memo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_wallet_delta"("p_user_id" "uuid", "p_amount_vc" integer, "p_source" "text", "p_source_ref" "uuid", "p_memo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_challenge"("p_challenge_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_challenge"("p_challenge_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_challenge"("p_challenge_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_challenge"("p_challenge_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_wallet_for_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_wallet_for_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_wallet_for_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_challenges_and_refund"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_challenges_and_refund"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_challenges_and_refund"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_open_challenges"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_open_challenges"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_open_challenges"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_open_challenges"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_challenge"("p_challenge_id" "uuid", "p_winner_user_id" "uuid", "p_is_tie" boolean, "p_summary" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_challenge"("p_challenge_id" "uuid", "p_winner_user_id" "uuid", "p_is_tie" boolean, "p_summary" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_challenge"("p_challenge_id" "uuid", "p_winner_user_id" "uuid", "p_is_tie" boolean, "p_summary" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_challenge"("p_challenge_id" "uuid", "p_winner_user_id" "uuid", "p_is_tie" boolean, "p_summary" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_thread"("other_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_thread"("other_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_thread"("other_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_thread_by_users"("a" "uuid", "b" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_thread_by_users"("a" "uuid", "b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_thread_by_users"("a" "uuid", "b" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_wallet"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_wallet"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_wallet"() TO "service_role";



GRANT ALL ON FUNCTION "public"."respond_to_rematch_offer"("p_offer_id" "uuid", "p_accept" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."respond_to_rematch_offer"("p_offer_id" "uuid", "p_accept" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_rematch_offer"("p_offer_id" "uuid", "p_accept" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."respond_to_rematch_offer"("p_offer_id" "uuid", "p_responder_id" "uuid", "p_accept" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."respond_to_rematch_offer"("p_offer_id" "uuid", "p_responder_id" "uuid", "p_accept" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_rematch_offer"("p_offer_id" "uuid", "p_responder_id" "uuid", "p_accept" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."thread_messages" TO "anon";
GRANT ALL ON TABLE "public"."thread_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."thread_messages" TO "service_role";



GRANT ALL ON FUNCTION "public"."send_thread_message"("p_thread_id" "uuid", "p_type" "text", "p_sender_id" "uuid", "p_challenge_id" "uuid", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."send_thread_message"("p_thread_id" "uuid", "p_type" "text", "p_sender_id" "uuid", "p_challenge_id" "uuid", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_thread_message"("p_thread_id" "uuid", "p_type" "text", "p_sender_id" "uuid", "p_challenge_id" "uuid", "p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_default_expires_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_default_expires_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_default_expires_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."settle_challenge"("p_challenge_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."settle_challenge"("p_challenge_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."settle_challenge"("p_challenge_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."settle_challenge"("p_challenge_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."thread_pair_key"("a" "uuid", "b" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."thread_pair_key"("a" "uuid", "b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."thread_pair_key"("a" "uuid", "b" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."wallet_accounts_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."wallet_accounts_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wallet_accounts_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wallet_transactions_set_type"() TO "anon";
GRANT ALL ON FUNCTION "public"."wallet_transactions_set_type"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wallet_transactions_set_type"() TO "service_role";


















GRANT ALL ON TABLE "public"."challenge_events" TO "anon";
GRANT ALL ON TABLE "public"."challenge_events" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_events" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_players" TO "anon";
GRANT ALL ON TABLE "public"."challenge_players" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_players" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_turns" TO "anon";
GRANT ALL ON TABLE "public"."challenge_turns" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_turns" TO "service_role";



GRANT ALL ON TABLE "public"."challenges" TO "anon";
GRANT ALL ON TABLE "public"."challenges" TO "authenticated";
GRANT ALL ON TABLE "public"."challenges" TO "service_role";



GRANT ALL ON TABLE "public"."post_media" TO "anon";
GRANT ALL ON TABLE "public"."post_media" TO "authenticated";
GRANT ALL ON TABLE "public"."post_media" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."rematch_offers" TO "anon";
GRANT ALL ON TABLE "public"."rematch_offers" TO "authenticated";
GRANT ALL ON TABLE "public"."rematch_offers" TO "service_role";



GRANT ALL ON TABLE "public"."threads" TO "anon";
GRANT ALL ON TABLE "public"."threads" TO "authenticated";
GRANT ALL ON TABLE "public"."threads" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_accounts" TO "anon";
GRANT ALL ON TABLE "public"."wallet_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_transactions" TO "anon";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































