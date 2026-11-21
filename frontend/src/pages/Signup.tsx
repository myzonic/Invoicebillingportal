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
import { branding } from "@/config/branding";

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
    <div className="relative flex min-h-screen items-center justify-center bg-neutral-100 p-4">
      <Card className="relative w-full max-w-sm border-neutral-200 bg-white text-neutral-900 shadow-xl">
        <CardContent>
          <div className="mb-4 flex items-center justify-center">
            <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-neutral-200">
              <Logo className="size-16" />
            </div>
          </div>
          <h1 className="mb-1 text-lg font-bold text-neutral-900">Create your account</h1>
          <p className="mb-6 text-sm text-neutral-600">Complete the invite to join {branding.portalName}</p>
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
