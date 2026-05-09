// utils/socket.js
let io = null;

// call once from app.js with your http server
function init(server, opts = {}) {
  // lazy require so this file safe to require from controllers before server created
  const { Server } = require("socket.io");
  if (io) return io;
  io = new Server(server, opts);
  io.on("connection", (socket) => {
    // basic debug; you can expand with auth, rooms, etc.
    console.log("Socket connected:", socket.id);
    socket.on("disconnect", () => console.log("Socket disconnected:", socket.id));
  });
  return io;
}

// safe emit helper (no-ops if io not ready)
function emit(event, payload) {
  if (!io) {
    // optionally buffer events here if you want, but for simplicity we just warn
    console.warn("socket.io not initialized yet — emit skipped for", event);
    return false;
  }
  io.emit(event, payload);
  return true;
}

module.exports = { init, emit, _getIo: () => io };
