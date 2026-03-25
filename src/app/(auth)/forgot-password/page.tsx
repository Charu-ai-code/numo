"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function validate(): boolean {
    if (!email.trim()) {
      setFieldError("Email is required");
      return false;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setFieldError("Enter a valid email address");
      return false;
    }
    setFieldError(undefined);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}/auth/callback`,
      }
    );
    setLoading(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setSuccessMessage(
      "Check your email — we sent a link to reset your password."
    );
  }

  return (
    <Card className="p-6 sm:p-8 space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          numo<span className="text-accent-green">.</span>
        </h1>
        <p className="text-sm text-muted">Reset your password</p>
      </div>

      {successMessage ? (
        <p className="text-sm text-center text-white/90 leading-relaxed">
          {successMessage}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            name="email"
            autoComplete="email"
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldError}
          />

          {formError && (
            <p className="text-sm text-accent-coral text-center">{formError}</p>
          )}

          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="text-accent-blue hover:underline">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
