import serverless from "serverless-http";

let cached;

export const handler = async (event, context) => {
  if (!cached) {
    const mod = await import("./server/index.js");
    cached = serverless(mod.default);
  }
  return cached(event, context);
};
