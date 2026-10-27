const formatter = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });
export const formatPrice = (amount: number) =>
  `PKR ${formatter.format(amount)}`;
