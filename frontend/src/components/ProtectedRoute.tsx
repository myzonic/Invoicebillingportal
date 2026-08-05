import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/app/store";
import { tokenStore } from "@/lib/api";
import { setUser } from "@/features/auth/authSlice";
import { useMeQuery } from "@/app/apiSlice";
import { Spinner } from "@/components/ui/table";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const { data, isError, isFetching } = useMeQuery();

  useEffect(() => {
    if (data) dispatch(setUser(data.data));
  }, [data, dispatch]);

  if (!tokenStore.access) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (isError) {
    tokenStore.clear();
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (isFetching && !user) return <Spinner />;

  return <>{children}</>;
}
