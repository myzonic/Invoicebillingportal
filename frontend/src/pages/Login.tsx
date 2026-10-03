import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useLoginMutation } from "@/app/apiSlice";
import { useAppDispatch } from "@/app/store";
import { setUser } from "@/features/auth/authSlice";
import { tokenStore } from "@/lib/api";
import { errorMessage } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, CardContent } from "@/components/ui/card";
import Logo from "@/components/Logo";
import { branding } from "@/config/branding";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [login, { isLoading }] = useLoginMutation();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/dashboard/main";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const result = await login({ email, password }).unwrap();
      tokenStore.setTokens(result.data.accessToken, result.data.refreshToken);
      dispatch(setUser(result.data.user));
      toast.success(`Welcome back, ${result.data.user.name}`);
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#fffdf5] via-[#fff3d4] to-[#ffe6ab] p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,200,60,0.4),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(212,164,18,0.18),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,rgba(180,140,20,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(180,140,20,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />

      <Card className="relative w-full max-w-sm border-[#eccf83] bg-white/95 text-neutral-900 shadow-[0_24px_60px_-24px_rgba(184,134,11,0.5)] backdrop-blur-xl">
        <CardContent>
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-[#ffe08a] to-[#e0a423] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ring-1 ring-[#d9a520]">
              <Logo className="size-16" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold tracking-tight text-neutral-900">{branding.portalName}</h1>
              <p className="text-sm text-neutral-600">{branding.portalTagline}</p>
            </div>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email" required>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-[#e7c86b] bg-white text-neutral-900 placeholder:text-neutral-400"
              />
            </Field>
            <Field label="Password" required>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-[#e7c86b] bg-white text-neutral-900 placeholder:text-neutral-400"
              />
            </Field>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,#ffe594_0%,#f6c445_45%,#e0a423_100%)] px-6 text-sm font-bold text-neutral-900 shadow-[0_8px_20px_-6px_rgba(196,148,30,0.6),inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
