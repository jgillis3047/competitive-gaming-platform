// app/models/auth.ts

export type SupabaseUserId = string;

// This is the "minimal" authenticated user we care about in the app
export interface AuthUser {
  id: SupabaseUserId;
  email: string | null;
}

// Shape of the row in your `profiles` table.
// Keep optional fields flexible so it won't break if DB schema changes slightly.
export interface Profile {
  id: SupabaseUserId;
  email: string | null;
  username: string | null;
  phone: string | null;
  display_name: string | null;
  rating: number | null;
  avatar_url?: string | null;
  record_wins?: number | null;
  record_losses?: number | null;
  streak?: number | null;
  total_vc_won?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

// Convenience object your UI will mostly use
export interface AuthContext {
  user: AuthUser | null;
  profile: Profile | null;
}
