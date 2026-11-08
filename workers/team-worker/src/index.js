// Cloudflare entry point. Routes live in app.js, which Node can import without the Cloudflare
// runtime module that durable.js needs.

import { createApp } from './app.js';

export { GlobalGate, TeamGate } from './durable.js';

const app = createApp();

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
};
