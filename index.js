const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const fs = require("fs");
const Tail = require("tail").Tail;
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
  },
});

// Path to OpenVPN status log (default path)
const STATUS_LOG = "/etc/openvpn/status.log";

// Enable CORS
app.use(cors());
app.use(express.json());

// Store active connections
let connections = [];

// Function to parse OpenVPN status log
const parseStatusLog = () => {
  if (!fs.existsSync(STATUS_LOG)) return [];

  const data = fs.readFileSync(STATUS_LOG, "utf8");
  const lines = data.split("\n");
  let parsedConnections = [];

  let parsing = false;
  for (const line of lines) {
    if (line.startsWith("Common Name")) {
      parsing = true; // Start reading connections
      continue;
    }
    if (parsing && line.trim() === "") break;

    if (parsing) {
      const parts = line.split(",");
      if (parts.length >= 4) {
        parsedConnections.push({
          commonName: parts[0],
          realIP: parts[1],
          bytesReceived: parseInt(parts[2]),
          bytesSent: parseInt(parts[3]),
          connectedSince: parts[4],
        });
      }
    }
  }

  return parsedConnections;
};

// API Route to get active connections
app.get("/api/connections", (req, res) => {
  connections = parseStatusLog();
  res.json(connections);
});

// WebSocket connection
io.on("connection", (socket) => {
  console.log("New client connected");

  socket.emit("connections:update", connections);

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Watch OpenVPN status log for changes
if (fs.existsSync(STATUS_LOG)) {
  const tail = new Tail(STATUS_LOG);
  tail.on("line", () => {
    connections = parseStatusLog();
    io.emit("connections:update", connections);
  });

  tail.on("error", (error) => {
    console.error("Error watching file:", error);
  });
}

// Start server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
