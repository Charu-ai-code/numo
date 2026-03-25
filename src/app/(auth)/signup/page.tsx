"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmailAlreadyRegistered(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("user already exists") ||
    m.includes("email address is already")
  );
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function validate(): boolean {
    const next: {
      email?: string;
      password?: string;
      confirmPassword?: string;
    } = {};
    if (!email.trim()) {
      next.email = "Email is required";
    } else if (!EMAIL_RE.test(email.trim())) {
      next.email = "Enter a valid email address";
    }
    if (!password) {
      next.password = "Password is required";
    } else if (password.length < 8) {
      next.password = "Password must be at least 8 characters";
    }
    if (password !== confirmPassword) {
      next.confirmPassword = "Passwords do not match";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    if (!validate()) return;

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      if (isEmailAlreadyRegistered(error.message)) {
        setFormError(
          "This email is already in use. Try signing in or use a different address."
        );
      } else {
        setFormError(error.message);
      }
      return;
    }

    if (data.session) {
      router.push("/onboarding");
      router.refresh();
      return;
    }

    setSuccessMessage("Check your email for a confirmation link to finish signing up.");
  }

  async function handleGoogle() {
    setFormError(null);
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setGoogleLoading(false);
    if (error) {
      setFormError(error.message);
    }
  }

  if (successMessage) {
    return (
      <Card className="p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            numo<span className="text-accent-green">.</span>
          </h1>
          <p className="text-sm text-muted">
            Your calm, clear finance companion.
          </p>
        </div>
        <p className="text-sm text-center text-white/90 leading-relaxed">
          {successMessage}
        </p>
        <Button
          variant="secondary"
          className="w-full"
          size="lg"
          onClick={() => setSuccessMessage(null)}
        >
          Back to form
        </Button>
        <p className="text-center text-sm text-muted">
          Already confirmed?{" "}
          <Link href="/login" className="text-accent-blue hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8 space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          numo<span className="text-accent-green">.</span>
        </h1>
        <p className="text-sm text-muted">
          Your calm, clear finance companion.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="email"
          name="email"
          autoComplete="email"
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <Input
          type="password"
          name="password"
          autoComplete="new-password"
          label="Password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <Input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          label="Confirm password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirmPassword}
        />

        {formError && (
          <p className="text-sm text-accent-coral text-center">{formError}</p>
        )}

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Create account
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-white/[0.08]" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wide">
          <span className="bg-surface/80 px-3 text-muted backdrop-blur-sm rounded">
            Or continue with
          </span>
        </div>
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        size="lg"
        loading={googleLoading}
        onClick={handleGoogle}
      >
        Google
      </Button>

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent-blue hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
