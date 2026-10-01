export const FREE_SHIPPING_THRESHOLD = 500;
export const BASIC_SHIPPING_FEE = 60;

export const calculateShippingFee = (subtotal: number): number => {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : BASIC_SHIPPING_FEE;
};
