import { API_GATEWAY_STAGE } from "../lib/env.js";

export function apiGatewayStageMiddleware(req, _res, next) {
  if (!process.env.AWS_EXECUTION_ENV || !API_GATEWAY_STAGE || API_GATEWAY_STAGE === "$default") {
    next();
    return;
  }
  const prefix = `/${API_GATEWAY_STAGE}`;
  const raw = req.originalUrl || req.url || "/";
  const qIdx = raw.indexOf("?");
  const pathOnly = qIdx === -1 ? raw : raw.slice(0, qIdx);
  const qs = qIdx === -1 ? "" : raw.slice(qIdx);
  if (pathOnly !== prefix && !pathOnly.startsWith(`${prefix}/`)) {
    next();
    return;
  }
  const rest = pathOnly === prefix ? "/" : pathOnly.slice(prefix.length);
  req.url = rest + qs;
  req.originalUrl = req.url;
  next();
}
