"use client";

import { useState } from "react";
import {
  Tag, Car, Fuel, ShoppingCart, Coffee, Utensils,
  Dog, Heart, Star, Gamepad2, Music, Dumbbell,
  Plane, Gift, Baby, Scissors, Wrench, Sparkles,
  Pizza, Wine, Shirt, BookOpen, Tv, Smartphone, Circle,
} from "lucide-react";
import { CATEGORY_ICON_OPTIONS, CATEGORY_COLOR_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ICON_MAP: Record<string, React.ElementType> = {
  Tag, Car, Fuel, ShoppingCart, Coffee, Utensils,
  Dog, Heart, Star, Gamepad2, Music, Dumbbell,
  Plane, Gift, Baby, Scissors, Wrench, Sparkles,
  Pizza, Wine, Shirt, BookOpen, Tv, Smartphone, Circle,
};

interface CreateCategoryModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; icon: string; color: string; type: "expense" | "income" }) => void;
  loading?: boolean;
  type?: "expense" | "income";
}

export function CreateCategoryModal({
  open,
  onClose,
  onSave,
  loading,
  type = "expense",
}: CreateCategoryModalProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("Tag");
  const [color, setColor] = useState(CATEGORY_COLOR_OPTIONS[0]);
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Category name is required");
      return;
    }
    onSave({ name: name.trim(), icon, color, type });
    setName("");
    setIcon("Tag");
    setColor(CATEGORY_COLOR_OPTIONS[0]);
  }

  const PreviewIcon = ICON_MAP[icon] || Circle;

  return (
    <Modal open={open} onClose={onClose} title="Create Category">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Preview */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: color + "22", color }}
          >
            <PreviewIcon className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium">{name || "Category Name"}</span>
        </div>

        <Input
          label="Name"
          placeholder="e.g., Car Expenses, Subscriptions, Pet"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {/* Icon picker */}
        <div className="space-y-1.5">
          <label className="block text-sm text-muted">Icon</label>
          <div className="grid grid-cols-8 gap-1.5">
            {CATEGORY_ICON_OPTIONS.map((iconName) => {
              const Ic = ICON_MAP[iconName] || Circle;
              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setIcon(iconName)}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                    icon === iconName
                      ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30"
                      : "bg-white/[0.03] text-muted border border-white/[0.04] hover:bg-white/[0.06]"
                  )}
                >
                  <Ic className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Color picker */}
        <div className="space-y-1.5">
          <label className="block text-sm text-muted">Color</label>
          <div className="flex gap-2 flex-wrap">
            {CATEGORY_COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "w-7 h-7 rounded-full transition-all",
                  color === c ? "ring-2 ring-white ring-offset-2 ring-offset-obsidian" : "hover:scale-110"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-accent-coral">{error}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          Create Category
        </Button>
      </form>
    </Modal>
  );
}
