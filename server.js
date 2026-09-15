const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const clients = new Map();
let nextId = 1;

const server = http.createServer((req, res) => {
  let file = req.url === '/' ? 'index.html' : req.url.replace(/^\//, '');
  const safe = path.normalize(file).replace(/^\.\.(\/|\\)/, '');
  const filePath = path.join(__dirname, safe);
  if (!filePath.startsWith(__dirname) || !fs.existsSync(filePath)) {
    res.writeHead(404); return res.end('Not found');
  }
  const ext = path.extname(filePath);
  const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css'};
  res.writeHead(200, {'Content-Type': types[ext] || 'application/octet-stream'});
  fs.createReadStream(filePath).pipe(res);
});

const wss = new WebSocket.Server({ server });
function broadcast(obj, except) {
  const data = JSON.stringify(obj);
  for (const [id, c] of clients) if (c.ws.readyState === WebSocket.OPEN && id !== except) c.ws.send(data);
}
function playerList() {
  return [...clients.values()].map(c => ({id:c.id,name:c.name,color:c.color,x:c.x||0,y:c.y||0,z:c.z||0,ry:c.ry||0,vehicle:c.vehicle||null}));
}
function sendPlayers() { broadcast({type:'players', players: playerList()}); }

wss.on('connection', ws => {
  const id = String(nextId++);
  const client = {ws,id,name:'Player',color:0x245cff,x:0,y:0,z:0,ry:0,vehicle:null};
  clients.set(id, client);
  ws.send(JSON.stringify({type:'welcome',id}));

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'join') {
      client.name = String(m.name || 'Player').slice(0,24);
      client.color = Number(m.color) || 0x245cff;
      sendPlayers();
    } else if (m.type === 'state') {
      for (const k of ['x','y','z','ry']) if (Number.isFinite(Number(m[k]))) client[k] = Number(m[k]);
      client.vehicle = m.vehicle || null;
      sendPlayers();
    } else if (m.type === 'chat') {
      broadcast({type:'chat', name:client.name, message:String(m.message||'').slice(0,300)});
    } else if (m.type === 'voice-signal' && m.to) {
      const target = clients.get(String(m.to));
      if (target && target.ws.readyState === WebSocket.OPEN)
        target.ws.send(JSON.stringify({type:'voice-signal',from:id,candidate:m.candidate,description:m.description}));
    }
  });
  ws.on('close', () => { clients.delete(id); sendPlayers(); });
});

server.listen(PORT, () => console.log(`Just Talk running on port ${PORT}`));
