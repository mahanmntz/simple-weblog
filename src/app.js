const http = require('http');
const dotenv = require('dotenv');
dotenv.config();

const PORT = process.env.PORT;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello, World!\n');
}).listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 