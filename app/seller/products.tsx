// app/seller/products.tsx - List & add products
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import AppHeader from "../components/AppHeader";
import { getSellerByUserId } from "../../lib/backend/sellers";
import type { SellerRow } from "../../lib/backend/sellers";
import { listProducts, createProduct } from "../../lib/backend/products";
import type { ProductRow, ProductCategory } from "../../lib/backend/products";
import { useAuthStore } from "../../lib/data/authStore";

const CATEGORIES: ProductCategory[] = ["gift_card", "gear", "apparel", "other"];

function formatVc(vc: number) {
  return `${vc.toLocaleString("en-US")} VC`;
}

export default function SellerProductsScreen() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [seller, setSeller] = useState<SellerRow | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceVc, setPriceVc] = useState("");
  const [category, setCategory] = useState<ProductCategory>("gear");

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const s = await getSellerByUserId(userId);
      setSeller(s);
      if (!s) return;
      const list = await listProducts({ sellerId: s.id, limit: 100 });
      setProducts(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    const trimmedName = name.trim();
    const vc = parseInt(priceVc, 10);
    if (!trimmedName || !seller || !userId) {
      Alert.alert("Error", "Name is required.");
      return;
    }
    if (!Number.isFinite(vc) || vc <= 0) {
      Alert.alert("Error", "Enter a valid price (VC).");
      return;
    }
    setAdding(true);
    try {
      await createProduct({
        sellerId: seller.id,
        userId,
        name: trimmedName,
        description: description.trim() || null,
        priceCents: vc, // stored as VC amount
        category,
      });
      setName("");
      setDescription("");
      setPriceVc("");
      setCategory("gear");
      setShowAdd(false);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not add product.");
    } finally {
      setAdding(false);
    }
  };

  if (!seller) return null;

  return (
    <View style={styles.container}>
      <AppHeader />
      <View style={styles.content}>
        <Pressable style={styles.addButton} onPress={() => setShowAdd(!showAdd)}>
          <Text style={styles.addButtonText}>{showAdd ? "Cancel" : "+ Add product"}</Text>
        </Pressable>

        {showAdd && (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Product name"
              placeholderTextColor="#6b7280"
              value={name}
              onChangeText={setName}
              editable={!adding}
            />
            <TextInput
              style={[styles.input, styles.inputArea]}
              placeholder="Description (optional)"
              placeholderTextColor="#6b7280"
              value={description}
              onChangeText={setDescription}
              multiline
              editable={!adding}
            />
            <TextInput
              style={styles.input}
              placeholder="Price (VC)"
              placeholderTextColor="#6b7280"
              value={priceVc}
              onChangeText={setPriceVc}
              keyboardType="number-pad"
              editable={!adding}
            />
            <View style={styles.categoryRow}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.categoryChip, category === c && styles.categoryChipActive]}
                  onPress={() => setCategory(c)}
                >
                  <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}>{c.replace("_", " ")}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.submitButton} onPress={handleAdd} disabled={adding}>
              {adding ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitButtonText}>Add product</Text>}
            </Pressable>
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="small" color="#60a5fa" style={{ marginTop: 24 }} />
        ) : products.length === 0 ? (
          <Text style={styles.empty}>No products yet. Add one above.</Text>
        ) : (
          <FlatList
            data={products}
            keyExtractor={(p) => p.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.productRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{item.name}</Text>
                  <Text style={styles.productMeta}>{item.category} · {formatVc(item.price_cents)}</Text>
                </View>
                <Text style={[styles.badge, !item.is_active && styles.badgeInactive]}>{item.is_active ? "Active" : "Inactive"}</Text>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050819" },
  content: { flex: 1, padding: 16 },
  addButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    marginBottom: 16,
  },
  addButtonText: { color: "#fff", fontWeight: "600" },
  form: {
    backgroundColor: "#0b1120",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#111827",
  },
  input: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 12,
    color: "#fff",
    fontSize: 15,
    marginBottom: 10,
  },
  inputArea: { minHeight: 60 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#1e293b",
  },
  categoryChipActive: { backgroundColor: "#2563eb" },
  categoryChipText: { color: "#9ca3af", fontSize: 13 },
  categoryChipTextActive: { color: "#fff", fontWeight: "600" },
  submitButton: {
    backgroundColor: "#16a34a",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  submitButtonText: { color: "#fff", fontWeight: "700" },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  empty: { color: "#6b7280", marginTop: 16 },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0b1120",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#111827",
  },
  productName: { color: "#fff", fontSize: 15, fontWeight: "600" },
  productMeta: { color: "#9ca3af", fontSize: 12, marginTop: 2 },
  badge: { fontSize: 11, fontWeight: "700", color: "#22c55e", paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#14532d", borderRadius: 999 },
  badgeInactive: { color: "#9ca3af", backgroundColor: "#374151" },
});
