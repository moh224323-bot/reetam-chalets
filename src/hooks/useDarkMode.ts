import { useState, useEffect } from "react";

export default function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("reetam_theme") === "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.setAttribute("data-theme", "dark");
      localStorage.setItem("reetam_theme", "dark");
    } else {
      root.removeAttribute("data-theme");
      localStorage.setItem("reetam_theme", "light");
    }
  }, [dark]);

  return [dark, () => setDark(d => !d)];
}
