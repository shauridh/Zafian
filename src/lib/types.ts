export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role: "OWNER" | "ADMIN" | "CASHIER";
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  discount: number;
  note?: string;
  imageUrl?: string | null;
}

export interface ProductDTO {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  readyQty?: number | null;
  categoryId: string | null;
  categoryName?: string;
}

export interface CategoryDTO {
  id: string;
  name: string;
}
