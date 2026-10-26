// components/thread/ThreadActionCard.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

export type ThreadActionKind = "primary" | "secondary" | "danger";

export type ThreadAction = {
  label: string;
  kind?: ThreadActionKind;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
};

export type ThreadActionCardProps = {
  // Header text
  title: string;

  // Optional lines
  subtitle?: string;
  meta?: string;
  timeLabel?: string;

  // Optional header UI
  iconName?: keyof typeof Ionicons.glyphMap; // defaults to "flash"
  badgeText?: string; // small chip on the right side (e.g., "Your turn", "Completed")

  // Optional “prompt mode”
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void | Promise<void>;
  onSecondary?: () => void | Promise<void>;
  primaryDisabled?: boolean;
  secondaryDisabled?: boolean;

  // Optional action buttons row (event mode)
  actions?: ThreadAction[];
};

function isPromise(x: any): x is Promise<any> {
  return Boolean(x && typeof x.then === "function");
}

export default function ThreadActionCard(props: ThreadActionCardProps) {
  const {
    title,
    subtitle,
    meta,
    timeLabel,
    iconName,
    badgeText,

    primaryLabel,
    secondaryLabel,
    onPrimary,
    onSecondary,
    primaryDisabled,
    secondaryDisabled,

    actions,
  } = props;

  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const isPrompt = useMemo(
    () => Boolean(primaryLabel && secondaryLabel && onPrimary && onSecondary),
    [primaryLabel, secondaryLabel, onPrimary, onSecondary]
  );

  const headerIcon = (iconName ?? "flash") as any;

  const run = async (actionId: string, fn?: () => void | Promise<void>) => {
    if (!fn) return;
    if (busyActionId) return;

    try {
      const res = fn();
      if (isPromise(res)) {
        setBusyActionId(actionId);
        await res;
      }
    } finally {
      setBusyActionId(null);
    }
  };

  const renderButton = (opts: {
    actionId: string;
    label: string;
    kind: ThreadActionKind;
    onPress: () => void | Promise<void>;
    disabled?: boolean;
  }) => {
    const { actionId, label, kind, onPress, disabled } = opts;

    const isBusy = busyActionId === actionId;
    const isDisabled = Boolean(disabled || isBusy);

    const btnStyle =
      kind === "primary" ? styles.primaryBtn : kind === "danger" ? styles.dangerBtn : styles.secondaryBtn;

    const textStyle =
      kind === "primary" ? styles.primaryText : kind === "danger" ? styles.dangerText : styles.secondaryText;

    return (
      <Pressable
        onPress={() => run(actionId, onPress)}
        disabled={isDisabled}
        style={({ pressed }) => [
          btnStyle,
          isDisabled && { opacity: 0.5 },
          pressed && !isDisabled && { opacity: 0.9 },
        ]}
      >
        {isBusy ? (
          <ActivityIndicator />
        ) : (
          <Text style={textStyle} numberOfLines={1}>
            {label}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.leftHeader}>
            <Ionicons name={headerIcon} size={16} color="rgba(255,255,255,0.85)" />
            <Text style={styles.title} numberOfLines={3}>
              {title}
            </Text>
          </View>

          {badgeText ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText} numberOfLines={1}>
                {badgeText}
              </Text>
            </View>
          ) : null}
        </View>

        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        {timeLabel ? <Text style={styles.time}>{timeLabel}</Text> : null}

        {/* Prompt Mode */}
        {isPrompt ? (
          <View style={styles.actionsRow}>
            {renderButton({
              actionId: "prompt_primary",
              label: String(primaryLabel),
              kind: "primary",
              onPress: onPrimary!,
              disabled: primaryDisabled,
            })}

            {renderButton({
              actionId: "prompt_secondary",
              label: String(secondaryLabel),
              kind: "secondary",
              onPress: onSecondary!,
              disabled: secondaryDisabled,
            })}
          </View>
        ) : actions?.length ? (
          // Event Mode
          <View style={styles.actionsRow}>
            {actions.map((a, idx) => {
              // ✅ React "key" must be on the mapped element (not inside renderButton)
              const reactKey = `${a.kind ?? "secondary"}:${a.label}:${idx}`;

              return (
                <React.Fragment key={reactKey}>
                  {renderButton({
                    actionId: reactKey, // also used for busy tracking
                    label: a.label,
                    kind: a.kind ?? "secondary",
                    onPress: a.onPress,
                    disabled: a.disabled,
                  })}
                </React.Fragment>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 10 },

  card: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: "#0d1324",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  leftHeader: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },

  title: { color: "#fff", fontWeight: "900", flex: 1 },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    maxWidth: 140,
  },
  badgeText: { color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 12 },

  subtitle: { color: "rgba(255,255,255,0.75)", fontWeight: "800", marginTop: 6 },
  meta: { color: "rgba(255,255,255,0.70)", fontWeight: "800", marginTop: 6 },
  time: { color: "rgba(255,255,255,0.45)", fontWeight: "800", marginTop: 6, fontSize: 11 },

  actionsRow: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" },

  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(99,102,241,0.35)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.55)",
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontWeight: "900" },

  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: "#fff", fontWeight: "900" },

  dangerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(239,68,68,0.20)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.45)",
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerText: { color: "#fff", fontWeight: "900" },
});
