import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

/**
 * Subscribes to Supabase Realtime for all public schema changes.
 * Calls `onReload` on any INSERT / UPDATE / DELETE.
 * Replaces the 30-second polling interval.
 */
export default function useRealtimeSync(onReload: () => void) {
  const reloadRef = useRef(onReload);
  reloadRef.current = onReload;

  useEffect(() => {
    const channel = supabase
      .channel("app-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        () => { reloadRef.current(); }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Realtime] connected");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
