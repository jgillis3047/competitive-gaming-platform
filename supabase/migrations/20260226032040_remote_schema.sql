-- supabase/migrations/20260226032040_remote_schema.sql

DROP EXTENSION IF EXISTS "pg_net";

CREATE TRIGGER on_auth_user_created_wallet
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.create_wallet_for_new_user();