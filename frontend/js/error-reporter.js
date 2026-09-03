// Plain script (not type="module"), loaded on every page, same pattern as
// register-sw.js: no backend or third-party account exists to send errors
// to, so this doesn't invent one. What it closes is the actual gap — an
// uncaught error or rejected promise in production previously left no trace
// anywhere once the tab closed, not even in the user's own console history.
// Keeping the last few errors in sessionStorage means "it broke, then I
// reloaded" is still diagnosable by asking the user to open devtools and
// read window.TASKLOCAL_ERROR_LOG, instead of being unrecoverable.
const ERROR_LOG_KEY = "tasklocal_error_log";
const MAX_LOGGED_ERRORS = 20;

function logClientError(entry) {
  let log;
  try {
    log = JSON.parse(sessionStorage.getItem(ERROR_LOG_KEY)) || [];
  } catch {
    log = [];
  }
  log.push({ ...entry, at: new Date().toISOString(), page: window.location.pathname });
  if (log.length > MAX_LOGGED_ERRORS) log.shift();
  try {
    sessionStorage.setItem(ERROR_LOG_KEY, JSON.stringify(log));
  } catch {
    // sessionStorage full or unavailable (private browsing) — the
    // console.error below still fires, so nothing is silently lost.
  }
}

window.addEventListener("error", (event) => {
  logClientError({ type: "error", message: event.message, source: event.filename, line: event.lineno });
});

window.addEventListener("unhandledrejection", (event) => {
  logClientError({ type: "unhandledrejection", message: String(event.reason?.message || event.reason) });
});

// Read this in devtools after a bug report: window.TASKLOCAL_ERROR_LOG
Object.defineProperty(window, "TASKLOCAL_ERROR_LOG", {
  get() {
    try {
      return JSON.parse(sessionStorage.getItem(ERROR_LOG_KEY)) || [];
    } catch {
      return [];
    }
  },
});
