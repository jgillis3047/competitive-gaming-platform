import "dotenv/config";

function stripePluginForProfile(plugins, isDevBuild) {
  return (plugins ?? []).map((entry) => {
    if (!Array.isArray(entry) || entry[0] !== "@stripe/stripe-react-native") return entry;
    const opts = { ...entry[1] };
    // Dev ad-hoc profiles lack Apple Pay on the provisioning profile; card payments still work.
    if (isDevBuild) delete opts.merchantIdentifier;
    return ["@stripe/stripe-react-native", opts];
  });
}

export default ({ config }) => {
  const isDevBuild = process.env.APP_ENV === "development";
  return {
    ...config,
    scheme: config.scheme ?? "gamingapp54",
    // Reanimated 4+ requires New Architecture on SDK 54 — keep enabled for all EAS profiles.
    newArchEnabled: config.newArchEnabled ?? true,
    plugins: stripePluginForProfile(config.plugins, isDevBuild),
    extra: {
      ...config.extra,
      // Prefer .env when set; never overwrite app.json fallbacks with undefined (blank screen on boot).
      EXPO_PUBLIC_SUPABASE_URL:
        process.env.EXPO_PUBLIC_SUPABASE_URL ?? config.extra?.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY:
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? config.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY:
        process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? config.extra?.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      EXPO_PUBLIC_SUPPORT_EMAIL:
        process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? config.extra?.EXPO_PUBLIC_SUPPORT_EMAIL,
      EXPO_PUBLIC_SENTRY_DSN:
        process.env.EXPO_PUBLIC_SENTRY_DSN ?? config.extra?.EXPO_PUBLIC_SENTRY_DSN,
      eas: {
        ...config.extra?.eas,
        projectId: process.env.EXPO_PUBLIC_PROJECT_ID ?? config.extra?.eas?.projectId,
      },
    },
  };
};