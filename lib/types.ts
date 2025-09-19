export type ShopStatus = 'preparing' | 'open';

export type Shop = {
  ownerUserId: string;
  shopId: string;
  name: string;
  purchaseMessage: string;
  status: ShopStatus;
  createdAt: FirebaseFirestore.Timestamp | null;
  updatedAt: FirebaseFirestore.Timestamp | null;
};

export type Product = {
  id: string;
  shopId: string;
  name: string;
  description: string;
  price: number;
  inventory: number;
  imageUrl?: string;
  questionEnabled: boolean;
  questionText?: string;
  createdAt: FirebaseFirestore.Timestamp | null;
  updatedAt: FirebaseFirestore.Timestamp | null;
  isArchived?: boolean;
};

export type OrderStatus = 'pending' | 'accepted' | 'canceled';

export type OrderItemSnapshot = {
  productId: string;
  name: string;
  unitPrice: number;
};

export type Order = {
  id: string;
  shopId: string;
  buyerUserId: string;
  buyerDisplayId: string;
  status: OrderStatus;
  items: Array<OrderItemSnapshot & { quantity: number }>;
  total: number;
  questionResponse?: string | null;
  memo?: string | null;
  closed?: boolean;
  createdAt: FirebaseFirestore.Timestamp | null;
  updatedAt: FirebaseFirestore.Timestamp | null;
  acceptedAt?: FirebaseFirestore.Timestamp | null;
  canceledAt?: FirebaseFirestore.Timestamp | null;
};
