/*
 * A drop-in for decode-uri-component@0.2 without its exponential worst case
 * (GHSA-vcc3-ghjq-m6fr). The upstream fix (0.5.0) is ESM-only, and query-string@7 (used by
 * expo-router) requires this module from CommonJS, so the fix is vendored here and wired in with
 * a pnpm override. Behaviour: decode what is valid, keep malformed sequences as written; every
 * input is processed in linear time.
 */
var RUN = /(?:%[0-9a-f]{2})+/gi;
var BYTE = /%[0-9a-f]{2}/gi;

function decodeByte(b) {
  try {
    return decodeURIComponent(b);
  } catch (_) {
    return b;
  }
}

function decodeRun(run) {
  try {
    return decodeURIComponent(run);
  } catch (_) {
    // Not valid UTF-8 as a whole: keep the undecodable bytes, decode the ASCII ones.
    return run.replace(BYTE, decodeByte);
  }
}

module.exports = function decodeUriComponent(encodedURI) {
  if (typeof encodedURI !== 'string') {
    throw new TypeError(
      `Expected \`encodedURI\` to be of type \`string\`, got \`${typeof encodedURI}\``,
    );
  }
  var input = encodedURI.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(input);
  } catch (_) {
    return input.replace(RUN, decodeRun);
  }
};
