export type Currency = "USD" | "INR";

export type AccountType = "bank" | "credit_card" | "wallet" | "crypto_wallet";

export type TransactionType =
  | "expense"
  | "income"
  | "transfer_out"
  | "transfer_in";

export type SplitMethod = "equal" | "percentage" | "custom";

export type Recurrence = "daily" | "weekly" | "biweekly" | "monthly";

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

export type GoalTypeSlug =
  | "send_home"
  | "emergency"
  | "travel"
  | "invest"
  | "education"
  | "custom";

export const GOAL_TYPES: { value: GoalTypeSlug; label: string }[] = [
  { value: "send_home", label: "Send Money Home" },
  { value: "emergency", label: "Emergency Fund" },
  { value: "travel", label: "Travel" },
  { value: "invest", label: "Invest in Stocks" },
  { value: "education", label: "Education" },
  { value: "custom", label: "Custom" },
];

export const GOAL_TEMPLATES: {
  name: string;
  target: number;
  currency: Currency;
  months: number;
  icon: string;
  color: string;
  goal_type: GoalTypeSlug;
  is_recurring?: boolean;
  monthly_target?: number;
}[] = [
  {
    name: "Emergency Fund",
    target: 10000,
    currency: "USD",
    months: 12,
    icon: "Shield",
    color: "#4edea3",
    goal_type: "emergency",
  },
  {
    name: "Travel Home",
    target: 200000,
    currency: "INR",
    months: 6,
    icon: "Plane",
    color: "#b0c6ff",
    goal_type: "travel",
  },
  {
    name: "Education / Upskilling",
    target: 5000,
    currency: "USD",
    months: 18,
    icon: "GraduationCap",
    color: "#e9c349",
    goal_type: "education",
  },
  {
    name: "Security Deposit",
    target: 3000,
    currency: "USD",
    months: 6,
    icon: "Key",
    color: "#ffb4ab",
    goal_type: "custom",
  },
  {
    name: "Tech & Tools",
    target: 1500,
    currency: "USD",
    months: 3,
    icon: "Laptop",
    color: "#b0c6ff",
    goal_type: "custom",
  },
  {
    name: "Send Home Savings",
    target: 500000,
    currency: "INR",
    months: 24,
    icon: "Heart",
    color: "#4edea3",
    goal_type: "send_home",
    is_recurring: true,
    monthly_target: 15000,
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

export interface CustomCategory {
  id: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
  type: "expense" | "income";
}

export const CATEGORY_ICON_OPTIONS = [
  "Tag", "Car", "Fuel", "ShoppingCart", "Coffee", "Utensils",
  "Dog", "Heart", "Star", "Gamepad2", "Music", "Dumbbell",
  "Plane", "Gift", "Baby", "Scissors", "Wrench", "Sparkles",
  "Pizza", "Wine", "Shirt", "BookOpen", "Tv", "Smartphone",
];

export const CATEGORY_COLOR_OPTIONS = [
  "#ffb4ab", "#4edea3", "#b0c6ff", "#e9c349", "#c49bff",
  "#ff8fab", "#67e8f9", "#fbbf24", "#a3e635", "#f472b6",
];

export function getCategoryIcon(category: string, customCategories?: CustomCategory[]): string {
  const all = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
  const built = all.find((c) => c.value === category);
  if (built) return built.icon;
  const custom = customCategories?.find((c) => c.slug === category);
  if (custom) return custom.icon;
  return "Circle";
}

export function getCategoryLabel(category: string, customCategories?: CustomCategory[]): string {
  const all = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
  const built = all.find((c) => c.value === category);
  if (built) return built.label;
  const custom = customCategories?.find((c) => c.slug === category);
  if (custom) return custom.name;
  return category;
}

export function getCategoryColor(category: string, customCategories?: CustomCategory[]): string | null {
  const custom = customCategories?.find((c) => c.slug === category);
  return custom?.color || null;
}
