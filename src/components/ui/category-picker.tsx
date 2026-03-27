"use client";

import { useState, useRef, useEffect } from "react";
import {
  Tag, Car, Fuel, ShoppingCart, Coffee, Utensils,
  Dog, Heart, Star, Gamepad2, Music, Dumbbell,
  Plane, Gift, Baby, Scissors, Wrench, Sparkles,
  Pizza, Wine, Shirt, BookOpen, Tv, Smartphone,
  UtensilsCrossed, Home, Zap, Film, ShoppingBag, GraduationCap,
  Users, MoreHorizontal, Briefcase, Laptop, TrendingUp, RotateCcw,
  Circle, Plus, Check,
} from "lucide-react";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type CustomCategory,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ElementType> = {
  Tag, Car, Fuel, ShoppingCart, Coffee, Utensils,
  Dog, Heart, Star, Gamepad2, Music, Dumbbell,
  Plane, Gift, Baby, Scissors, Wrench, Sparkles,
  Pizza, Wine, Shirt, BookOpen, Tv, Smartphone,
  UtensilsCrossed, Home, Zap, Film, ShoppingBag, GraduationCap,
  Users, MoreHorizontal, Briefcase, Laptop, TrendingUp, RotateCcw, Circle,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] || Circle;
  return <Icon className={cn("w-4 h-4", className)} />;
}

interface CategoryPickerProps {
  value: string;
  type: "expense" | "income";
  customCategories?: CustomCategory[];
  onChange: (slug: string) => void;
  onCreateNew: () => void;
  exclude?: Set<string>;
}

export function CategoryPicker({
  value,
  type,
  customCategories = [],
  onChange,
  onCreateNew,
  exclude,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const builtIn = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const customs = customCategories.filter((c) => c.type === type);

  const allOptions = [
    ...builtIn.map((c) => ({ slug: c.value, label: c.label, icon: c.icon, color: null as string | null })),
    ...customs.map((c) => ({ slug: c.slug, label: c.name, icon: c.icon, color: c.color })),
  ].filter((o) => !exclude || !exclude.has(o.slug));

  const selected = allOptions.find((o) => o.slug === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-all w-full",
          value
            ? "bg-accent-blue/10 border-accent-blue/20 text-accent-blue"
            : "bg-white/[0.05] border-white/[0.08] text-muted"
        )}
      >
        {selected ? (
          <>
            <CategoryIcon name={selected.icon} />
            <span className="flex-1 text-left truncate">{selected.label}</span>
          </>
        ) : (
          <span className="flex-1 text-left">Select category</span>
        )}
        <svg className={cn("w-3 h-3 transition-transform", open && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-surface border border-white/[0.08] rounded-xl shadow-xl max-h-60 overflow-y-auto animate-fade-in">
          {allOptions.map((o) => (
            <button
              key={o.slug}
              type="button"
              onClick={() => { onChange(o.slug); setOpen(false); }}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-white/[0.06] transition-colors",
                value === o.slug && "bg-accent-blue/10 text-accent-blue"
              )}
            >
              <span
                className="w-5 h-5 rounded flex items-center justify-center"
                style={o.color ? { backgroundColor: o.color + "22", color: o.color } : undefined}
              >
                <CategoryIcon name={o.icon} className="w-3.5 h-3.5" />
              </span>
              <span className="flex-1 text-left">{o.label}</span>
              {value === o.slug && <Check className="w-3 h-3 text-accent-blue" />}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { onCreateNew(); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-accent-blue hover:bg-accent-blue/10 transition-colors border-t border-white/[0.06]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create category</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface InlineCategoryPickerProps {
  value: string;
  type: "expense" | "income";
  customCategories?: CustomCategory[];
  onChange: (slug: string) => void;
  onCreateNew: () => void;
}

export function InlineCategoryPicker({
  value,
  type,
  customCategories = [],
  onChange,
  onCreateNew,
}: InlineCategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const builtIn = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const customs = customCategories.filter((c) => c.type === type);
  const allOptions = [
    ...builtIn.map((c) => ({ slug: c.value, label: c.label, icon: c.icon, color: null as string | null })),
    ...customs.map((c) => ({ slug: c.slug, label: c.name, icon: c.icon, color: c.color })),
  ];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-0 rounded-lg hover:bg-white/[0.08] transition-colors"
        title="Change category"
      >
        <span className="sr-only">Change category</span>
      </button>

      {open && (
        <div className="absolute z-50 bottom-full mb-1 left-0 bg-surface border border-white/[0.08] rounded-xl shadow-xl w-48 max-h-52 overflow-y-auto animate-fade-in">
          {allOptions.map((o) => (
            <button
              key={o.slug}
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(o.slug); setOpen(false); }}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-white/[0.06] transition-colors",
                value === o.slug && "bg-accent-blue/10 text-accent-blue"
              )}
            >
              <CategoryIcon name={o.icon} className="w-3.5 h-3.5" />
              <span className="flex-1 text-left truncate">{o.label}</span>
              {value === o.slug && <Check className="w-3 h-3" />}
            </button>
          ))}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCreateNew(); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-accent-blue hover:bg-accent-blue/10 transition-colors border-t border-white/[0.06]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create category</span>
          </button>
        </div>
      )}
    </div>
  );
}
