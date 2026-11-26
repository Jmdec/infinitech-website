"use client";

import { useEffect, useState } from "react";

export function useIsPwa() {
  const [isPwa, setIsPwa] = useState<boolean | null>(null); // null = checking pa

  useEffect(() => {
    const check = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        window.matchMedia("(display-mode: minimal-ui)").matches ||
        // iOS Safari
        (window.navigator as any).standalone === true;

      setIsPwa(standalone);
    };

    check();

    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener("change", check);
    return () => mq.removeEventListener("change", check);
  }, []);

  return isPwa;
}
