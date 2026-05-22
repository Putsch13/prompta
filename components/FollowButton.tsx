"use client";

import { useState } from "react";
import { UserPlus, UserMinus, Loader2 } from "lucide-react";

interface Props {
  creatorId: string;
  initialFollowing: boolean;
}

export function FollowButton({ creatorId, initialFollowing }: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    if (following) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("creator_id", creatorId);
      setFollowing(false);
    } else {
      await supabase.from("follows").insert({
        follower_id: user.id,
        creator_id: creatorId,
      });
      setFollowing(true);
    }
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        following
          ? "border border-border text-muted hover:border-destructive hover:text-destructive"
          : "bg-accent text-white hover:bg-accent-hover"
      } disabled:opacity-50`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : following ? (
        <>
          <UserMinus className="h-4 w-4" />
          Suivi
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4" />
          Suivre
        </>
      )}
    </button>
  );
}
