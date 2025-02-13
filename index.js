const express = require('express');
const net = require('net');
const path = require('path');

const app = express();
const PORT = 3000;
const OPENVPN_HOST = '127.0.0.1';
const OPENVPN_PORT = 5555;

// Set EJS as the template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const sendCommandToOpenVPN = (command) => {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let response = '';

        client.connect(OPENVPN_PORT, OPENVPN_HOST, () => {
            client.write(command + '\n');
        });

        client.on('data', (data) => {
            response += data.toString();
            if (response.includes('END')) { 
                client.destroy();
                resolve(response);
            }
        });

        client.on('error', (err) => reject(err));
    });
};

const parseOpenVPNStatus = (data) => {
    const lines = data.split('\n');
    const result = {
        time: null,
        clients: [],
        routing_table: [],
        global_stats: {}
    };

    for (const line of lines) {
        const parts = line.split('\t');

        if (line.startsWith("TIME")) {
            result.time = parts[1];  
        } 
        else if (line.startsWith("CLIENT_LIST")) {
            result.clients.push({
                common_name: parts[1],
                real_address: parts[2],
                virtual_address: parts[3] || null,
                virtual_ipv6_address: parts[4] || null,
                bytes_received: parseInt(parts[5], 10),
                bytes_sent: parseInt(parts[6], 10),
                connected_since: parts[7],
                connected_since_time_t: parseInt(parts[8], 10),
                username: parts[9],
                client_id: parseInt(parts[10], 10),
                peer_id: parseInt(parts[11], 10),
                data_channel_cipher: parts[12]
            });
        } 
        else if (line.startsWith("ROUTING_TABLE")) {
            result.routing_table.push({
                virtual_address: parts[1],
                common_name: parts[2],
                real_address: parts[3],
                last_ref: parts[4],
                last_ref_time_t: parseInt(parts[5], 10)
            });
        } 
        else if (line.startsWith("GLOBAL_STATS")) {
            result.global_stats[parts[1]] = parseInt(parts[2], 10);
        }
    }

    return result;
};

// Render OpenVPN status page
app.get('/openvpn/status', async (req, res) => {
    try {
        const rawData = await sendCommandToOpenVPN('status 3');
        const parsedData = parseOpenVPNStatus(rawData);
        res.render('status', { status: parsedData });
    } catch (error) {
        res.status(500).render('error', { message: error.message });
    }
});

// Render OpenVPN clients page
app.get('/openvpn/clients', async (req, res) => {
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
        res.render('clients', { clients });
    } catch (error) {
        res.status(500).render('error', { message: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
