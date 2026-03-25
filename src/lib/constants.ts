export type Currency = "USD" | "INR";

export type AccountType = "bank" | "credit_card" | "wallet" | "crypto_wallet";

export type TransactionType = "expense" | "income";

export type SplitMethod = "equal" | "percentage" | "custom";

export type Recurrence = "daily" | "weekly" | "monthly";

export const ACCOUNT_TYPES: {
  value: AccountType;
  label: string;
  icon: string;
}[] = [
  { value: "bank", label: "Bank Account", icon: "Landmark" },
  { value: "credit_card", label: "Credit Card", icon: "CreditCard" },
  { value: "wallet", label: "Digital Wallet", icon: "Wallet" },
  { value: "crypto_wallet", label: "Crypto Wallet", icon: "Bitcoin" },
];

export const EXPENSE_CATEGORIES = [
  { value: "food", label: "Food & Dining", icon: "UtensilsCrossed" },
  { value: "transport", label: "Transport", icon: "Car" },
  { value: "housing", label: "Housing", icon: "Home" },
  { value: "utilities", label: "Utilities", icon: "Zap" },
  { value: "healthcare", label: "Healthcare", icon: "Heart" },
  { value: "entertainment", label: "Entertainment", icon: "Film" },
  { value: "shopping", label: "Shopping", icon: "ShoppingBag" },
  { value: "education", label: "Education", icon: "GraduationCap" },
  { value: "family_remittance", label: "Family/Remittance", icon: "Users" },
  { value: "other_expense", label: "Other", icon: "MoreHorizontal" },
];

export const INCOME_CATEGORIES = [
  { value: "salary", label: "Salary", icon: "Briefcase" },
  { value: "freelance", label: "Freelance", icon: "Laptop" },
  { value: "passive", label: "Passive Income", icon: "TrendingUp" },
  { value: "credit_refund", label: "Credit/Refund", icon: "RotateCcw" },
  { value: "other_income", label: "Other", icon: "MoreHorizontal" },
];

export const GOAL_TEMPLATES = [
  {
    name: "Emergency Fund",
    target: 10000,
    currency: "USD" as Currency,
    months: 12,
    icon: "Shield",
    color: "#4edea3",
  },
  {
    name: "Travel Home",
    target: 200000,
    currency: "INR" as Currency,
    months: 6,
    icon: "Plane",
    color: "#b0c6ff",
  },
  {
    name: "Education / Upskilling",
    target: 5000,
    currency: "USD" as Currency,
    months: 18,
    icon: "GraduationCap",
    color: "#e9c349",
  },
  {
    name: "Security Deposit",
    target: 3000,
    currency: "USD" as Currency,
    months: 6,
    icon: "Key",
    color: "#ffb4ab",
  },
  {
    name: "Tech & Tools",
    target: 1500,
    currency: "USD" as Currency,
    months: 3,
    icon: "Laptop",
    color: "#b0c6ff",
  },
  {
    name: "Send Home Savings",
    target: 500000,
    currency: "INR" as Currency,
    months: 24,
    icon: "Heart",
    color: "#4edea3",
  },
];

export const REMITTANCE_METHODS = [
  "Wise",
  "Remitly",
  "Western Union",
  "Bank Wire",
  "Other",
];

export const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function getCategoryIcon(category: string): string {
  const all = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
  return all.find((c) => c.value === category)?.icon || "Circle";
}

export function getCategoryLabel(category: string): string {
  const all = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
  return all.find((c) => c.value === category)?.label || category;
}
