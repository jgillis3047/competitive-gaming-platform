// app/shop/product/[id].tsx - Product detail & Buy flow
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppHeader from "../../components/AppHeader";
import { getProductById } from "../../../lib/backend/products";
import type { ProductWithSeller } from "../../../lib/backend/products";
import { createOrder, markOrderPaid } from "../../../lib/backend/orders";
import { getPaymentIntentClientSecret } from "../../../lib/backend/stripeCheckout";
import { useAuthStore } from "../../../lib/data/authStore";
import { APP_SCHEME, MERCHANT_DISPLAY_NAME } from "../../../lib/theme/brand";
import { colors } from "../../../lib/theme/colors";
import { usePaymentSheet } from "@stripe/stripe-react-native";

function formatUSDFromCents(cents: number) {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

export default function ProductDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = String(id ?? "");
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  const [product, setProduct] = useState<ProductWithSeller | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const p = await getProductById(productId);
      setProduct(p);
    } catch (e) {
      console.error(e);
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBuy = async () => {
    if (!userId) {
      Alert.alert("Sign in", "You need to sign in to purchase.");
      return;
    }
    if (!product) return;
    const amountCents = product.price_cents;
    setBuying(true);
    try {
      const clientSecret = await getPaymentIntentClientSecret(amountCents, {
        purchaseType: "product_purchase",
        sourceRef: product.id,
      });
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: MERCHANT_DISPLAY_NAME,
        returnURL: `${APP_SCHEME}://shop`,
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

      const order = await createOrder({ userId, productId: product.id, quantity: 1 });
      await markOrderPaid(order.id, userId);
      Alert.alert("Purchased", `You bought "${product.name}" for ${formatUSDFromCents(amountCents)}.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not complete purchase.");
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#60a5fa" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.container}>
        <AppHeader />
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Product not found.</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const seller = product.seller as { business_name: string; slug?: string } | null;

  return (
    <View style={styles.container}>
      <AppHeader />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>No image</Text>
          </View>
        )}
        <View style={styles.body}>
          <Text style={styles.category}>{product.category.replace("_", " ")}</Text>
          <Text style={styles.name}>{product.name}</Text>
          {product.description ? (
            <Text style={styles.description}>{product.description}</Text>
          ) : null}
          {seller ? (
            <Text style={styles.seller}>Sold by {seller.business_name}</Text>
          ) : null}
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatUSDFromCents(product.price_cents)}</Text>
          </View>
          <Pressable
            style={[styles.buyButton, buying && styles.buyButtonDisabled]}
            onPress={handleBuy}
            disabled={buying}
          >
            {buying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buyButtonText}>Buy now</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050819" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  loadingText: { color: "#9ca3af", marginTop: 8 },
  emptyText: { color: "#9ca3af", marginBottom: 16 },
  backButton: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#1e293b", borderRadius: 10 },
  backButtonText: { color: "#fff", fontWeight: "600" },
  image: { width: "100%", height: 260, backgroundColor: "#0b1120" },
  imagePlaceholder: { width: "100%", height: 200, backgroundColor: "#0b1120", justifyContent: "center", alignItems: "center" },
  imagePlaceholderText: { color: "#6b7280" },
  body: { padding: 16 },
  category: { color: "#60a5fa", fontSize: 12, fontWeight: "600", textTransform: "uppercase", marginBottom: 4 },
  name: { color: "#ffffff", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  description: { color: "#9ca3af", fontSize: 15, lineHeight: 22, marginBottom: 8 },
  seller: { color: "#6b7280", fontSize: 13, marginBottom: 12 },
  priceRow: { marginBottom: 20 },
  price: { color: colors.gold, fontSize: 26, fontWeight: "800" },
  buyButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  buyButtonDisabled: { opacity: 0.7 },
  buyButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
