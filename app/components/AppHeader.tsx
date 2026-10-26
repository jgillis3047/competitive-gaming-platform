// app/components/AppHeader.tsx - LinkedIn-style: search, notifications, profile avatar opens side panel
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getSellerApplicationByUserId } from "../../lib/backend/sellers";
import type { SellerRow } from "../../lib/backend/sellers";
import WalletPill from "../../components/walletPill";
import Avatar from "../../lib/ui/Avatar";
import { useAuthStore } from "../../lib/data/authStore";
import { SEARCH_PLACEHOLDER } from "../../lib/theme/arenaCopy";
import { colors } from "../../lib/theme/colors";
import { pressSoft, pressSoftIcon, pressSubtle } from "../../lib/ui/pressableStyles";

const PANEL_WIDTH = Math.min(320, Dimensions.get("window").width * 0.82);

function closeDrawer(
  setDrawerOpen: (v: boolean) => void,
  slideAnim: Animated.Value,
  overlayAnim: Animated.Value
) {
  Animated.parallel([
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }),
    Animated.timing(overlayAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }),
  ]).start(() => setDrawerOpen(false));
}

function openDrawer(
  setDrawerOpen: (v: boolean) => void,
  slideAnim: Animated.Value,
  overlayAnim: Animated.Value
) {
  setDrawerOpen(true);
  slideAnim.setValue(-PANEL_WIDTH);
  overlayAnim.setValue(0);
  Animated.parallel([
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }),
    Animated.timing(overlayAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }),
  ]).start();
}

export type AppHeaderFeedSearch = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
};

export type AppHeaderProps = {
  /** When set, the bar filters the feed in place; a small icon still opens full directory search. */
  feedSearch?: AppHeaderFeedSearch | null;
};

export default function AppHeader(props: AppHeaderProps = {}) {
  const { feedSearch } = props;
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sellerApplication, setSellerApplication] = useState<SellerRow | null>(null);
  const slideAnim = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  const displayName = profile?.display_name || profile?.username || user?.email || "You";

  useEffect(() => {
    if (!drawerOpen || !user?.id) return;
    getSellerApplicationByUserId(user.id).then((app) => setSellerApplication(app ?? null));
  }, [drawerOpen, user?.id]);

  const openPanel = () => openDrawer(setDrawerOpen, slideAnim, overlayAnim);
  const closePanel = () => closeDrawer(setDrawerOpen, slideAnim, overlayAnim);

  const navigate = (path: string) => {
    closePanel();
    setTimeout(() => router.push(path as any), 220);
  };

  const handleLogout = async () => {
    closePanel();
    setTimeout(() => {
      // Ensure we fully clear the Supabase session before redirecting.
      // Otherwise the persisted session can still restore and look like a "dummy account".
      (async () => {
        try {
          await logout();
        } catch (e) {
          console.warn("[AppHeader] logout failed:", e);
        } finally {
          router.replace("/auth/login");
        }
      })();
    }, 220);
  };

  return (
    <>
      <View style={styles.header}>
        {feedSearch ? (
          <>
            <Pressable
              onPress={() => router.push("/search")}
              style={({ pressed }) => [styles.searchTouch, pressSubtle(pressed)]}
            >
              <Ionicons name="search" size={20} color="rgba(255,255,255,0.5)" style={styles.searchIcon} />
              <TextInput
                value={feedSearch.value}
                onChangeText={feedSearch.onChangeText}
                placeholder={feedSearch.placeholder ?? "Search…"}
                placeholderTextColor={colors.textTertiary}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => router.push("/search")}
            style={({ pressed }) => [styles.searchTouch, pressSubtle(pressed)]}
          >
            <Ionicons name="search" size={20} color="rgba(255,255,255,0.5)" style={styles.searchIcon} />
            <Text style={styles.searchPlaceholder} numberOfLines={1}>{SEARCH_PLACEHOLDER}</Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => router.push("/notifications")}
          style={({ pressed }) => [styles.iconBtn, pressSoftIcon(pressed)]}
        >
          <Ionicons name="notifications-outline" size={24} color={colors.text} />
        </Pressable>

        <WalletPill variant="compact" />

        <Pressable
          onPress={openPanel}
          style={({ pressed }) => [styles.avatarBtn, pressSoftIcon(pressed)]}
        >
          <Avatar
            imageUrl={profile?.avatar_url}
            name={displayName}
            size={36}
          />
        </Pressable>
      </View>

      <Modal visible={drawerOpen} transparent animationType="none">
        <View style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              styles.overlay,
              { opacity: overlayAnim },
            ]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={closePanel} />
          </Animated.View>
          <Animated.View
            style={[
              styles.panel,
              { width: PANEL_WIDTH, transform: [{ translateX: slideAnim }] },
            ]}
          >
            <View style={styles.panelInner}>
              {/* Profile block at top */}
              <Pressable
                onPress={() => navigate("/profile")}
                style={({ pressed }) => [styles.profileBlock, pressSoft(pressed)]}
              >
                <Avatar
                  imageUrl={profile?.avatar_url}
                  name={displayName}
                  size={56}
                />
                <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
                <Text style={styles.viewProfile}>View profile</Text>
              </Pressable>

              <View style={styles.divider} />

              <Text style={styles.sectionLabel}>Play</Text>
              <ScrollView style={styles.actionsScroll} showsVerticalScrollIndicator={false}>
                <Pressable
                  onPress={() => navigate("/(tabs)/leaderboards")}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                >
                  <Ionicons name="map-outline" size={22} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.drawerItemText}>Explore arenas</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigate("/(tabs)/feed")}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                >
                  <Ionicons name="flash-outline" size={22} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.drawerItemText}>Arena (live activity)</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigate("/(tabs)/create")}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                >
                  <Ionicons name="add-circle-outline" size={22} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.drawerItemText}>Create</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigate("/practice/history")}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                >
                  <Ionicons name="time-outline" size={22} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.drawerItemText}>Practice history</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigate("/(tabs)/matches")}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                >
                  <Ionicons name="trophy-outline" size={22} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.drawerItemText}>My matches</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigate("/courts")}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                >
                  <Ionicons name="ribbon-outline" size={22} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.drawerItemText}>Spots & kings</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigate("/teams")}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                >
                  <Ionicons name="people-outline" size={22} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.drawerItemText}>Crews & leagues</Text>
                </Pressable>

                <View style={styles.divider} />
                <Text style={styles.sectionLabel}>Account</Text>
                <Pressable
                  onPress={() => navigate("/wallet")}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                >
                  <Ionicons name="wallet-outline" size={22} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.drawerItemText}>Wallet</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigate("/(tabs)/shop")}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                >
                  <Ionicons name="cart-outline" size={22} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.drawerItemText}>Shop</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigate("/orders")}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                >
                  <Ionicons name="receipt-outline" size={22} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.drawerItemText}>Orders</Text>
                </Pressable>
                {sellerApplication?.status === "approved" ? (
                  <Pressable
                    onPress={() => navigate("/seller")}
                    style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                  >
                    <Ionicons name="storefront-outline" size={22} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.drawerItemText}>Seller dashboard</Text>
                  </Pressable>
                ) : sellerApplication?.status === "pending" ? (
                  <Pressable
                    onPress={() => navigate("/apply-seller")}
                    style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                  >
                    <Ionicons name="time-outline" size={22} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.drawerItemText}>Seller application pending</Text>
                  </Pressable>
                ) : null}

                <View style={styles.divider} />
                <Text style={styles.sectionLabel}>More</Text>
                <Pressable
                  onPress={() => navigate("/settings")}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                >
                  <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.drawerItemText}>Settings</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigate("/daily-rewards")}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                >
                  <Ionicons name="gift-outline" size={22} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.drawerItemText}>Daily reward</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigate("/referrals")}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                >
                  <Ionicons name="person-add-outline" size={22} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.drawerItemText}>Invite friends</Text>
                </Pressable>
                {profile?.is_admin ? (
                  <Pressable
                    onPress={() => navigate("/admin")}
                    style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                  >
                    <Ionicons name="shield-checkmark-outline" size={22} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.drawerItemText}>Approve sellers</Text>
                  </Pressable>
                ) : null}
              </ScrollView>

              <View style={styles.divider} />

              <Pressable
                onPress={handleLogout}
                style={({ pressed }) => [styles.drawerItem, styles.drawerItemDanger, pressed && styles.drawerItemPressed]}
              >
                <Ionicons name="log-out-outline" size={22} color={colors.danger} />
                <Text style={styles.drawerItemTextDanger}>Log out</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 10,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchTouch: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 12,
    marginRight: 10,
  },
  searchIcon: { marginRight: 8 },
  searchPlaceholder: { flex: 1, color: colors.textSecondary, fontSize: 14 },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 0,
    minHeight: 36,
  },
  iconBtn: {
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
  avatarBtn: {},
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  panel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.bgDeep,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.borderStrong,
  },
  panelInner: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  profileBlock: {
    alignItems: "center",
    paddingVertical: 16,
  },
  profileName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 10,
  },
  viewProfile: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
    marginVertical: 12,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  actionsScroll: {
    maxHeight: 320,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    gap: 14,
  },
  drawerItemPressed: { opacity: 0.7 },
  drawerItemText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  drawerItemDanger: {},
  drawerItemTextDanger: { color: colors.danger, fontSize: 16, fontWeight: "600" },
});
