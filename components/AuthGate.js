"use client";

import { useEffect } from "react";
import { useAuth } from "../lib/auth-context";
import { useRouter } from "next/navigation";

export default function AuthGate({ children }) {
  const { user, profile, loading, firebaseConfigured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (firebaseConfigured && !loading && !user) {
      router.replace("/login");
    }
  }, [firebaseConfigured, loading, router, user]);

  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f6f8f5] text-sm text-[#77817d]">
        Loading your learning home...
      </div>
    );
  if (!firebaseConfigured) return children;
  if (!user)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f6f8f5] text-sm text-[#77817d]">
        Redirecting to login...
      </div>
    );
  return children;
}
