const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const net = require("net");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" },
});

const OPENVPN_HOST = "localhost";
const OPENVPN_PORT = 5555;

app.use(cors());
app.use(express.json());

// Function to send a command to OpenVPN via Telnet
const sendTelnetCommand = (command, callback) => {
  const client = new net.Socket();
  let responseData = "";

  client.connect(OPENVPN_PORT, OPENVPN_HOST, () => {
    client.write(command + "\n");
  });

  client.on("data", (data) => {
    responseData += data.toString();
  });

  client.on("end", () => {
    callback(responseData);
  });

  client.on("error", (err) => {
    callback(`Error: ${err.message}`);
  });
};

// API Route to Fetch Logs from OpenVPN
app.get("/api/logs", (req, res) => {
  sendTelnetCommand("log all", (logs) => {
    res.json({ logs });
  });
});

// WebSocket for Real-Time Log Streaming
io.on("connection", (socket) => {
  console.log("New WebSocket connection");

  const fetchLogs = () => {
    sendTelnetCommand("log all", (logs) => {
      socket.emit("logs:update", logs);
    });
  };

  fetchLogs();
  const logInterval = setInterval(fetchLogs, 5000); // Update logs every 5 seconds

  socket.on("disconnect", () => {
    console.log("Client disconnected");
    clearInterval(logInterval);
  });
});

// Start Server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
