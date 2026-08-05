import { FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useSignupMutation } from "@/app/apiSlice";
import { tokenStore } from "@/lib/api";
import { useAppDispatch } from "@/app/store";
import { setUser } from "@/features/auth/authSlice";
import { errorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, CardContent } from "@/components/ui/card";
import Logo from "@/components/Logo";

export default function Signup() {
  const { token = "" } = useParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, { isLoading }] = useSignupMutation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const result = await signup({ token, name, email, password }).unwrap();
      tokenStore.setTokens(result.data.accessToken, result.data.refreshToken);
      dispatch(setUser(result.data.user));
      toast.success("Account created");
      navigate("/dashboard/main", { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#fffdf5] via-[#fff3d4] to-[#ffe6ab] p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,200,60,0.4),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(212,164,18,0.18),transparent_55%)]" />
      <Card className="relative w-full max-w-sm border-[#eccf83] bg-white/95 text-neutral-900 shadow-[0_24px_60px_-24px_rgba(184,134,11,0.5)] backdrop-blur-xl">
        <CardContent>
          <div className="mb-4 flex items-center justify-center">
            <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-[#ffe08a] to-[#e0a423] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ring-1 ring-[#d9a520]">
              <Logo className="size-16" />
            </div>
          </div>
          <h1 className="mb-1 text-lg font-bold text-neutral-900">Create your account</h1>
          <p className="mb-6 text-sm text-neutral-600">Complete the invite to join Myzonic Portal</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Full name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Email" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password" required hint="Minimum 8 characters">
              <Input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <Button type="submit" className="w-full" loading={isLoading}>
              Create account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
