// Fork default (fork/DECISIONS.md #5): no product analytics or OpenTelemetry export unless the
// launching environment opts back in. Set before main so the backend child inherits both.
process.env.T3CODE_TELEMETRY_ENABLED ??= "false";
process.env.T3CODE_OTEL_SDK_DISABLED ??= "true";
require("./compileCache.cjs");
require("./main.cjs");
