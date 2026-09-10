import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LocalAccessGate } from "./LocalAccessGate";
import { LivingGlass } from "./LivingGlass";
import "./styles.css";
import "./aurora.css";
import "./worlds.css";
import "./home.css";
import "./global-theme.css";
import "./world-scenes.css";
import "./glass.css";
import "./environments.css";
import "./fridge-scene.css";
import "./classic-fridge.css";
import "./reference-environments.css";
import "./fabrique-environment.css";
import "./weather-environment.css";
import { applyTheme, readTheme } from "./theme";

const rootElement = document.getElementById("root");
try {
  applyTheme(readTheme(window.localStorage), document.documentElement);
} catch {
  applyTheme("classic", document.documentElement);
}

if (!rootElement) {
  throw new Error("Le point de montage #root est introuvable.");
}

createRoot(rootElement).render(
  <StrictMode>
    <LivingGlass root={rootElement} />
    <LocalAccessGate>{(onLock) => <App onLock={onLock} />}</LocalAccessGate>
  </StrictMode>,
);
