const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api/planning',
    createProxyMiddleware({
      target: 'https://planning.data.gov.uk',
      changeOrigin: true,
      pathRewrite: {
        '^/api/planning': '',
      },
    })
  );
};
