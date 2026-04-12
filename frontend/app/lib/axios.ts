// lib/axios.ts
// -------------
// A single axios instance used across all hooks.
// The base URL reads from an environment variable so you never hardcode
// the backend address — just set NEXT_PUBLIC_API_URL in .env.local

import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;