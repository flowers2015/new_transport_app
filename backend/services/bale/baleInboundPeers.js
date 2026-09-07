const MAX = 20;
const peers = [];

function recordPrivatePeer({ chatId, fromId, name, username }) {
  const id = String(chatId ?? '').trim();
  if (!id) return;
  const entry = {
    chatId: id,
    fromId: fromId != null ? String(fromId) : null,
    name: name || null,
    username: username || null,
    at: new Date().toISOString(),
  };
  const rest = peers.filter(p => p.chatId !== id);
  peers.splice(0, peers.length, entry, ...rest);
  if (peers.length > MAX) peers.length = MAX;
}

function listRecentPrivatePeers() {
  return peers.slice();
}

module.exports = { recordPrivatePeer, listRecentPrivatePeers };
