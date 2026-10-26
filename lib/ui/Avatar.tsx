// lib/ui/Avatar.tsx - Reusable avatar: image or initials
import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { toAvatarPublicUrl, cacheBustUrl } from "../backend/imageUrls";

type Props = {
  imageUrl?: string | null;
  name?: string | null;
  size?: number;
};

function getInitials(name?: string | null, fallbackId?: string) {
  const s = (name ?? "").trim();
  if (s.length) {
    const parts = s.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return s.slice(0, 2).toUpperCase();
  }
  if (fallbackId) return fallbackId.slice(0, 2).toUpperCase();
  return "?";
}

export default function Avatar({ imageUrl, name, size = 44 }: Props) {
  const initials = getInitials(name, undefined);
  const uri = toAvatarPublicUrl(imageUrl);
  const uriBusted = uri ? cacheBustUrl(uri) : "";
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (uriBusted && !failed) {
    return (
      <Image
        source={{ uri: uriBusted }}
        style={[styles.img, { width: size, height: size, borderRadius: size / 2 }]}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        styles.initials,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text style={[styles.initialsText, { fontSize: size * 0.4 }]} numberOfLines={1}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  img: { backgroundColor: "rgba(255,255,255,0.08)" },
  initials: {
    backgroundColor: "rgba(99,102,241,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: {
    color: "#fff",
    fontWeight: "900",
  },
});
