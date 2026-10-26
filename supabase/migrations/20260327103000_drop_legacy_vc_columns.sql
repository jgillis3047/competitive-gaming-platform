-- Hard final phase: remove legacy VC-named columns after cents migration.
-- Run this only after app + edge functions are deployed with cents-only reads/writes.

begin;

alter table if exists public.wallet_transactions
  drop column if exists amount_vc;

alter table if exists public.wallet_accounts
  drop column if exists balance_vc;

alter table if exists public.challenges
  drop column if exists entry_fee_vc;

alter table if exists public.challenges
  drop column if exists win_reward_vc;

commit;
