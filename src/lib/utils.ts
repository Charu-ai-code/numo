import { clsx, type ClassValue } from "clsx";
import { type Currency } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(
  amount: number,
  currency: Currency,
  compact = false
): string {
  if (compact) {
    if (currency === "INR") {
      if (Math.abs(amount) >= 10000000)
        return `₹${(amount / 10000000).toFixed(1)}Cr`;
      if (Math.abs(amount) >= 100000)
        return `₹${(amount / 100000).toFixed(1)}L`;
      if (Math.abs(amount) >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    } else {
      if (Math.abs(amount) >= 1000000)
        return `$${(amount / 1000000).toFixed(1)}M`;
      if (Math.abs(amount) >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
    }
  }

  const symbol = currency === "INR" ? "₹" : "$";
  const locale = currency === "INR" ? "en-IN" : "en-US";

  return `${symbol}${Math.abs(amount).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}${amount < 0 ? " (deficit)" : ""}`;
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateShort(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function daysRemaining(targetDate: string | Date): number {
  const target = new Date(targetDate);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function daysInCurrentMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

export function daysLeftInMonth(): number {
  const now = new Date();
  const total = daysInCurrentMonth();
  return total - now.getDate();
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}
