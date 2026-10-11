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
const DB_FILE = path.join(__dirname, 'auctions.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ฟังก์ชันโหลดข้อมูล
function loadAuctions() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading db:', err);
  }
  return [];
}

// ฟังก์ชันบันทึกข้อมูล
function saveAuctions(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving db:', err);
  }
}

let auctions = loadAuctions();

// ระบบ Undo / Backup ประวัติการแก้ไขของ Admin
let backupHistory = [];

function createBackup(note = "Previous state") {
  backupHistory.push({
    timestamp: new Date().toLocaleTimeString('th-TH'),
    note: note,
    data: JSON.parse(JSON.stringify(auctions))
  });
  // เก็บสำรองย้อนหลังสูงสุด 20 ครั้ง
  if (backupHistory.length > 20) {
    backupHistory.shift();
  }
}

// ปรับเวลาเริ่มต้นให้ยังประมูลได้ตอนเริ่มรัน
const now = Date.now();
auctions.forEach((a, idx) => {
  if (a.endTime < now) {
    a.endTime = now + (15 + idx * 10) * 60 * 1000;
  }
});
saveAuctions(auctions);

// --- API สำหรับหน้า ADMIN ---
// 1. ดึงรายการสินค้าทั้งหมด
app.get('/api/admin/auctions', (req, res) => {
  res.json({ auctions, canUndo: backupHistory.length > 0, backupCount: backupHistory.length });
});

// 2. บันทึก / อัปเดตรายการทั้งหมด
app.post('/api/admin/update-all', (req, res) => {
  const { newAuctions } = req.body;
  if (!Array.isArray(newAuctions)) {
    return res.status(400).json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
  }

  // สำรองสถานะเดิมก่อนอัปเดต เพื่อให้กดย้อนกลับ (Undo) ได้
  createBackup("อัปเดตรายการสินค้า");

  auctions = newAuctions;
  saveAuctions(auctions);

  // แจ้งหน้าเว็บทุกคนแบบ Real-time ทันที!
  io.emit('init_data', auctions);

  res.json({ success: true, message: 'อัปเดตและแจ้งเตือนหน้าเว็บเรียบร้อยแล้ว!', backupCount: backupHistory.length });
});

// 3. กดย้อนกลับ (Undo / Revert ก่อนหน้า)
app.post('/api/admin/undo', (req, res) => {
  if (backupHistory.length === 0) {
    return res.status(400).json({ error: 'ไม่มีประวัติก่อนหน้านี้ให้ย้อนกลับ' });
  }

  const lastBackup = backupHistory.pop();
  auctions = lastBackup.data;
  saveAuctions(auctions);

  // แจ้งหน้าเว็บทุกคนให้อัปเดตตามที่ย้อนกลับ
  io.emit('init_data', auctions);

  res.json({ success: true, message: `ย้อนกลับเป็นสถานะ: ${lastBackup.note} (${lastBackup.timestamp}) สำเร็จ!`, backupCount: backupHistory.length });
});

// เส้นทางหน้า Admin Dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- Socket.io สำหรับระบบ Real-time ---
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
    auction.highestBidder = bidderName || 'Guest';

    // Anti-Snipe: ถ้าเคาะใน 60 วินาทีสุดท้าย ขยายเวลาอีก 2 นาที
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
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log(`Admin Dashboard: http://localhost:${PORT}/admin`);
});
