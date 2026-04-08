"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import { useAppBranding } from "@/hooks/use-app-branding";

const schema = z.object({
  login: z.string().min(1, "Login is required"),
  password: z.string().min(1, "Password is required"),
  otp: z.string().optional(),
  remember: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { appName, appTagline, logoUrl } = useAppBranding();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpRequired, setOtpRequired] = useState(false);
  const [stepHint, setStepHint] = useState("");
  const [lockedLogin, setLockedLogin] = useState("");
  const [lockedPassword, setLockedPassword] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const watchedLogin = watch("login");
  const watchedPassword = watch("password");

  const credsKey = useMemo(() => `${(watchedLogin ?? "").trim()}|${watchedPassword ?? ""}`, [watchedLogin, watchedPassword]);
  const lockedCredsKey = useMemo(() => `${lockedLogin}|${lockedPassword}`, [lockedLogin, lockedPassword]);

  useEffect(() => {
    if (!otpRequired) return;
    if (credsKey !== lockedCredsKey) {
      setOtpRequired(false);
      setStepHint("");
      setValue("otp", "");
    }
  }, [credsKey, lockedCredsKey, otpRequired, setValue]);

  const continueSignIn = async (input: { login: string; password: string; otp: string }) => {
    const result = await signIn("credentials", {
      login: input.login,
      password: input.password,
      otp: input.otp,
      redirect: false,
    });
    if (result?.error) {
      return false;
    }
    router.push("/home");
    return true;
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError("");
    setStepHint("");

    const login = data.login.trim();
    const password = data.password;
    const otp = (data.otp ?? "").trim();

    try {
      if (otpRequired) {
        if (!otp) {
          setError("Enter your 2-step verification code.");
          return;
        }
        const ok = await continueSignIn({ login, password, otp });
        if (!ok) setError("Invalid 2-step code or backup code.");
        return;
      }

      const precheck = await fetch("/api/auth/login-precheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const precheckData = (await precheck.json().catch(() => ({}))) as { error?: string; requireOtp?: boolean };

      if (!precheck.ok) {
        setError(precheckData.error || "Login failed. Check credentials or security policy.");
        return;
      }

      if (precheckData.requireOtp) {
        setOtpRequired(true);
        setLockedLogin(login);
        setLockedPassword(password);
        setStepHint("2-step verification is enabled for this account.");
        setValue("otp", "");
        return;
      }

      const ok = await continueSignIn({ login, password, otp: "" });
      if (!ok) {
        setError("Login failed. Check credentials, OTP, or security policy.");
      }
    } finally {
      setLoading(false);
    }
  };

  const resetOtpStep = () => {
    setOtpRequired(false);
    setStepHint("");
    setLockedLogin("");
    setLockedPassword("");
    setValue("otp", "");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src={logoUrl}
            alt={`${appName} logo`}
            className="mx-auto mb-4 h-14 w-14 rounded-xl border bg-white p-1 object-contain"
          />
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{appName}</h1>
          <p className="text-slate-500 text-sm mt-1">{appTagline}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_20px_48px_rgba(15,23,42,0.18)]">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Sign in</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {stepHint && (
              <Alert className="border-[#AA8038]/30 bg-[#AA8038]/5 text-[#9B6500]">
                <AlertDescription>{stepHint}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="login">Login</Label>
              <Input
                id="login"
                type="text"
                placeholder="Username or email"
                autoFocus
                {...register("login")}
                readOnly={otpRequired}
                className={errors.login ? "border-red-500" : ""}
              />
              {errors.login && <p className="text-xs text-red-500">{errors.login.message}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="text-xs text-[#AA8038] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="********"
                {...register("password")}
                readOnly={otpRequired}
                className={errors.password ? "border-red-500" : ""}
              />
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>

            {otpRequired && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="otp">2-Step Code</Label>
                  <button
                    type="button"
                    onClick={resetOtpStep}
                    className="text-xs text-[#AA8038] hover:underline"
                  >
                    Change credentials
                  </button>
                </div>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  placeholder="Google Authenticator code or backup code"
                  {...register("otp")}
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <input id="remember" type="checkbox" className="rounded border-gray-300" {...register("remember")} />
              <Label htmlFor="remember" className="font-normal text-sm cursor-pointer">
                Remember me
              </Label>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {otpRequired ? "Verifying..." : "Signing in..."}
                </>
              ) : (
                otpRequired ? "Verify & Sign In" : "Continue"
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-slate-400 text-xs mt-6">
          Copyright {new Date().getFullYear()} {appName}. All rights reserved.
        </p>
      </div>
    </div>
  );
}
