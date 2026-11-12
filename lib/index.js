/**
 * dsh-model-picker — host half (no-op).
 *
 * The selector is the browser half (`lib/client.js`): it reads and changes the
 * session's model through DeepSeek Harness's own session model directory
 * (`modelDirectories`), the one its shipped selector and `/model` use. Nothing
 * runs here; the row makes the package a loadable bundle.
 *
 * @module dsh-model-picker
 */
export const name = "dsh-model-picker";
export const inject = [];

export function apply() {
  // Nothing to do on the host.
}
