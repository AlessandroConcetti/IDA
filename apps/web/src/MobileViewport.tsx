import { useEffect } from "react";
import { connectMobileViewport } from "./mobile-viewport";

export function MobileViewport() {
  useEffect(() => connectMobileViewport(window, document), []);
  return null;
}
