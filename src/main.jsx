import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "leaflet/dist/leaflet.css";
import iconPng from "./logo/icon.png";

const favicon = document.querySelector("#favicon");
if (favicon) favicon.href = iconPng;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
