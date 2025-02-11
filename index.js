const express = require('express');
const net = require('net');

const app = express();
const PORT = 3000;
const OPENVPN_HOST = '127.0.0.1';
const OPENVPN_PORT = 5555;  // Your OpenVPN management port

// Function to send command to OpenVPN management interface
const sendCommandToOpenVPN = (command) => {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let response = '';

        client.connect(OPENVPN_PORT, OPENVPN_HOST, () => {
            client.write(command + '\n');
        });

        client.on('data', (data) => {
            response += data.toString();
            if (response.includes('END')) { // End of OpenVPN response
                client.destroy();
                resolve(response);
            }
        });

        client.on('error', (err) => reject(err));
    });
};

// API Endpoint to get OpenVPN status
app.get('/api/openvpn/status', async (req, res) => {
    try {
        const data = await sendCommandToOpenVPN('status 3');
        res.json({ status: data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API Endpoint to get connected clients
app.get('/api/openvpn/clients', async (req, res) => {
    try {
        const data = await sendCommandToOpenVPN('status 3');
        const clients = data.split('\n').filter(line => line.startsWith('CLIENT_LIST')).map(line => {
            const parts = line.split(',');
            return {
                common_name: parts[1],
                real_address: parts[2],
                bytes_received: parts[3],
                bytes_sent: parts[4],
                connected_since: parts[6]
            };
        });
        res.json(clients);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start Express server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
