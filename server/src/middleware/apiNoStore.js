export function disableApiCaching(req, res, next) {
  if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/workflow')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
}
