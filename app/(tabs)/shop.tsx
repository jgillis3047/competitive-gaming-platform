// app/(tabs)/shop.tsx
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { usePaymentSheet } from "@stripe/stripe-react-native";

import AppHeader from "../components/AppHeader";

import { Skeleton } from "../../lib/ui/Skeleton";

import type { ProductWithSeller } from "../../lib/backend/products";
import { listProducts } from "../../lib/backend/products";
import { getPaymentIntentClientSecret, MONEY_PACK_OPTIONS } from "../../lib/backend/stripeCheckout";
import { useWalletStore } from "../../lib/data/walletStore";
import { APP_SCHEME, MERCHANT_DISPLAY_NAME } from "../../lib/theme/brand";
import { colors } from "../../lib/theme/colors";
import { radius, space } from "../../lib/theme/spacing";
import { pressSoft } from "../../lib/ui/pressableStyles";

function formatUSDFromCents(cents: number) {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

const SEEDED_GIFT_CARDS = [
  { id: "seed-gc-amz", name: "Amazon Gift Card", price: "$10.00", seller: "Featured", cta: "Coming soon" },
  { id: "seed-gc-apple", name: "Apple Gift Card", price: "$25.00", seller: "Featured", cta: "Coming soon" },
];

const SEEDED_MARKETPLACE = [
  { id: "seed-mp-grip", name: "Pro Grip Tape", price: "$7.99", seller: "Starter Store", cta: "Coming soon" },
  { id: "seed-mp-band", name: "Training Resistance Band", price: "$14.99", seller: "Starter Store", cta: "Coming soon" },
];

export default function ShopScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const balanceCents = useWalletStore((s) => s.balance);
  const refreshWallet = useWalletStore((s) => s.refresh);
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  const [giftCardProducts, setGiftCardProducts] = useState<ProductWithSeller[]>([]);
  const [marketplaceProducts, setMarketplaceProducts] = useState<ProductWithSeller[]>([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
  const [stripeLoading, setStripeLoading] = useState<string | null>(null);

  const loadMarketplace = useCallback(async () => {
    setShopLoading(true);
    setShopError(null);
    try {
      const [giftCards, allProducts] = await Promise.all([
        listProducts({ category: "gift_card", limit: 20 }),
        listProducts({ limit: 24 }),
      ]);
      setGiftCardProducts(giftCards);
      setMarketplaceProducts(allProducts.filter((p) => p.category !== "gift_card"));
    } catch (e: any) {
      setShopError(e?.message ?? "Could not load shop.");
    } finally {
      setShopLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMarketplace();
  }, [loadMarketplace]);

  useFocusEffect(
    useCallback(() => {
      refreshWallet();
    }, [refreshWallet])
  );

  const handleAddFunds = async (amountCents: number) => {
    setStripeLoading(`${amountCents}`);
    try {
      const clientSecret = await getPaymentIntentClientSecret(amountCents, {
        purchaseType: "wallet_topup",
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
      await refreshWallet();
      await new Promise((r) => setTimeout(r, 1500));
      await refreshWallet();
      Alert.alert("Success", `${formatUSDFromCents(amountCents)} added to your wallet.`);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not start payment.");
    } finally {
      setStripeLoading(null);
    }
  };

  const openProduct = (productId: string) => router.push({ pathname: "/shop/product/[id]", params: { id: productId } });

  const renderGiftCard = ({ item }: { item: ProductWithSeller }) => (
    <Pressable
      style={[styles.productCard, { width: Math.min(200, Math.max(132, screenWidth * 0.42)) }]}
      onPress={() => openProduct(item.id)}
    >
      <Text style={styles.productName}>{item.name}</Text>
      {(item as any).seller?.business_name ? (
        <Text style={styles.productSeller}>{(item as any).seller.business_name}</Text>
      ) : null}
      <Text style={styles.productPrice}>{formatUSDFromCents(item.price_cents)}</Text>
      <Text style={styles.productCta}>View →</Text>
    </Pressable>
  );

  const renderMarketplaceProduct = ({ item }: { item: ProductWithSeller }) => (
    <Pressable style={styles.marketplaceCard} onPress={() => openProduct(item.id)}>
      <Text style={styles.productName}>{item.name}</Text>
      {(item as any).seller?.business_name ? (
        <Text style={styles.productSeller}>{(item as any).seller.business_name}</Text>
      ) : null}
      <Text style={styles.productPrice}>{formatUSDFromCents(item.price_cents)}</Text>
      <Text style={styles.productCta}>Buy now →</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <AppHeader />
    <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 28 }}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.header}>Shop</Text>
          <Text style={styles.shopSubtitle}>In Profile → Account. Compete first, buy when you need to.</Text>
        </View>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Your Balance</Text>
        <Text style={styles.balanceValue}>
          {formatUSDFromCents(balanceCents)}
        </Text>
        <Text style={styles.balanceSub}>
          Add funds to your wallet or buy products directly with real money.
        </Text>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 4 }]}>Add funds</Text>
      <View style={styles.packsRow}>
        {MONEY_PACK_OPTIONS.map(({ amountCents, usd }) => {
          const loading = stripeLoading === `${amountCents}`;
          return (
            <Pressable
              key={amountCents}
              style={[styles.packCard, loading && styles.packCardDisabled]}
              onPress={() => handleAddFunds(amountCents)}
              disabled={!!stripeLoading}
            >
              <Text style={styles.packVc}>{formatUSDFromCents(amountCents)}</Text>
              <Text style={styles.packUsd}>${usd.toFixed(2)}</Text>
              {loading ? (
                <Text style={styles.packCta}>...</Text>
              ) : (
                <Text style={styles.packCta}>Buy</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 4 }]}>Gift cards</Text>
      {shopError ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{shopError}</Text>
          <Pressable onPress={loadMarketplace} style={({ pressed }) => [styles.retryBtn, pressSoft(pressed)]}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      ) : shopLoading && giftCardProducts.length === 0 ? (
        <Text style={styles.emptyText}>Loading gift cards...</Text>
      ) : giftCardProducts.length === 0 ? (
        <View style={{ paddingVertical: 8 }}>
          <Text style={styles.seedHint}>Featured cards landing soon</Text>
          <FlatList
            data={SEEDED_GIFT_CARDS}
            keyExtractor={(p) => p.id}
            scrollEnabled={false}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={[styles.productCard, styles.seedCard, { width: Math.min(200, Math.max(132, screenWidth * 0.42)) }]}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productSeller}>{item.seller}</Text>
                <Text style={styles.productPrice}>{item.price}</Text>
                <Text style={styles.seedCta}>{item.cta}</Text>
              </View>
            )}
            ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
            contentContainerStyle={{ paddingVertical: 4 }}
          />
          <Pressable onPress={() => router.push("/apply-seller")} style={({ pressed }) => [styles.retryBtn, pressSoft(pressed), { marginTop: 12 }]}>
            <Text style={styles.retryBtnText}>Apply to sell</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={giftCardProducts}
          keyExtractor={(p) => p.id}
          scrollEnabled={false}
          horizontal
          showsHorizontalScrollIndicator={false}
          renderItem={renderGiftCard}
          ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
          contentContainerStyle={{ paddingVertical: 4 }}
        />
      )}

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Marketplace</Text>
      {shopLoading && marketplaceProducts.length === 0 ? (
        <View style={styles.skeletonRow}>
          <Skeleton width="48%" height={120} borderRadius={12} />
          <Skeleton width="48%" height={120} borderRadius={12} />
        </View>
      ) : marketplaceProducts.length === 0 ? (
        <View style={{ paddingVertical: 12 }}>
          <Text style={styles.seedHint}>Starter marketplace picks</Text>
          <FlatList
            data={SEEDED_MARKETPLACE}
            keyExtractor={(p) => p.id}
            scrollEnabled={false}
            numColumns={2}
            columnWrapperStyle={styles.twoColRow}
            renderItem={({ item }) => (
              <View style={[styles.marketplaceCard, styles.seedCard]}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productSeller}>{item.seller}</Text>
                <Text style={styles.productPrice}>{item.price}</Text>
                <Text style={styles.seedCta}>{item.cta}</Text>
              </View>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            contentContainerStyle={{ paddingVertical: 4 }}
          />
          <Pressable onPress={() => router.push("/apply-seller")} style={({ pressed }) => [styles.retryBtn, pressSoft(pressed), { marginTop: 12 }]}>
            <Text style={styles.retryBtnText}>Apply to sell</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={marketplaceProducts}
          keyExtractor={(p) => p.id}
          scrollEnabled={false}
          numColumns={2}
          columnWrapperStyle={styles.twoColRow}
          renderItem={renderMarketplaceProduct}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          contentContainerStyle={{ paddingVertical: 4 }}
        />
      )}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgFeed },
  scroll: { flex: 1, paddingHorizontal: space.lg, paddingTop: 0 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.lg,
  },

  header: { fontSize: 24, fontWeight: "800", color: colors.text },
  shopSubtitle: { marginTop: 4, fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.line,
  },
  balanceLabel: { color: colors.textTertiary, fontSize: 13 },
  balanceValue: { color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 4 },
  balanceSub: { color: colors.textMuted, fontSize: 12, marginTop: 4 },

  packsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  packCard: {
    minWidth: 72,
    paddingVertical: space.md,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
  },
  packCardDisabled: { opacity: 0.6 },
  packVc: { color: colors.gold, fontSize: 14, fontWeight: "800" },
  packUsd: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
  packCta: { color: colors.actionBlue, fontSize: 12, fontWeight: "600", marginTop: 4 },

  sectionTitle: { color: colors.textSecondary, fontSize: 16, fontWeight: "700", marginBottom: space.sm },
  seedHint: { color: colors.textMuted, fontSize: 12, marginBottom: 8, fontWeight: "700" },
  seedCard: { opacity: 0.88, borderStyle: "dashed" },
  seedCta: { color: colors.textMuted, fontSize: 12, marginTop: 8, fontWeight: "700" },
  emptyText: { color: colors.textMuted, fontSize: 14, marginBottom: 24 },
  errorWrap: { paddingVertical: space.xl, alignItems: "center" },
  errorText: { color: colors.danger, fontSize: 15, textAlign: "center", marginBottom: space.md },
  retryBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  retryBtnText: { color: colors.text, fontWeight: "700" },
  skeletonRow: { flexDirection: "row", justifyContent: "space-between", gap: space.md, marginBottom: 24 },

  productCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    minWidth: 160,
    maxWidth: 200,
  },
  productName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  productSeller: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  productPrice: { color: colors.gold, fontSize: 16, fontWeight: "700", marginTop: 6 },
  productCta: { color: colors.actionBlue, fontSize: 13, fontWeight: "600", marginTop: 6 },
  twoColRow: { justifyContent: "space-between", marginBottom: space.md },
  marketplaceCard: {
    width: "48.5%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginHorizontal: 0,
  },
});
