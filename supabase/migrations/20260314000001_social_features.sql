-- Migration: Social features (daily rewards, referrals, activity feed, profile enhancements)

-- Daily rewards tracking
CREATE TABLE IF NOT EXISTS daily_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INT NOT NULL DEFAULT 0,
  last_claim_date DATE,
  total_claims INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Referral codes
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(code)
);

-- Referral tracking
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(referee_id)
);

-- Activity feed for social updates
CREATE TABLE IF NOT EXISTS activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_feed_user_id ON activity_feed(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_created_at ON activity_feed(created_at DESC);

-- Profile enhancements: bio, banner, favorite game
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS favorite_game TEXT;

-- RLS policies
ALTER TABLE daily_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

-- Daily rewards: users can read/write their own
CREATE POLICY "Users can view own daily_rewards" ON daily_rewards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own daily_rewards" ON daily_rewards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily_rewards" ON daily_rewards FOR UPDATE USING (auth.uid() = user_id);

-- Referral codes: users can view all codes (for lookup), insert own
CREATE POLICY "Anyone can view referral_codes" ON referral_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own referral_code" ON referral_codes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Referrals: users can view referrals they made or received, insert for themselves
CREATE POLICY "Users can view own referrals" ON referrals FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_id);
CREATE POLICY "Users can insert referral as referee" ON referrals FOR INSERT WITH CHECK (auth.uid() = referee_id);

-- Activity feed: users can view all activity, insert own
CREATE POLICY "Anyone can view activity_feed" ON activity_feed FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own activity" ON activity_feed FOR INSERT WITH CHECK (auth.uid() = user_id);
