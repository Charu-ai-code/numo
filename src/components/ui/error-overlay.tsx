"use client";

import { WifiOff } from "lucide-react";
import { Button } from "./button";

interface ErrorOverlayProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorOverlay({
  message = "Something went wrong",
  onRetry,
}: ErrorOverlayProps) {
  return (
    <div className="glass p-8 flex flex-col items-center justify-center text-center animate-fade-in">
      <WifiOff className="w-10 h-10 text-accent-coral mb-4" />
      <p className="text-white/80 mb-4">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
