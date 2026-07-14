export type Category = {
  id: number;
  name: string;
  slug?: string;
  icon?: string;
  description?: string;
  active?: boolean;
  showOnHomepage?: boolean;
  productCount?: number;
};

export type Product = {
  id: number;
  name: string;
  description?: string;
  shortDescription?: string;
  slug?: string;
  originalPrice?: number;
  finalPrice?: number;
  rating?: number;
  reviewCount?: number;
  category?: Category;
  subCategory?: string;
  weight?: number;
  volume?: number;
  sourceStore?: string;
  externalLink?: string;
  stock?: number;
  stockPhysical?: number;
  stockReserved?: number;
  stockAvailable?: number;
  images?: string[];
  externalProductId?: string;
  status?: string;
  available: boolean;
  madeToOrder?: boolean;
  availabilityNote?: string;
  source?: string;
  gallery?: ProductImage[];
  primaryImageUrl?: string;
  primaryThumbnailUrl?: string;
  variants?: ProductVariant[];
  hasVariants?: boolean;
  variantAttributeKeys?: string[];
  specifications?: Record<string, string>;
  packageItems?: string[];
  deliveryInfo?: string;
  warrantyInfo?: string;
  returnPolicy?: string;
  usageGuide?: string;
};

export type ProductVariant = {
  id?: number;
  sku?: string;
  color?: string;
  size?: string;
  externalPrice?: number;
  purchasePrice?: number;
  finalPrice?: number;
  promotionalPrice?: number;
  profitAmount?: number;
  marginPercentage?: number;
  effectivePrice?: number;
  stock?: number;
  stockPhysical?: number;
  stockReserved?: number;
  stockAvailable?: number;
  active?: boolean;
  mainImageUrl?: string;
  displayOrder?: number;
  attributes?: Record<string, string>;
  label?: string;
  inStock?: boolean;
};

export type ProductReview = {
  id?: number;
  reviewerName?: string;
  mine?: boolean;
  rating: number;
  comment: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ProductReviewSummary = {
  averageRating?: number;
  reviewCount?: number;
  reviews: ProductReview[];
};
export type ProductImage = {
  id?: number;
  originalUrl?: string;
  thumbnailUrl?: string;
  displayOrder?: number;
  primaryImage?: boolean;
  altText?: string;
  legacy?: boolean;
};

export type CartItem = {
  itemId: number;
  productId: number;
  productName: string;
  originalPrice?: number;
  price: number;
  quantity: number;
  subTotal: number;
  imageUrl?: string;
  variantLabel?: string;
  itemType?: string;
  sourceStore?: string;
  externalLink?: string;
  madeToOrder: boolean;
  availabilityNote?: string;
};

export type Cart = {
  cartId: number;
  userId: number;
  totalPrice: number;
  items: CartItem[];
};

export type CouponValidation = {
  valid: boolean;
  code?: string;
  name?: string;
  description?: string;
  message?: string;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  totalBeforeDiscount?: number;
  totalAfterDiscount?: number;
  appliesTo?: "INTERNAL_PRODUCTS" | "EXTERNAL_ORDERS" | "ALL";
};

export type Quote = {
  id: number;
  version: number;
  active: boolean;
  currency?: string;
  exchangeRate?: number;
  routeName?: string;
  origin?: string;
  destination?: string;
  estimatedDays?: string;
  productAmountOrigin?: number;
  shippingAmountOrigin?: number;
  customsType?: "PERCENT" | "FIXED" | string;
  customsValue?: number;
  customsPercent?: number;
  riskPercent?: number;
  sitePercent?: number;
  productAmountMzn?: number;
  shippingAmountMzn?: number;
  customsAmountMzn?: number;
  riskReserveAmountMzn?: number;
  operationalCostAmountMzn?: number;
  urgentChargeAmountMzn?: number;
  urgentChargePercentage?: number;
  siteFeeAmountMzn?: number;
  subtotalMzn?: number;
  localDeliveryAmountMzn?: number;
  finalAmountMzn?: number;
  finalAmountWithDeliveryMzn?: number;
  quotedAt?: string;
};

export type Payment = {
  id: number;
  amount?: number;
  method?: string;
  status?: string;
  transactionId?: string;
  payerName?: string;
  payerPhone?: string;
  notes?: string;
  adminNote?: string;
  paymentDate?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  provider?: string;
  providerReference?: string;
  providerStatus?: string;
  checkoutUrl?: string;
  expectedAmount?: number;
  receiptUrl?: string | null;
};

export type OrderItem = {
  productId?: number;
  productCode?: string;
  productName?: string;
  quantity: number;
  price?: number;
  subtotal?: number;
  variantId?: number;
  variantSku?: string;
  variantName?: string;
  variantLabel?: string;
  selectedVariantLabel?: string;
  variantAttributesSnapshot?: string;
  variantAttributesJson?: string;
  variantAttributes?: Record<string, string>;
};

export type ClientTrackingStep = {
  key: string;
  label: string;
  description?: string | null;
  /** COMPLETED | CURRENT | PENDING | FAILED */
  state: "COMPLETED" | "CURRENT" | "PENDING" | "FAILED";
  occurredAt?: string | null;
};

export type ClarificationField =
  | "SIZE"
  | "COLOR"
  | "MODEL"
  | "QUANTITY"
  | "STORAGE"
  | "LINK"
  | "PHOTO"
  | "OTHER";

export type OrderClarificationRequest = {
  id: number;
  orderId: number;
  requestedByAdminId?: number | null;
  status: "PENDING" | "ANSWERED" | "CANCELLED";
  message?: string | null;
  requestedFields: ClarificationField[];
  answers?: Record<string, string>;
  photoUrls?: string[];
  createdAt?: string;
  answeredAt?: string | null;
};

export type Order = {
  id: number;
  version?: number;
  code?: string;
  type: string;
  sourceStore?: string;
  deliveryMethod?: string;
  payOnDelivery?: boolean;
  urgent?: boolean;
  purchaseGroupKey?: string;
  purchaseGroupSize?: number;
  groupedPurchase?: boolean;
  externalCartUrl?: string;
  productDetails?: string;
  requestedQuantity?: number;
  requestScreenshotUrl?: string;
  requestScreenshotUrls?: string[];
  needsCustomerCorrection?: boolean;
  needsClarification?: boolean;
  customerCorrectionNote?: string | null;
  activeClarificationRequest?: OrderClarificationRequest | null;
  clarificationHistory?: OrderClarificationRequest[];
  customerEditable?: boolean;
  purchaseConfirmedAt?: string | null;
  purchaseProofUrl?: string | null;
  purchaseProofUploadedAt?: string | null;
  supplierPurchaseAmount?: number | null;
  supplierOrderReference?: string | null;
  supplierName?: string | null;
  purchaseNote?: string | null;
  purchaseConfirmationRevertedAt?: string | null;
  purchaseConfirmationRevertedReason?: string | null;
  baseAmount?: number;
  commissionAmount?: number;
  deliveryFee?: number;
  deliveryPrice?: number | null;
  shippingPrice?: number | null;
  assignedDeliveryFee?: number | null;
  deliveryCurrency?: string | null;
  deliveryPaymentMode?: string | null;
  paymentMethod?: string | null;
  codEnabled?: boolean;
  depositRequired?: boolean;
  depositAmount?: number | null;
  remainingAmountOnDelivery?: number | null;
  deliveryPaymentStatus?: "PENDING" | "RECEIVED" | "WAIVED" | string | null;
  deliveryCollectionMethod?: "PAYSUITE" | "MANUAL_TRANSFER" | "CASH_IN_HAND" | string | null;
  activeDeliveryPaymentUrl?: string | null;
  hasActiveDeliveryPaymentAttempt?: boolean | null;
  urgentSurchargeAmount?: number;
  exchangeRate?: number;
  totalAmount?: number;
  couponCode?: string;
  discountAmount?: number;
  totalBeforeDiscount?: number;
  totalAfterDiscount?: number;
  customerFullName?: string;
  primaryPhoneNumber?: string;
  alternativePhoneNumber?: string;
  customerEmail?: string;
  customerNotes?: string;
  deliveryCity?: string;
  deliveryNeighborhood?: string;
  deliveryStreet?: string;
  houseNumber?: string;
  deliveryReference?: string;
  googleMapsLink?: string;
  hasAddresses?: boolean;
  defaultAddress?: UserAddress | null;
  deliveryAddressSnapshot?: UserAddress | null;
  savedAddresses?: UserAddress[];
  requiresAddressSelection?: boolean;
  requiresAddressCreation?: boolean;
  requiresDeliveryConfirmation?: boolean;
  canConfirmDelivery?: boolean;
  canConfirmAddress?: boolean;
  canChangeDeliveryAddress?: boolean;
  deliveryStatusLabel?: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverEmail?: string;
  assignedDriverPhone?: string;
  status: string;
  orderDate?: string;
  paymentDate?: string;
  deliveryDate?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
  deliveryAttempt?: number;
  lastIssueType?: string;
  deliveryNotes?: string;
  adminMessageForClient?: string;
  unreadUpdatesCount?: number;
  requiresAction?: boolean;
  attentionLabel?: string;
  nextActionLabel?: string;
  nextActionUrl?: string;
  items?: OrderItem[];
  quote?: Quote;
  payment?: Payment;
  trackingSummarySteps?: ClientTrackingStep[] | null;
  trackingDetailSteps?: ClientTrackingStep[] | null;
};

export type CheckoutResponse = {
  mixedCheckout: boolean;
  message?: string;
  primaryOrder: Order | null;
  localOrder?: Order | null;
  externalOrder?: Order | null;
  orders?: Order[];
};

export type OrderStats = {
  totalOrders: number;
  inProgress: number;
  delivered: number;
  totalSpent: number;
};

export type UserAddress = {
  id: number;
  label: string;
  city: string;
  neighborhood: string;
  street: string;
  houseNumber?: string;
  reference: string;
  googleMapsLink?: string;
  defaultAddress: boolean;
  fullAddress: string;
};

export type CustomerProfile = {
  name: string;
  email: string;
  avatarUrl?: string;
  displayName?: string;
  initials?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  alternativePhoneNumber?: string;
  birthDate?: string;
  gender?: string;
  city?: string;
  deliveryCity?: string;
  deliveryNeighborhood?: string;
  deliveryStreet?: string;
  houseNumber?: string;
  deliveryReference?: string;
  googleMapsLink?: string;
  formattedDeliveryAddress?: string;
  preferredDeliveryMethod?: string;
  hasDeliveryAddress?: boolean;
  deliveryAddressRecommended?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  verificationRequired?: boolean;
  verificationCompleted?: boolean;
  verificationDestination?: string;
  verificationDestinationMasked?: string;
  recommendedVerificationChannel?: string;
  availableVerificationChannels?: string[];
  pendingActions?: string[];
  profileCompleted?: boolean;
  profileCompletionPercentage?: number;
  notifyOrderUpdates: boolean;
  notifyQuoteReady: boolean;
  notifyPromotions: boolean;
  notifySms?: boolean;
  localPasswordEnabled?: boolean;
  canSetLocalPassword?: boolean;
  authProvider?: string;
  memberSince?: string;
  passwordUpdatedAt?: string;
  mustChangePassword?: boolean;
  profileIncomplete?: boolean;
  hasRealEmail?: boolean;
  accountCompletionPercentage?: number;
  accountMissingSteps?: string[];
  securityVerificationLevel?: string;
  accountStatus?: string;
};

export type VerificationDispatchResponse = {
  sent: boolean;
  channel?: string;
  destination?: string;
  destinationMasked?: string;
  expiresInSeconds?: number;
  message?: string;
};

export type SpringPage<T> = {
  content: T[];
  totalPages: number;
  totalElements: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
};
