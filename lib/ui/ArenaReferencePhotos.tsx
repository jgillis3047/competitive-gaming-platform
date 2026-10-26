import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { primaryReferenceAttribution, resolveArenaPhotoUrls } from "../backend/arenaPhotos";
import { ARENA_NO_REFERENCE_PHOTO } from "../theme/arenaCopy";
import { colors } from "../theme/colors";
import { radius, space } from "../theme/spacing";
import { pressSoft } from "./pressableStyles";

type Props = {
  photoPaths?: string[] | null;
  arenaName: string;
  /** When multiple photos, show "1 / 3" style counter */
  showCounter?: boolean;
};

export default function ArenaReferencePhotos({ photoPaths, arenaName, showCounter = true }: Props) {
  const { width } = useWindowDimensions();
  const frameWidth = width - space.lg * 2;
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const pathsKey = (photoPaths ?? []).join("|");
  const attribution = primaryReferenceAttribution(photoPaths);

  useEffect(() => {
    let cancelled = false;
    const paths = photoPaths ?? [];
    if (!paths.length) {
      setUrls([]);
      setSlideIndex(0);
      return;
    }
    setLoading(true);
    resolveArenaPhotoUrls(paths)
      .then((resolved) => {
        if (!cancelled) {
          setUrls(resolved);
          setSlideIndex(0);
        }
      })
      .catch(() => {
        if (!cancelled) setUrls([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathsKey, photoPaths]);

  if (!photoPaths?.length) {
    return (
      <View style={[styles.placeholder, { width: frameWidth }]}>
        <Ionicons name="image-outline" size={32} color={colors.textMuted} />
        <Text style={styles.placeholderText}>{ARENA_NO_REFERENCE_PHOTO}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.loading, { width: frameWidth }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!urls.length) {
    return (
      <View style={[styles.placeholder, { width: frameWidth }]}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
        <Text style={styles.placeholderText}>Photos could not be loaded.</Text>
      </View>
    );
  }

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  return (
    <>
      <View>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / frameWidth);
            setSlideIndex(i);
          }}
        >
          {urls.map((uri, index) => (
            <Pressable
              key={`${uri}-${index}`}
              onPress={() => openViewer(index)}
              style={({ pressed }) => [pressSoft(pressed)]}
              accessibilityLabel={`Reference photo ${index + 1} of ${urls.length} for ${arenaName}`}
            >
              <Image
                source={{ uri }}
                style={[styles.photo, { width: frameWidth }]}
                contentFit="cover"
                transition={200}
                accessibilityLabel={`${arenaName} reference`}
              />
              <View style={styles.expandHint}>
                <Ionicons name="expand-outline" size={16} color="#fff" />
              </View>
            </Pressable>
          ))}
        </ScrollView>
        {showCounter && urls.length > 1 ? (
          <Text style={styles.counter}>
            {slideIndex + 1} / {urls.length}
          </Text>
        ) : null}
        {attribution ? <Text style={styles.attribution}>Photo: {attribution}</Text> : null}
      </View>

      <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewerRoot}>
          <Pressable style={styles.viewerBackdrop} onPress={() => setViewerOpen(false)} />
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerTitle} numberOfLines={1}>
              {arenaName}
            </Text>
            <Pressable onPress={() => setViewerOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: viewerIndex * width, y: 0 }}
            onMomentumScrollEnd={(e) => {
              setViewerIndex(Math.round(e.nativeEvent.contentOffset.x / width));
            }}
          >
            {urls.map((uri, index) => (
              <Image
                key={`viewer-${uri}-${index}`}
                source={{ uri }}
                style={{ width, height: "100%" }}
                contentFit="contain"
              />
            ))}
          </ScrollView>
          {urls.length > 1 ? (
            <Text style={styles.viewerCounter}>
              {viewerIndex + 1} / {urls.length}
            </Text>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const PHOTO_HEIGHT = 200;

const styles = StyleSheet.create({
  photo: {
    height: PHOTO_HEIGHT,
    backgroundColor: colors.bgFeed,
  },
  placeholder: {
    height: PHOTO_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: space.lg,
    backgroundColor: colors.bgFeed,
  },
  placeholderText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  loading: {
    height: PHOTO_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgFeed,
  },
  counter: {
    position: "absolute",
    bottom: 10,
    right: 12,
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  attribution: {
    color: colors.textMuted,
    fontSize: 11,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 2,
  },
  expandHint: {
    position: "absolute",
    top: 10,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: radius.sm,
    padding: 6,
  },
  viewerRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
  },
  viewerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  viewerHeader: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    gap: 12,
  },
  viewerTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
  },
  viewerCounter: {
    position: "absolute",
    bottom: 48,
    alignSelf: "center",
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
});
