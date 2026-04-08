import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Shop } from "@/types";

interface ShopState {
    shop: Shop | null;
    setShop: (shop: Shop) => void;
    clearShop: () => void;
}

export const useShopStore = create<ShopState>()(
    persist<ShopState>(
        (set) => ({
            shop: null,
            setShop: (shop: Shop) => set({ shop }),
            clearShop: () => set({ shop: null }),
        }),
        {
            name: "repairdesk-shop",
            storage: createJSONStorage(() => localStorage),
        }
    )
);

export function useCurrency() {
    const shop = useShopStore((s) => s.shop);
    return shop?.currency_symbol || "₹";
}
