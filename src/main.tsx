import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/components/App";
import "@/index.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Master Collection root element was not found.");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
