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
    <div className="relative flex min-h-screen items-center justify-center bg-neutral-100 p-4">

      <Card className="relative w-full max-w-sm border-neutral-200 bg-white text-neutral-900 shadow-xl">
        <CardContent>
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-neutral-200">
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
                className="border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400"
              />
            </Field>
            <Field label="Password" required>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400"
              />
            </Field>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-6 text-sm font-bold text-white shadow-lg outline-none transition-all hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-60"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
