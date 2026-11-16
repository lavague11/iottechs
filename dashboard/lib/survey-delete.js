// Device delete + undo for the Site Survey roster (section B). The roster only SENDS verbs; the widget owns
// the data. `delete` carries a one-off token so the widget can keep the removed device (same object: cid,
// tag, photo) and its array index, and `undoDelete` names that token to splice it back. Nothing here
// renumbers anything — cids are never derived from position.
export const UNDO_MS = 5000;

let seq = 0;
export function newDeleteToken() { seq += 1; return `d${Date.now().toString(36)}${seq}`; }

export function deleteDeviceCmd(id) { return { cmd: "delete", id, token: newDeleteToken() }; }
export function undoDeleteCmd(token) { return { cmd: "undoDelete", token }; }
