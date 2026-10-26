import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useWalletStore } from "../lib/data/walletStore";
import { colors } from "../lib/theme/colors";
import { pressSoftIcon } from "../lib/ui/pressableStyles";

function formatMoney(n?: number | null) {
  const dollars = Number(n ?? 0) / 100;
  return `$${dollars.toFixed(2)}`;
}

type Props = {
  /** Icon-only tap target — full balance still on /wallet */
  variant?: "default" | "compact";
};

export default function WalletPill({ variant = "default" }: Props) {
  const router = useRouter();
  const balance = useWalletStore((s: any) => s.balance_cents ?? s.balanceCents ?? s.balance ?? 0);

  const text = useMemo(() => formatMoney(balance), [balance]);

  if (variant === "compact") {
    return (
      <Pressable
        onPress={() => router.push("/wallet")}
        style={({ pressed }) => [styles.compactBtn, pressSoftIcon(pressed)]}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Wallet ${text}`}
      >
        <Ionicons name="wallet-outline" size={24} color={colors.text} />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => router.push("/wallet")}
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.9 }]}
      hitSlop={10}
    >
      <Ionicons name="wallet-outline" size={15} color="#dbe4ff" />
      <Text style={styles.vc}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compactBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  vc: { color: "#e8edff", fontWeight: "800", fontSize: 13 },
});
