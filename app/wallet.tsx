// app/(tabs)/wallet.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePaymentSheet } from "@stripe/stripe-react-native";

import { getPaymentIntentClientSecret } from "../lib/backend/stripeCheckout";
import { useAuthStore } from "../lib/data/authStore";
import { useWalletStore } from "../lib/data/walletStore";
import { APP_SCHEME, MERCHANT_DISPLAY_NAME } from "../lib/theme/brand";
import { colors } from "../lib/theme/colors";
import { radius, space } from "../lib/theme/spacing";
import EmptyState from "../lib/ui/EmptyState";
import { pressSoft, pressSoftIcon } from "../lib/ui/pressableStyles";

function formatMoneyFromCents(amountCents: number) {
  return formatUSD(Number(amountCents ?? 0) / 100);
}

function formatUSD(amount: number) {
  const n = Number(amount ?? 0);
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString();
  } catch {
    return iso;
  }
}

function labelForSource(source: string) {
  switch (source) {
    case "reward":
      return "Win reward";
    case "entry_fee_creator":
      return "Entry fee (creator)";
    case "entry_fee_opponent":
      return "Entry fee (opponent)";
    case "refund":
      return "Refund";
    case "redeem":
      return "Redeemed";
    case "bonus":
      return "Bonus";
    case "purchase":
      return "Wallet top-up";
    default:
      return source || "Transaction";
  }
}

const KEYPAD_ROWS: Array<Array<string>> = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "back"],
];

export default function WalletScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const transactions = useWalletStore((s) => s.transactions);
  const loading = useWalletStore((s) => s.loading);
  const error = useWalletStore((s) => s.error);

  const loadFromBackend = useWalletStore((s) => s.loadFromBackend);
  const refresh = useWalletStore((s) => s.refresh);
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  const balance = useWalletStore((s) => s.balance);
  // --- Cash App style amount entry ---
  const [amountDigits, setAmountDigits] = useState<string>("10");
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseToast, setPurchaseToast] = useState<string | null>(null);

  const amountCentsToTopUp = useMemo(() => {
    const dollars = Number(amountDigits || "0");
    return Math.max(0, Math.min(5000, dollars)) * 100;
  }, [amountDigits]);
  const isSmall = width < 380;

  const handleAddFunds = async () => {
    if (!user?.id) {
      Alert.alert("Sign in required", "Log in to add funds.");
      return;
    }
    if (amountCentsToTopUp < 100) {
      Alert.alert("Enter amount", "Minimum add amount is $1.00.");
      return;
    }

    try {
      setPurchaseLoading(true);
      const clientSecret = await getPaymentIntentClientSecret(amountCentsToTopUp, {
        purchaseType: "wallet_topup",
      });
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: MERCHANT_DISPLAY_NAME,
        returnURL: `${APP_SCHEME}://wallet`,
      });
      if (initError) {
        Alert.alert("Error", initError.message ?? "Could not initialize payment.");
        return;
      }
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code === "Canceled") return;
        Alert.alert("Payment failed", presentError.message ?? "Payment could not be completed.");
        return;
      }
      await refresh();
      const msg = `${formatMoneyFromCents(amountCentsToTopUp)} added to your wallet.`;
      setPurchaseToast(msg);
      setTimeout(() => setPurchaseToast(null), 2500);
    } catch (e: any) {
      console.error("[Wallet] add funds error:", e);
      Alert.alert("Error", e?.message ?? "Could not start payment.");
    } finally {
      setPurchaseLoading(false);
    }
  };

  const onKeyPress = (key: string) => {
    if (key === "back") {
      setAmountDigits((d) => (d.length ? d.slice(0, -1) : ""));
      return;
    }
    if (!/^\d$/.test(key)) return;
    setAmountDigits((d) => {
      const next = `${d}${key}`.replace(/^0+(?=\d)/, "");
      return next.slice(0, 4);
    });
  };

  useEffect(() => {
    if (user?.id) loadFromBackend();
  }, [user?.id, loadFromBackend]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/feed" as any);
  };

  const Header = (
    <View style={[styles.headerWrap, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={handleBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.screenTitle}>Wallet</Text>
        <View style={styles.topBarRightSpacer} />
      </View>

      {error ? <Text style={styles.errorText}>{String(error)}</Text> : null}

      <View style={styles.balanceHero}>
        <Text style={styles.balanceLabel}>Current balance</Text>
        <Text style={styles.balanceValue}>{formatMoneyFromCents(balance)}</Text>
        <Text style={styles.balanceSubLabel}>USD</Text>
      </View>

      <View style={styles.purchaseCard}>
        <Text style={styles.purchaseTitle}>Enter amount</Text>

        <View style={styles.cashAmountWrap}>
          <Text style={[styles.cashAmountPrefix, isSmall && { fontSize: 30 }]}>$</Text>
          <Text style={[styles.cashAmountInput, isSmall && { fontSize: 40 }]}>
            {Number(amountDigits || "0").toLocaleString("en-US")}
          </Text>
        </View>

        <View style={styles.keypad}>
          {KEYPAD_ROWS.map((row, ri) => (
            <View key={`row-${ri}`} style={styles.keypadRow}>
              {row.map((key) => {
                if (!key) return <View key={`empty-${ri}`} style={styles.keypadBtnGhost} />;
                if (key === "back") {
                  return (
                    <Pressable key="back" onPress={() => onKeyPress("back")} style={({ pressed }) => [styles.keypadBtn, pressSoft(pressed)]}>
                      <Ionicons name="backspace-outline" size={20} color={colors.text} />
                    </Pressable>
                  );
                }
                return (
                  <Pressable key={key} onPress={() => onKeyPress(key)} style={({ pressed }) => [styles.keypadBtn, pressSoft(pressed)]}>
                    <Text style={styles.keypadText}>{key}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => Alert.alert("Request money", "Coming soon.")}
            style={({ pressed }) => [styles.secondaryActionBtn, pressSoft(pressed)]}
          >
            <Text style={[styles.secondaryActionText, isSmall && { fontSize: 14 }]}>Request</Text>
          </Pressable>
          <Pressable
            onPress={handleAddFunds}
            disabled={purchaseLoading}
            style={({ pressed }) => [
              styles.buyBtn,
              pressSoft(pressed),
              purchaseLoading && { opacity: 0.6 },
            ]}
          >
            {purchaseLoading ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator color={colors.text} />
                <Text style={styles.buyBtnText}>Opening…</Text>
              </View>
            ) : (
              <Text style={[styles.buyBtnText, isSmall && { fontSize: 14 }]}>Add</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.purchaseFinePrint}>Amount: {formatMoneyFromCents(amountCentsToTopUp)}</Text>
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Transactions</Text>
        <View style={styles.sectionActions}>
          <Pressable onPress={() => router.push("/orders" as any)}>
            <Text style={styles.sectionHint}>Purchase history</Text>
          </Pressable>
          <Pressable onPress={refresh}>
            <Text style={styles.sectionHint}>Refresh</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {purchaseToast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{purchaseToast}</Text>
        </View>
      )}
      {loading && transactions.length === 0 ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading wallet…</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item: any) => String(item.id)}
          ListHeaderComponent={Header}
          contentContainerStyle={{ paddingBottom: 32 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => <TransactionRow tx={item} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState
                icon={<Ionicons name="wallet-outline" size={44} color={colors.textMuted} />}
                title="No transactions yet"
                subtitle="Add funds or play challenges - your activity will show up here."
              />
            </View>
          }
        />
      )}
    </View>
  );
}

function TransactionRow({ tx }: { tx: any }) {
  const amount = Number(tx.amount_cents ?? 0);
  const source = String(tx.source ?? "tx");
  const createdAt = String(tx.created_at ?? new Date().toISOString());
  const ref = tx.source_ref ? String(tx.source_ref) : null;

  const memo = ref ? `${labelForSource(source)} • ${ref}` : labelForSource(source);
  const sign = amount > 0 ? "+" : "";
  const amountColor =
    amount > 0 ? colors.txPositive : amount < 0 ? colors.txNegative : colors.textSecondary;

  return (
    <View style={styles.txRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.txDescription}>{memo}</Text>
        <Text style={styles.txMeta}>
          {source} • {formatDate(createdAt)}
        </Text>
      </View>
      <Text style={[styles.txAmount, { color: amountColor }]}>
        {sign}
        {formatMoneyFromCents(Math.abs(amount))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgFeed },

  headerWrap: { paddingHorizontal: space.lg, paddingBottom: 8 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    minHeight: 44,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  screenTitle: {
    flex: 1,
    textAlign: "center",
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  topBarRightSpacer: { width: 44, height: 44 },

  errorText: { color: colors.danger, marginTop: 8 },

  balanceHero: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  balanceLabel: { color: colors.textTertiary, fontWeight: "700", letterSpacing: 0.2 },
  balanceValue: { color: colors.text, fontSize: 52, fontWeight: "900", marginTop: 6 },
  balanceSubLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 4 },

  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    gap: 8,
  },
  sectionActions: { flexDirection: "row", alignItems: "center", gap: 14, flexShrink: 1, flexWrap: "wrap", justifyContent: "flex-end" },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  sectionHint: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },

  purchaseCard: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    padding: 12,
  },
  purchaseTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },

  cashAmountWrap: {
    marginTop: 10,
    height: 98,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  cashAmountPrefix: { color: colors.textSecondary, fontWeight: "900", fontSize: 34 },
  cashAmountInput: {
    minWidth: 0,
    maxWidth: "75%",
    color: colors.text,
    fontWeight: "900",
    fontSize: 50,
    textAlign: "center",
  },
  keypad: { marginTop: 10, gap: 7 },
  keypadRow: { flexDirection: "row", gap: 7 },
  keypadBtn: {
    flex: 1,
    height: 52,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  keypadBtnGhost: { flex: 1, height: 52 },
  keypadText: { color: colors.text, fontWeight: "900", fontSize: 21 },
  actionRow: { flexDirection: "row", gap: 9, marginTop: 12 },
  secondaryActionBtn: {
    flex: 1,
    borderRadius: 15,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: colors.line,
  },
  secondaryActionText: { color: colors.textSecondary, fontWeight: "900", fontSize: 16 },

  buyBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 15,
    paddingVertical: 13,
    alignItems: "center",
  },
  buyBtnText: { color: colors.text, fontWeight: "900", fontSize: 15 },

  purchaseFinePrint: { color: colors.textMuted, marginTop: 8, lineHeight: 16, fontSize: 12 },

  txRow: {
    marginHorizontal: space.lg,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  txDescription: { color: colors.text, fontWeight: "900", flexShrink: 1 },
  txMeta: { color: colors.textMuted, marginTop: 4, fontWeight: "700" },
  txAmount: { fontWeight: "900", fontSize: 16 },

  centerWrap: { paddingTop: 60, alignItems: "center" },
  loadingText: { color: colors.textTertiary, marginTop: 10, fontWeight: "800" },
  emptyWrap: { paddingVertical: space.lg, paddingHorizontal: space.md },

  toast: {
    position: "absolute",
    top: 60,
    left: space.lg,
    right: space.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: "rgba(34,197,94,0.95)",
    borderWidth: 1,
    borderColor: colors.success,
    zIndex: 20,
  },
  toastText: {
    color: colors.text,
    fontWeight: "800",
    textAlign: "center",
  },
});

