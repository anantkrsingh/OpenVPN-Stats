const WebSocket = require("ws");

const connectSocket = (server) => {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    console.log("A client connected");

    ws.on("message", (message) => {
      console.log("Received message:", message);
    });

    ws.on("close", () => {
      console.log("A client disconnected");
    });
  });
};

module.exports = { connectSocket };