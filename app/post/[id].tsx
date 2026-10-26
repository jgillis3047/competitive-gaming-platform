// app/post/[id].tsx - Post detail with comments
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import PostCard from "../components/PostCard";
import Avatar from "../../lib/ui/Avatar";
import { cacheBustUrl, toMediaPublicUrl } from "../../lib/backend/imageUrls";
import { useAuthStore } from "../../lib/data/authStore";
import {
  createCommentPost,
  fetchCommentsForPost,
  fetchPostById,
  getLikesForPosts,
  type PendingMedia,
  type PostWithExtras,
} from "../../lib/backend/posts";
import { notifyUser } from "../../lib/backend/notifications";
import { NOTIFICATION_TYPES } from "../../lib/backend/notificationTypes";
import { pressSoftIcon } from "../../lib/ui/pressableStyles";

function CommentMediaImage({ storagePath }: { storagePath: string }) {
  const uri = cacheBustUrl(toMediaPublicUrl(storagePath));
  if (!uri) return null;
  return <Image source={{ uri }} style={styles.commentMediaImg} resizeMode="cover" />;
}

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

export default function PostDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id ?? "");
  const myId = useAuthStore((s) => s.user?.id ?? null);

  const [post, setPost] = useState<PostWithExtras | null>(null);
  const [comments, setComments] = useState<PostWithExtras[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!postId) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const [p, cs] = await Promise.all([
        fetchPostById(postId),
        fetchCommentsForPost(postId),
      ]);
      if (p) {
        const { counts, liked } = await getLikesForPosts([p.id], myId ?? undefined);
        setPost({ ...p, likeCount: counts[p.id] ?? 0, likedByMe: liked.has(p.id) });
      } else {
        setPost(null);
      }
      setComments(cs ?? []);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not load post.");
    } finally {
      setLoading(false);
    }
  }, [postId, myId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddMedia = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow access to your photos to add images or videos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        quality: 0.8,
        videoMaxDuration: 30,
      });
      if (result.canceled || !result.assets?.length) return;
      const added: PendingMedia[] = result.assets.map((a) => ({
        uri: a.uri,
        mediaType: a.type === "video" ? "video" : "image",
        width: a.width ?? undefined,
        height: a.height ?? undefined,
        durationMs: a.duration ?? undefined,
      }));
      setPendingMedia((prev) => [...prev, ...added].slice(0, 3));
    } catch (e: any) {
      Alert.alert("Couldn't open library", e?.message ?? "Please try again.");
    }
  }, []);

  const handleRemoveMedia = useCallback((index: number) => {
    setPendingMedia((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handlePostComment = async () => {
    const trimmed = commentBody.trim();
    const hasMedia = pendingMedia.length > 0;
    if ((!trimmed && !hasMedia) || !myId || !postId) return;
    try {
      setPosting(true);
      await createCommentPost({
        user_id: myId,
        parent_post_id: postId,
        body: trimmed || " ",
        media: hasMedia ? pendingMedia : undefined,
      });
      const authorId = post?.user_id ? String(post.user_id) : null;
      if (authorId && authorId !== myId) {
        notifyUser({
          targetUserId: authorId,
          type: NOTIFICATION_TYPES.POST_COMMENT,
          title: "New comment",
          body: "Someone commented on your post.",
          link: `/post/${postId}`,
        }).catch(() => {});
      }
      setCommentBody("");
      setPendingMedia([]);
      await load();
    } catch (e: any) {
      Alert.alert("Could not post comment", e?.message ?? "Please try again.");
    } finally {
      setPosting(false);
    }
  };

  const canComment = (commentBody.trim().length > 0 || pendingMedia.length > 0) && !!myId;

  if (loading && !post) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>{errorMsg ?? "Post not found"}</Text>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
          {errorMsg ? (
            <Pressable onPress={() => load()} style={styles.backBtn}>
              <Text style={styles.backBtnText}>Retry</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Post</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <PostCard
          post={post}
          onLikeSuccess={load}
          onCommentSuccess={load}
        />
        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>Comments ({comments.length})</Text>
          {comments.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => c.user_id && router.push(`/user/${c.user_id}` as any)}
              style={({ pressed }) => [styles.commentRow, pressSoftIcon(pressed)]}
            >
              <Avatar
                imageUrl={(c.author as any)?.avatar_url ?? null}
                name={(c.author as any)?.display_name ?? (c.author as any)?.username ?? "?"}
                size={36}
              />
              <View style={styles.commentBody}>
                <Text style={styles.commentAuthor}>
                  {(c.author as any)?.display_name ?? (c.author as any)?.username ?? "Unknown"}
                </Text>
                {c.body?.trim() ? <Text style={styles.commentText}>{c.body}</Text> : null}
                {(c.media as any[])?.length ? (
                  <View style={styles.commentMediaRow}>
                    {(c.media as any[]).map((m: any) =>
                      m.media_type === "image" ? (
                        <CommentMediaImage key={m.id} storagePath={m.storage_path} />
                      ) : (
                        <View key={m.id} style={styles.commentMediaPlaceholder}>
                          <Ionicons name="videocam" size={20} color="#9aa1c6" />
                        </View>
                      )
                    )}
                  </View>
                ) : null}
                <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {myId ? (
          <View style={styles.composer}>
            <TextInput
              value={commentBody}
              onChangeText={setCommentBody}
              placeholder="Add a comment…"
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={styles.input}
              multiline
            />
            {pendingMedia.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.commentMediaPreview}>
                {pendingMedia.map((m, i) => (
                  <View key={i} style={styles.commentMediaPreviewWrap}>
                    {m.mediaType === "image" ? (
                      <Image source={{ uri: m.uri }} style={styles.commentMediaPreviewImg} resizeMode="cover" />
                    ) : (
                      <View style={[styles.commentMediaPreviewImg, styles.commentMediaPreviewVideo]}>
                        <Ionicons name="videocam" size={20} color="#9aa1c6" />
                      </View>
                    )}
                    <Pressable onPress={() => handleRemoveMedia(i)} style={styles.commentMediaPreviewRemove} hitSlop={6}>
                      <Ionicons name="close-circle" size={18} color="#ef4444" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.composerRow}>
              <Pressable onPress={handleAddMedia} style={({ pressed }) => [styles.mediaBtn, pressSoftIcon(pressed)]}>
                <Ionicons name="images" size={18} color="#9aa1c6" />
                <Text style={styles.mediaBtnText}>Add media</Text>
              </Pressable>
              <Pressable
                onPress={handlePostComment}
                disabled={posting || !canComment}
                style={({ pressed }) => [
                  styles.postBtn,
                  (posting || !canComment) && styles.postBtnDisabled,
                  pressed && !posting && { opacity: 0.9 },
                ]}
              >
                <Text style={styles.postBtnText}>{posting ? "Posting…" : "Post"}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={styles.loginHint}>Log in to comment</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060a14" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#060a14" },
  loadingText: { color: "rgba(255,255,255,0.7)", marginTop: 12 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginRight: 16 },
  backBtnText: { color: "#fff", fontWeight: "800" },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 120 },
  commentsSection: { padding: 16 },
  commentsTitle: { color: "#fff", fontWeight: "900", marginBottom: 12 },
  commentRow: { flexDirection: "row", marginBottom: 16, gap: 12 },
  commentBody: { flex: 1 },
  commentAuthor: { color: "#fff", fontWeight: "800", fontSize: 14 },
  commentText: { color: "rgba(255,255,255,0.9)", marginTop: 4, fontSize: 14 },
  commentTime: { color: "rgba(255,255,255,0.45)", marginTop: 4, fontSize: 12 },
  composer: { padding: 16 },
  input: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 14, color: "#fff", fontSize: 15, minHeight: 80, textAlignVertical: "top", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  commentMediaPreview: { marginTop: 8, maxHeight: 56 },
  commentMediaPreviewWrap: { position: "relative", marginRight: 8 },
  commentMediaPreviewImg: { width: 48, height: 48, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)" },
  commentMediaPreviewVideo: { alignItems: "center", justifyContent: "center" },
  commentMediaPreviewRemove: { position: "absolute", top: -4, right: -4 },
  composerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  mediaBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 12 },
  mediaBtnText: { color: "#9aa1c6", fontSize: 13, fontWeight: "600" },
  commentMediaRow: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  commentMediaImg: { width: 64, height: 64, borderRadius: 8 },
  commentMediaPlaceholder: { width: 64, height: 64, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  postBtn: { flex: 1, backgroundColor: "#6366f1", borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  postBtnDisabled: { opacity: 0.5 },
  postBtnText: { color: "#fff", fontWeight: "900" },
  loginHint: { color: "rgba(255,255,255,0.5)", padding: 16, textAlign: "center" },
});
