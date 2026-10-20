/* From AppUpload's lib/apiError.js (appupload main) — unchanged. */
// Turn raw Anthropic SDK errors into a clear, user-facing message + HTTP status.
export function friendlyApiError(e) {
  const status = e?.status || e?.statusCode;
  let message;
  switch (status) {
    case 401:
      message =
        "Authentication failed — the ANTHROPIC_API_KEY is missing or invalid. Check that it's a real key from console.anthropic.com (starts with sk-ant-), copied in full with no extra spaces, and set on the server.";
      break;
    case 403:
      message = "The ANTHROPIC_API_KEY is valid but not permitted for this request. Check the key's workspace/permissions.";
      break;
    case 429:
      message = "Rate limited or out of credits. Check your Anthropic plan, usage limits, and billing.";
      break;
    case 400:
      message = `The request was rejected by the API: ${e?.message || "bad request"}.`;
      break;
    case 529:
      message = "The model is temporarily overloaded. Please try again in a moment.";
      break;
    default:
      message = e?.message || "The request to the AI service failed.";
  }
  const err = new Error(message);
  err.statusCode = status && Number.isInteger(status) ? status : 502;
  return err;
}
