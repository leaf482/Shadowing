import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import iconPng from "./logo/icon.png";

if (import.meta.env.VITE_SENTRY_DSN) {
  import("./sentryClient.js").then((m) => m.initBrowserSentry());
}

const favicon = document.querySelector("#favicon");
if (favicon) favicon.href = iconPng;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
