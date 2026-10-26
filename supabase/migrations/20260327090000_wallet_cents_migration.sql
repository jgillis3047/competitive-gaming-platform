-- Migrate wallet/challenge economy storage from VC naming to cents naming.
-- This is additive + backfill first, so existing clients can continue working.

begin;

-- Wallet accounts: add canonical cents column
alter table if exists public.wallet_accounts
  add column if not exists balance_cents integer not null default 0;

update public.wallet_accounts
set balance_cents = coalesce(balance_vc, 0)
where balance_cents is null or balance_cents = 0;

-- Wallet transactions: add canonical cents column
alter table if exists public.wallet_transactions
  add column if not exists amount_cents integer not null default 0;

update public.wallet_transactions
set amount_cents = coalesce(amount_vc, 0)
where amount_cents is null or amount_cents = 0;

-- Challenges: add cents aliases for entry/prize amounts
alter table if exists public.challenges
  add column if not exists entry_fee_cents integer not null default 0;

alter table if exists public.challenges
  add column if not exists win_reward_cents integer not null default 0;

update public.challenges
set
  entry_fee_cents = coalesce(entry_fee_vc, 0),
  win_reward_cents = coalesce(win_reward_vc, 0)
where
  entry_fee_cents is null
  or win_reward_cents is null
  or (entry_fee_cents = 0 and coalesce(entry_fee_vc, 0) <> 0)
  or (win_reward_cents = 0 and coalesce(win_reward_vc, 0) <> 0);

-- Keep old/new wallet columns in sync during rollout.
create or replace function public.sync_wallet_money_columns()
returns trigger
language plpgsql
as $$
begin
  -- Prefer new cents columns as canonical when provided.
  if tg_table_name = 'wallet_accounts' then
    if new.balance_cents is null and new.balance_vc is not null then
      new.balance_cents := new.balance_vc;
    elsif new.balance_vc is null and new.balance_cents is not null then
      new.balance_vc := new.balance_cents;
    else
      new.balance_vc := coalesce(new.balance_cents, new.balance_vc, 0);
      new.balance_cents := coalesce(new.balance_cents, new.balance_vc, 0);
    end if;
  elsif tg_table_name = 'wallet_transactions' then
    if new.amount_cents is null and new.amount_vc is not null then
      new.amount_cents := new.amount_vc;
    elsif new.amount_vc is null and new.amount_cents is not null then
      new.amount_vc := new.amount_cents;
    else
      new.amount_vc := coalesce(new.amount_cents, new.amount_vc, 0);
      new.amount_cents := coalesce(new.amount_cents, new.amount_vc, 0);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_wallet_accounts_money on public.wallet_accounts;
create trigger trg_sync_wallet_accounts_money
before insert or update on public.wallet_accounts
for each row execute function public.sync_wallet_money_columns();

drop trigger if exists trg_sync_wallet_transactions_money on public.wallet_transactions;
create trigger trg_sync_wallet_transactions_money
before insert or update on public.wallet_transactions
for each row execute function public.sync_wallet_money_columns();

create index if not exists idx_wallet_accounts_user_balance_cents
  on public.wallet_accounts (user_id, balance_cents);

create index if not exists idx_wallet_transactions_wallet_amount_cents
  on public.wallet_transactions (wallet_id, amount_cents, created_at desc);

commit;
