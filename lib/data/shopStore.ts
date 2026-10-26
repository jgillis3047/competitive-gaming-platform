// lib/data/shopStore.ts - VC rewards catalog + local redemption history
import { create } from "zustand";

export type ShopItem = {
  id: string;
  name: string;
  description: string;
  costVc: number;
  tag?: string;
};

export type Redemption = {
  id: string;
  itemName: string;
  costVc: number;
  createdAt: string;
  status: "pending" | "fulfilled" | "failed";
};

const DEFAULT_ITEMS: ShopItem[] = [
  { id: "break-5", name: "5-min break", description: "Take a short break", costVc: 50 },
  { id: "coffee", name: "Virtual coffee", description: "A moment of zen", costVc: 100 },
  { id: "stretch", name: "Stretch session", description: "Quick stretch reminder", costVc: 75 },
  { id: "meditate", name: "2-min meditate", description: "Quick meditation prompt", costVc: 150 },
  { id: "win-celebration", name: "Win celebration", description: "Celebrate your victory", costVc: 200, tag: "Popular" },
];

type ShopState = {
  items: ShopItem[];
  redemptions: Redemption[];
  seedShop: () => void;
  addRedemption: (item: ShopItem) => void;
};

export const useShopStore = create<ShopState>((set) => ({
  items: [],
  redemptions: [],

  seedShop: () => {
    set({ items: DEFAULT_ITEMS });
  },

  addRedemption: (item: ShopItem) => {
    const r: Redemption = {
      id: `red-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      itemName: item.name,
      costVc: item.costVc,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    set((s) => ({ redemptions: [r, ...s.redemptions] }));
  },
}));
