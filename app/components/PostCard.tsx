// app/components/PostCard.tsx - Advanced social media style
import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Avatar from "../../lib/ui/Avatar";
import type { PostMediaRow, PostWithExtras } from "../../lib/backend/posts";
import { toMediaPublicUrl } from "../../lib/backend/imageUrls";
import { useMediaUrl } from "../../lib/ui/useStorageImageUrl";
import { togglePostLike } from "../../lib/backend/posts";
import { notifyUser } from "../../lib/backend/notifications";
import { NOTIFICATION_TYPES } from "../../lib/backend/notificationTypes";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";
import { pressSoftIcon } from "../../lib/ui/pressableStyles";

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

type Props = {
  post: PostWithExtras;
  onLikeSuccess?: () => void;
  onCommentSuccess?: () => void;
};

export default function PostCard({ post, onLikeSuccess, onCommentSuccess }: Props) {
  const router = useRouter();
  const myId = useAuthStore((s) => s.user?.id ?? null);

  const [liked, setLiked] = useState(!!post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount ?? 0);
  const [likeBusy, setLikeBusy] = useState(false);

  const name =
    post.author?.display_name ||
    post.author?.username ||
    "Unknown";

  const authorId = post.user_id ?? (post.author as any)?.id ?? null;
  const avatarUrl = (post.author as any)?.avatar_url ?? null;

  const media = (post.media ?? []) as PostMediaRow[];

  const payload = (post.payload ?? {}) as Record<string, unknown>;
  const automation = typeof payload.automation === "string" ? payload.automation : null;
  const courtId = typeof payload.court_id === "string" ? payload.court_id : null;
  const recordSlug = typeof payload.record_slug === "string" ? payload.record_slug : null;
  const podiumRank = typeof payload.rank === "number" ? payload.rank : null;

  const handleLike = async () => {
    if (!myId || likeBusy) return;
    setLikeBusy(true);
    try {
      const { liked: next } = await togglePostLike({ postId: post.id, userId: myId });
      setLiked(next);
      setLikeCount((c) => (next ? c + 1 : Math.max(0, c - 1)));
      if (next && authorId && authorId !== myId) {
        notifyUser({
          targetUserId: authorId,
          type: NOTIFICATION_TYPES.POST_LIKE,
          title: "New like",
          body: `${name} liked your post`,
          link: `/post/${post.id}`,
        }).catch(() => {});
      }
      onLikeSuccess?.();
    } catch (e: any) {
      Alert.alert("Couldn't update like", e?.message ?? "Please try again.");
    } finally {
      setLikeBusy(false);
    }
  };

  const handleComment = () => {
    router.push({ pathname: "/post/[id]", params: { id: post.id } } as any);
    onCommentSuccess?.();
  };

  const handleShare = async () => {
    try {
      const body = (post.body ?? "").trim();
      const author = post.author?.display_name ?? post.author?.username ?? "Someone";
      const msg = body
        ? `${author}: ${body.length > 100 ? body.slice(0, 97) + "…" : body}`
        : `${author} shared a post`;
      await Share.share({ message: msg });
    } catch (e: any) {
      Alert.alert("Couldn't share", e?.message ?? "Sharing is not available.");
    }
  };

  return (
    <View style={styles.card}>
      {/* Header with avatar - tap to open profile */}
      <View style={styles.header}>
        <View style={styles.authorRow}>
          <Pressable
            onPress={() => authorId && router.push(`/user/${authorId}` as any)}
            style={({ pressed }) => [styles.authorPressable, pressSoftIcon(pressed)]}
            disabled={!authorId}
          >
            <Avatar
              imageUrl={avatarUrl}
              name={name}
              size={42}
            />
            <View style={styles.authorInfo}>
              <Text style={styles.author} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.timestamp}>
                {timeAgo(post.created_at)}
              </Text>
            </View>
          </Pressable>
          {post.challenge_id ? (
            <Pressable
              onPress={() => router.push(`/challenge/${post.challenge_id}`)}
              style={({ pressed }) => [styles.challengeLink, pressSoftIcon(pressed)]}
            >
              <Text style={styles.challengeLinkText}>View challenge</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accent} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Text */}
      {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}

      {automation === "court_podium" && courtId ? (
        <Pressable
          onPress={() => {
            const q = recordSlug ? `?record=${encodeURIComponent(recordSlug)}` : "";
            router.push(`/courts/${courtId}${q}` as any);
          }}
          style={({ pressed }) => [styles.autoCta, pressSoftIcon(pressed)]}
        >
          <Ionicons name="location" size={18} color={colors.gold} />
          <Text style={styles.autoCtaText}>
            {podiumRank != null ? `View #${podiumRank} spot` : "Open court"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {automation === "badge_unlock" ? (
        <Pressable
          onPress={() => authorId && router.push(`/user/${authorId}` as any)}
          style={({ pressed }) => [styles.autoCta, styles.autoCtaBadge, pressSoftIcon(pressed)]}
        >
          <Ionicons name="ribbon" size={18} color={colors.accentMuted} />
          <Text style={styles.autoCtaText}>View profile badges</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {/* Media */}
      {media.length > 0 ? (
        <View style={styles.mediaStack}>
          {media.map((item) => (
            <View key={item.id} style={styles.mediaItemWrap}>
              <MediaItem item={item} />
            </View>
          ))}
        </View>
      ) : null}

      {/* Footer - social actions */}
      <View style={styles.footer}>
        <View style={styles.actions}>
          <Pressable
            onPress={handleLike}
            disabled={!myId || likeBusy}
            style={({ pressed }) => [
              styles.actionBtn,
              liked && styles.actionBtnLiked,
              (pressed || likeBusy) && { opacity: 0.7 },
            ]}
          >
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={20}
              color={liked ? colors.danger : colors.textSecondary}
            />
            <Text style={[styles.actionText, liked && styles.actionTextLiked]}>
              Like{likeCount > 0 ? ` ${likeCount}` : ""}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleComment}
            style={({ pressed }) => [styles.actionBtn, pressSoftIcon(pressed)]}
          >
            <Ionicons name="chatbubble-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.actionText}>Comment</Text>
          </Pressable>
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [styles.actionBtn, pressSoftIcon(pressed)]}
          >
            <Ionicons name="repeat-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.actionText}>Repost</Text>
          </Pressable>
        </View>
        <Text style={styles.meta}>
          {String(post.visibility ?? "private").toLowerCase() === "public" ? "Public" : "Private"}
        </Text>
      </View>
    </View>
  );
}

function MediaItem({ item }: { item: PostMediaRow }) {
  const path = item.storage_path ?? "";
  const signedUri = useMediaUrl(path);
  const publicUri = toMediaPublicUrl(path);
  const uri = signedUri || publicUri;
  const kind = String(item.media_type ?? "").toLowerCase();
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    if (__DEV__ && uri) console.log("[PostCard] media url", path, "->", uri.slice(0, 100) + "...");
  }, [path, uri]);

  React.useEffect(() => {
    setLoadError(false);
  }, [uri]);

  const errorPlaceholder = (
    <Pressable
      style={[styles.image, styles.imageError]}
      onPress={() => uri && Linking.openURL(uri).catch(() => {})}
    >
      <Ionicons name="image-outline" size={40} color={colors.textMuted} />
      <Text style={styles.imageErrorText}>Image unavailable</Text>
    </Pressable>
  );

  if (kind === "image") {
    if (!path) {
      return (
        <View style={[styles.image, styles.imageError]}>
          <Ionicons name="image-outline" size={40} color={colors.textMuted} />
        </View>
      );
    }
    if (!uri) {
      return (
        <View style={[styles.image, styles.imageError]}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      );
    }
    if (loadError) {
      return errorPlaceholder;
    }
    return (
      <RNImage
        key={uri}
        source={{ uri }}
        style={styles.image}
        resizeMode="cover"
        onError={(e) => {
          const ev = e?.nativeEvent as { error?: string; httpResponseHeaders?: Record<string, string> } | undefined;
          const contentLength = ev?.httpResponseHeaders?.["Content-Length"];
          if (__DEV__) {
            console.warn("[PostCard] Image failed.", contentLength !== undefined ? `Content-Length: ${contentLength}` : ev?.error);
          }
          setLoadError(true);
        }}
      />
    );
  }

  if (!uri) {
    return (
      <View style={[styles.videoPlaceholder, styles.videoContainer]}>
        <Ionicons name="videocam-outline" size={40} color={colors.textMuted} />
        <Text style={styles.videoText}>Video</Text>
      </View>
    );
  }
  return (
    <Video
      source={{ uri }}
      style={styles.video}
      useNativeControls
      resizeMode={ResizeMode.CONTAIN}
      shouldPlay={false}
      isLooping={false}
      onError={() => setLoadError(true)}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },

  header: { marginBottom: 12 },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  authorPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  authorInfo: { flex: 1, marginLeft: 12 },
  author: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  challengeLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  challengeLinkText: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 12,
  },

  body: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  caption: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },

  autoCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.goldSurface,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  autoCtaBadge: {
    backgroundColor: "rgba(79,109,245,0.1)",
    borderColor: colors.accentBorder,
  },
  autoCtaText: {
    flex: 1,
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
  },

  mediaStack: { marginTop: 12, gap: 10 },
  mediaItemWrap: { width: "100%" },
  image: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  imageError: {
    alignItems: "center",
    justifyContent: "center",
  },
  imageErrorText: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textMuted,
  },
  videoContainer: { justifyContent: "center", alignItems: "center" },
  video: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: 12,
    backgroundColor: colors.bgDeep,
  },
  videoPlaceholder: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 8,
  },

  footer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  actions: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnLiked: {},
  actionText: {
    color: colors.textSecondary,
    fontWeight: "800",
    fontSize: 13,
  },
  actionTextLiked: { color: colors.danger },
  meta: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: "right",
  },
});
