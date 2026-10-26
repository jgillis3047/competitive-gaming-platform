// app/onboarding.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInRight, FadeOutLeft } from "react-native-reanimated";
import { colors } from "../lib/theme/colors";
import { lightTap, success } from "../lib/utils/haptics";

const SLIDES = [
  {
    icon: "game-controller",
    title: "Challenge Friends",
    description: "Compete in your favorite games against friends or find new opponents.",
    color: "#6366f1",
  },
  {
    icon: "trophy",
    title: "Win Rewards",
    description: "Earn VC for winning challenges. Climb the leaderboards and unlock badges.",
    color: colors.amberBright,
  },
  {
    icon: "people",
    title: "Build Your Crew",
    description: "Add friends, join crews, and become part of the community.",
    color: "#10b981",
  },
  {
    icon: "rocket",
    title: "Let's Go!",
    description: "You're all set. Start your first challenge and show them what you've got!",
    color: "#ec4899",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleNext = () => {
    lightTap();
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      success();
      router.replace("/(tabs)/feed" as any);
    }
  };

  const handleSkip = () => {
    lightTap();
    router.replace("/(tabs)/feed" as any);
  };

  const slide = SLIDES[currentSlide];

  return (
    <View style={styles.container}>
      <Pressable onPress={handleSkip} style={styles.skipBtn}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>

      <Animated.View 
        key={currentSlide} 
        entering={FadeInRight.duration(300)} 
        exiting={FadeOutLeft.duration(300)}
        style={styles.slideContent}
      >
        <View style={[styles.iconCircle, { backgroundColor: `${slide.color}20` }]}>
          <Ionicons name={slide.icon as any} size={80} color={slide.color} />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.description}>{slide.description}</Text>
      </Animated.View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === currentSlide && styles.dotActive]} />
          ))}
        </View>

        <Pressable onPress={handleNext} style={[styles.nextBtn, { backgroundColor: slide.color }]}>
          <Text style={styles.nextBtnText}>
            {currentSlide === SLIDES.length - 1 ? "Get Started" : "Next"}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060a14", paddingTop: 60 },
  skipBtn: { position: "absolute", top: 50, right: 20, zIndex: 10, padding: 10 },
  skipText: { color: "#9aa1c6", fontSize: 16, fontWeight: "700" },
  slideContent: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  iconCircle: { width: 160, height: 160, borderRadius: 80, alignItems: "center", justifyContent: "center", marginBottom: 40 },
  title: { color: "#fff", fontSize: 32, fontWeight: "900", textAlign: "center", marginBottom: 16 },
  description: { color: "#9aa1c6", fontSize: 16, textAlign: "center", lineHeight: 24 },
  footer: { paddingHorizontal: 20, paddingBottom: 40, gap: 24 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#1f2747" },
  dotActive: { width: 24, backgroundColor: "#6366f1" },
  nextBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 18, borderRadius: 16 },
  nextBtnText: { color: "#fff", fontSize: 18, fontWeight: "900" },
});
