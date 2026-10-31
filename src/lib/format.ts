const formatter = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 });
export const formatPrice = (amount: number) =>
  `PKR ${formatter.format(amount)}`;
