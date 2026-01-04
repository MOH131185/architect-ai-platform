const runtimeEnv = {
  isBrowser: typeof window !== 'undefined' && typeof document !== 'undefined',

  getWindow() {
    return runtimeEnv.isBrowser ? window : null;
  },

  getSession() {
    if (!runtimeEnv.isBrowser) {
      return null;
    }

    try {
      return window.sessionStorage || null;
    } catch {
      return null;
    }
  },

  getLocal() {
    if (!runtimeEnv.isBrowser) {
      return null;
    }

    try {
      return window.localStorage || null;
    } catch {
      return null;
    }
  }
};

export default runtimeEnv;

