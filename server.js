const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;
// รหัสผ่านลับของเจ้าของเว็บ (เปลี่ยนได้)
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'roblox_secret_key_999';
const DB_FILE = path.join(__dirname, 'auctions.json');

const cors = require('cors');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadAuctions() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading db:', err);
  }
  return [];
}

function saveAuctions(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving db:', err);
  }
}

let auctions = loadAuctions();
let backupHistory = [];

function createBackup(note = "Previous state") {
  backupHistory.push({
    timestamp: new Date().toLocaleTimeString('th-TH'),
    note: note,
    data: JSON.parse(JSON.stringify(auctions))
  });
  if (backupHistory.length > 20) backupHistory.shift();
}

// Middleware ป้องกันความปลอดภัย: เฉพาะคนที่มีรหัสลับเท่านั้นถึงจะเรียกใช้ API แอดมินได้
function checkAdminAuth(req, res, next) {
  const token = req.headers['x-admin-key'] || req.query.key;
  if (token !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'ปฏิเสธการเข้าถึง: รหัสผ่านแอดมินไม่ถูกต้อง' });
  }
  next();
}

// API สำหรับโปรแกรมหลังบ้านในเครื่องของคุณ
app.get('/api/admin/auctions', checkAdminAuth, (req, res) => {
  res.json({ auctions, canUndo: backupHistory.length > 0, backupCount: backupHistory.length });
});

app.post('/api/admin/update-all', checkAdminAuth, (req, res) => {
  const { newAuctions } = req.body;
  if (!Array.isArray(newAuctions)) return res.status(400).json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' });

  createBackup("อัปเดตรายการสินค้า");
  auctions = newAuctions;
  saveAuctions(auctions);

  // ส่งสัญญาณให้หน้าเว็บคนเล่นทุกคนอัปเดตทันที
  io.emit('init_data', auctions);
  res.json({ success: true, message: 'อัปเดตสดขึ้นหน้าเว็บคนเล่นสำเร็จแล้ว!', backupCount: backupHistory.length });
});

app.post('/api/admin/undo', checkAdminAuth, (req, res) => {
  if (backupHistory.length === 0) return res.status(400).json({ error: 'ไม่มีประวัติก่อนหน้านี้ให้ย้อนกลับ' });

  const lastBackup = backupHistory.pop();
  auctions = lastBackup.data;
  saveAuctions(auctions);

  io.emit('init_data', auctions);
  res.json({ success: true, message: `ย้อนกลับสถานะสำเร็จ: ${lastBackup.note}`, backupCount: backupHistory.length });
});

// Socket.io สำหรับคนเล่นทั่วไปเคาะราคา
io.on('connection', (socket) => {
  socket.emit('init_data', auctions);

  socket.on('place_bid', ({ auctionId, bidderName, bidAmount }) => {
    const auction = auctions.find(a => a.id === Number(auctionId));
    if (!auction) return socket.emit('bid_error', { message: 'ไม่พบรายการประมูลนี้' });
    if (auction.status === 'cancelled') return socket.emit('bid_error', { message: 'การประมูลนี้ถูกยกเลิกแล้ว' });
    if (Date.now() >= auction.endTime) return socket.emit('bid_error', { message: 'หมดเวลาการประมูลแล้ว!' });

    const minRequired = auction.currentPrice + auction.minBidStep;
    if (Number(bidAmount) < minRequired) {
      return socket.emit('bid_error', {
        message: `ต้องเคาะเพิ่มอย่างน้อย ${auction.minBidStep.toLocaleString()} R$ (ขั้นต่ำ ${minRequired.toLocaleString()} R$)`
      });
    }

    auction.currentPrice = Number(bidAmount);
    auction.highestBidder = bidderName || 'Player';

    if (auction.endTime - Date.now() < 60 * 1000) {
      auction.endTime += 2 * 60 * 1000;
    }

    if (!auction.history) auction.history = [];
    auction.history.unshift({
      user: auction.highestBidder,
      amount: auction.currentPrice,
      time: new Date().toLocaleTimeString('th-TH')
    });

    saveAuctions(auctions);

    io.emit('bid_updated', {
      auctionId: auction.id,
      currentPrice: auction.currentPrice,
      highestBidder: auction.highestBidder,
      endTime: auction.endTime,
      history: auction.history
    });
  });
});

server.listen(PORT, () => {
  console.log(`Web Server running at http://localhost:${PORT}`);
});
