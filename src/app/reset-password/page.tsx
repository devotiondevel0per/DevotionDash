"use client";

import Link from "next/link";
import { Suspense, type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAppBranding } from "@/hooks/use-app-branding";

type ValidateResponse = {
  valid?: boolean;
  expiresAt?: string;
};

function ResetPasswordContent() {
  const router = useRouter();
  const { appName, logoUrl } = useAppBranding();
  const searchParams = useSearchParams();
  const token = useMemo(() => (searchParams.get("token") ?? "").trim(), [searchParams]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenExpiry, setTokenExpiry] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setTokenValid(false);
        setValidating(false);
        return;
      }
      setValidating(true);
      try {
        const response = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`, {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as ValidateResponse;
        const valid = Boolean(data.valid);
        setTokenValid(valid);
        setTokenExpiry(valid && data.expiresAt ? data.expiresAt : "");
      } catch {
        setTokenValid(false);
      } finally {
        setValidating(false);
      }
    };

    void validate();
  }, [token]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!tokenValid) {
      setError("Reset link is invalid or expired.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; success?: boolean };
      if (!response.ok) {
        setError(data.error || "Failed to reset password.");
        return;
      }
      setSuccess("Password reset successfully. Redirecting to login...");
      setTimeout(() => router.push("/login"), 900);
    } catch {
      setError("Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1e2433] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src={logoUrl}
            alt={`${appName} logo`}
            className="mx-auto mb-4 h-14 w-14 rounded-xl object-contain"
          />
          <h1 className="text-3xl font-bold text-white tracking-tight">{appName}</h1>
          <p className="text-white/50 text-sm mt-1">Set a new password</p>
        </div>

        <div className="bg-white rounded-xl shadow-2xl p-8 space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Reset Password</h2>

          {validating ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validating reset link...
            </div>
          ) : !tokenValid ? (
            <Alert variant="destructive">
              <AlertDescription>This reset link is invalid or expired.</AlertDescription>
            </Alert>
          ) : (
            <p className="text-xs text-gray-500">
              Link valid until {new Date(tokenExpiry).toLocaleString()}.
            </p>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter new password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={!tokenValid || validating}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={!tokenValid || validating}
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-[#FE0000] hover:bg-[#d90000]"
              disabled={loading || !tokenValid || validating}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Password"
              )}
            </Button>
          </form>

          <div className="text-center">
            <Link href="/login" className="text-sm text-[#FE0000] hover:underline">
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#1e2433] px-4">
          <div className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm text-slate-600 shadow">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading reset form...
          </div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
