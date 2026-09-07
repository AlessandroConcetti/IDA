import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LocalAccessGate } from "./LocalAccessGate";
import "./styles.css";
import "./aurora.css";
import "./worlds.css";
import "./home.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Le point de montage #root est introuvable.");
}

createRoot(rootElement).render(
  <StrictMode>
    <LocalAccessGate>{(onLock) => <App onLock={onLock} />}</LocalAccessGate>
  </StrictMode>,
);
