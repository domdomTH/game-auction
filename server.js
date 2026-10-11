const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// เสิร์ฟโฟลเดอร์ public สำหรับหน้าเว็บ
app.use(express.static(path.join(__dirname, 'public')));

// ข้อมูลจำลองไอเทมประมูลในเกม (มีระบบเวลาและบิด Real-time ในตัว)
let auctions = [
  {
    id: 1,
    title: "ดาบเทพมังกรเพลิง (Dragon Slayer +15)",
    game: "MMORPG World",
    image: "https://images.unsplash.com/photo-1595590424283-b8f17842773f?w=600&auto=format&fit=crop&q=80",
    description: "ระดับ Mythic Option คริติคอล 100% สภาพหายากมาก มีเพียงเล่มเดียวในเซิร์ฟเวอร์",
    currentPrice: 1500,
    minBidStep: 50,
    highestBidder: "DragonKnight_99",
    endTime: Date.now() + 15 * 60 * 1000, // 15 นาทีจากตอนนี้
    history: [
      { user: "DragonKnight_99", amount: 1500, time: new Date().toLocaleTimeString('th-TH') },
      { user: "ShadowNinja", amount: 1400, time: new Date().toLocaleTimeString('th-TH') }
    ]
  },
  {
    id: 2,
    title: "สกินปืนทอง AWP | Dragon Lore (Factory New)",
    game: "Tactical Shooter",
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80",
    description: "Float 0.01 ลายคมกริบ พร้อมสติกเกอร์ Holo สุดแรร์ 4 ใบ",
    currentPrice: 3200,
    minBidStep: 100,
    highestBidder: "SniperElite",
    endTime: Date.now() + 30 * 60 * 1000, // 30 นาที
    history: [
      { user: "SniperElite", amount: 3200, time: new Date().toLocaleTimeString('th-TH') }
    ]
  },
  {
    id: 3,
    title: "สัตว์ขี่ฟีนิกซ์รัตติกาล (Night Phoenix Mount)",
    game: "Fantasy Online",
    image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80",
    description: "เพิ่มความเร็วเดิน 350% บินข้ามสิ่งกีดขวางได้ ปลดปล่อยออร่าไฟสีม่วง",
    currentPrice: 850,
    minBidStep: 50,
    highestBidder: "WizardMaster",
    endTime: Date.now() + 8 * 60 * 1000, // 8 นาที
    history: [
      { user: "WizardMaster", amount: 850, time: new Date().toLocaleTimeString('th-TH') }
    ]
  }
];

// จัดการเชื่อมต่อ Real-time Socket.io
io.on('connection', (socket) => {
  console.log(`[Socket] User connected: ${socket.id}`);

  // ส่งข้อมูลประมูลล่าสุดให้ผู้ใช้ที่เพิ่งเข้าเว็บ
  socket.emit('init_data', auctions);

  // เมื่อมีคนกดเคาะราคา (Bid)
  socket.on('place_bid', ({ auctionId, bidderName, bidAmount }) => {
    const auction = auctions.find(a => a.id === Number(auctionId));

    if (!auction) {
      return socket.emit('bid_error', { message: 'ไม่พบรายการประมูลนี้' });
    }

    if (Date.now() >= auction.endTime) {
      return socket.emit('bid_error', { message: 'การประมูลนี้หมดเวลาแล้ว!' });
    }

    const minRequired = auction.currentPrice + auction.minBidStep;
    if (Number(bidAmount) < minRequired) {
      return socket.emit('bid_error', { 
        message: `ราคาต้องมากกว่าปัจจุบันอย่างน้อย ${auction.minBidStep} บาท (ขั้นต่ำ: ${minRequired} บาท)` 
      });
    }

    // อัปเดตราคา
    auction.currentPrice = Number(bidAmount);
    auction.highestBidder = bidderName || 'Anonymous';
    
    // ระบบ Anti-Snipe: ถ้ามีคนบิดใน 60 วินาทีสุดท้าย ให้บวกเวลาเพิ่มอีก 2 นาที
    const remainingTime = auction.endTime - Date.now();
    if (remainingTime < 60 * 1000) {
      auction.endTime += 2 * 60 * 1000;
    }

    // บันทึกประวัติ
    auction.history.unshift({
      user: auction.highestBidder,
      amount: auction.currentPrice,
      time: new Date().toLocaleTimeString('th-TH')
    });

    // ส่งสัญญาณ Real-time กระจายให้ทุกคนบนเว็บเห็นพร้อมกันทันที
    io.emit('bid_updated', {
      auctionId: auction.id,
      currentPrice: auction.currentPrice,
      highestBidder: auction.highestBidder,
      endTime: auction.endTime,
      history: auction.history
    });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] User disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
