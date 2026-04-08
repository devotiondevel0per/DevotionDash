"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAppBranding } from "@/hooks/use-app-branding";

export default function ForgotPasswordPage() {
  const { appName, logoUrl } = useAppBranding();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        setError(data.error || "Failed to request reset link.");
        return;
      }
      setMessage(data.message || "If an account exists, a reset link has been sent.");
    } catch {
      setError("Failed to request reset link.");
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
          <p className="text-white/50 text-sm mt-1">Password recovery</p>
        </div>

        <div className="bg-white rounded-xl shadow-2xl p-8 space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Forgot Password</h2>
          <p className="text-sm text-gray-500">Enter your email or login. We will send a reset link.</p>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {message && (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="identifier">Email or Login</Label>
              <Input
                id="identifier"
                type="text"
                autoFocus
                placeholder="you@company.com or username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
            </div>

            <Button type="submit" className="w-full bg-[#AA8038] hover:bg-[#D98D00]" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending link...
                </>
              ) : (
                "Send Reset Link"
              )}
            </Button>
          </form>

          <div className="text-center">
            <Link href="/login" className="text-sm text-[#AA8038] hover:underline">
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
