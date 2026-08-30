const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('html')) {
  config.resolver.assetExts.push('html');
}

const previousEnhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const nextMiddleware = previousEnhanceMiddleware
    ? previousEnhanceMiddleware(middleware, server)
    : middleware;
  return (req, res, next) => {
    const accept = req.headers.accept;
    if (typeof accept === 'string' && accept.includes('multipart/mixed')) {
      req.headers.accept = 'application/javascript';
    }
    return nextMiddleware(req, res, next);
  };
};

module.exports = config;
