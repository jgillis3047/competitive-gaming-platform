// components/thread/ThreadMessageItem.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export type ThreadMessageVariant = "text" | "system";

export type ThreadMessageMeta = {
  id?: string;
  type?: string;
  payload?: any;
  challenge_id?: string | null;
  rematch_offer_id?: string | null;
  sender_id?: string | null;
  created_at?: string | null;
};

/**
 * NOTE:
 * - Prompts / action buttons are rendered by ThreadActionCard in the thread screen.
 * - This component is intentionally JUST bubbles + system pills.
 */
export type ThreadMessageItemProps = {
  mine: boolean;
  text: string;
  timeLabel?: string;
  variant?: ThreadMessageVariant;

  // kept for backward compatibility (not used here)
  meId?: string;
  message?: ThreadMessageMeta;
  onPromptAction?: any;
};

export default function ThreadMessageItem({
  mine,
  text,
  timeLabel,
  variant = "text",
}: ThreadMessageItemProps) {
  const showAsSystem = variant === "system";

  if (showAsSystem) {
    return (
      <View style={styles.systemWrap}>
        <View style={styles.systemPill}>
          <Text style={styles.systemText}>{text}</Text>
        </View>
        {timeLabel ? <Text style={styles.systemTime}>{timeLabel}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, mine ? styles.wrapMine : styles.wrapTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={styles.text}>{text}</Text>
        {timeLabel ? <Text style={styles.time}>{timeLabel}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Message rows
  wrap: {
    marginVertical: 6,
    flexDirection: "row",
  },
  wrapMine: {
    justifyContent: "flex-end",
  },
  wrapTheirs: {
    justifyContent: "flex-start",
  },

  // Bubbles - iMessage style
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bubbleMine: {
    backgroundColor: "rgba(99,102,241,0.35)",
    borderColor: "rgba(99,102,241,0.5)",
    borderTopRightRadius: 6,
  },
  bubbleTheirs: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.1)",
    borderTopLeftRadius: 6,
  },

  text: {
    color: "#fff",
    fontWeight: "800",
    lineHeight: 19,
    fontSize: 14,
  },
  time: {
    marginTop: 6,
    color: "rgba(255,255,255,0.45)",
    fontWeight: "800",
    fontSize: 10,
  },

  // System messages
  systemWrap: {
    alignItems: "center",
    marginVertical: 10,
  },
  systemPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    maxWidth: "90%",
  },
  systemText: {
    color: "rgba(255,255,255,0.75)",
    fontWeight: "900",
    textAlign: "center",
    fontSize: 12,
  },
  systemTime: {
    marginTop: 6,
    color: "rgba(255,255,255,0.35)",
    fontWeight: "800",
    fontSize: 10,
  },
});
