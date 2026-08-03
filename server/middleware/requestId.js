import { randomUUID } from "crypto";

export function requestIdMiddleware(req, res, next) {
  const inboundId = req.headers["x-request-id"];
  const requestId = typeof inboundId === "string" && inboundId.trim()
    ? inboundId.trim()
    : randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}
