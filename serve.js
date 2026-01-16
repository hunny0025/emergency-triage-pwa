const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './index.html';
    
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    
    switch (extname) {
        case '.js': contentType = 'text/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.json': contentType = 'application/json'; break;
        case '.png': contentType = 'image/png'; break;
        case '.jpg': contentType = 'image/jpg'; break;
        case '.ico': contentType = 'image/x-icon'; break;
    }
    
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if(error.code === 'ENOENT') {
                // Page not found
                res.writeHead(404);
                res.end('404 - File Not Found');
            } else {
                // Server error
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            // Success
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Service-Worker-Allowed': '/'
            });
            res.end(content, 'utf-8');
        }
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 SERVER STARTED!');
    console.log('══════════════════════════════════');
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`📱 On Phone: http://[YOUR-IP]:${PORT}`);
    console.log('══════════════════════════════════');
    console.log('\n📊 To find your IP address:');
    console.log('Windows: ipconfig');
    console.log('Mac/Linux: ifconfig');
    console.log('\n📱 On your phone:');
    console.log('1. Connect to same WiFi');
    console.log('2. Open Chrome');
    console.log('3. Visit the phone URL above');
    console.log('══════════════════════════════════\n');
});

// Handle shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Server shutting down...');
    process.exit(0);
});