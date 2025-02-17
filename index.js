const express = require("express");
const net = require("net");
const path = require("path");
const http = require("http");
const { Pool } = require("pg");
require("dotenv").config();
const { connectSocket } = require("./socket");

const app = express();
const PORT = 3000;
const OPENVPN_HOST = "127.0.0.1";
const OPENVPN_PORT = 5555;
const server = http.createServer(app);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

connectSocket(server);

const pool = new Pool({
  connectionString: process.env.DB_URL,
});

// Initialize database
const initDb = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      log_data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS request_logs (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      ip TEXT NOT NULL
    );
  `;
  await pool.query(createTableQuery);
};
initDb();

// Middleware to log incoming requests
app.use(async (req, res, next) => {
  try {
    const logEntry = {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip || req.connection.remoteAddress,
    };
    await pool.query(
      "INSERT INTO request_logs (method, url, ip) VALUES ($1, $2, $3)",
      [logEntry.method, logEntry.url, logEntry.ip]
    );
  } catch (error) {
    console.error("Error storing request log:", error);
  }
  next();
});

const sendCommandToOpenVPN = (command) => {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let response = "";

    client.connect(OPENVPN_PORT, OPENVPN_HOST, () => {
      client.write(command + "\n");
    });

    client.on("data", (data) => {
      response += data.toString();
      if (response.includes("END")) {
        client.destroy();
        resolve(response);
      }
    });

    client.on("error", (err) => reject(err));
  });
};

// Store OpenVPN logs in PostgreSQL
const storeLog = async (logData) => {
  try {
    await pool.query("INSERT INTO logs (log_data) VALUES ($1)", [logData]);
  } catch (error) {
    console.error("Error storing log:", error);
  }
};

// Periodically fetch and store logs every 4 seconds
const startLogScheduler = () => {
  setInterval(async () => {
    try {
      const logData = await sendCommandToOpenVPN("status 3");
      await storeLog(logData);
      console.log("Log saved at", new Date().toISOString());
    } catch (error) {
      console.error("Error fetching OpenVPN logs:", error);
    }
  }, 4000); // 4 seconds
};

startLogScheduler();

// Route to display OpenVPN status
app.get("/openvpn/status", async (req, res) => {
  try {
    const rawData = await sendCommandToOpenVPN("status 3");
    await storeLog(rawData);
    res.render("status", { status: rawData });
  } catch (error) {
    res.status(500).render("error", { message: error.message });
  }
});

// Route to display OpenVPN clients
app.get("/openvpn/clients", async (req, res) => {
  try {
    const data = await sendCommandToOpenVPN("status 3");
    await storeLog(data);
    res.render("clients", { clients: data });
  } catch (error) {
    res.status(500).render("error", { message: error.message });
  }
});

// Route to display stored logs
app.get("/openvpn/logs", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM logs ORDER BY timestamp DESC"
    );
    res.render("logs", { logs: result.rows });
  } catch (error) {
    res.status(500).render("error", { message: error.message });
  }
});

// Route to display request logs
app.get("/openvpn/request-logs", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM request_logs ORDER BY timestamp DESC"
    );
    res.render("request_logs", { logs: result.rows });
  } catch (error) {
    res.status(500).render("error", { message: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
