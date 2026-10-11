const express = require('express');
const path = require('path');
const open = null;

const app = express();
const ADMIN_PORT = 4000; // รันพอร์ต 4000 แยกบนเครื่องคุณเท่านั้น

app.use(express.static(path.join(__dirname, 'admin-app')));

app.listen(ADMIN_PORT, () => {
  console.log(`=======================================================`);
  console.log(`🎮 [ROBLOX AUCTION - ADMIN CONTROL APP]`);
  console.log(`โปรแกรมจัดการหลังบ้านเปิดใช้งานแล้วบนเครื่องของคุณ:`);
  console.log(`👉 http://localhost:${ADMIN_PORT}`);
  console.log(`=======================================================`);
});
