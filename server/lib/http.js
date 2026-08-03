export function sendError(req, res, status, error, extra = {}) {
  res.status(status).json({
    error,
    requestId: req.requestId || "unknown",
    ...extra,
  });
}
