// 課堂頁面的設定。這個檔案是公開的，只能放這兩項，不可以放任何 token 或 Webhook 密碼。
//   liffId : LINE Login channel 裡 LIFF app 的 ID（與 src/parameters.js 的 liffId 相同）
//   api    : 備份機器人 GAS 網頁應用程式的網址，結尾是 /exec，不要帶 ?key=
// 兩項都填好之前，頁面以「示範模式」顯示假資料。
window.BACKUP_BOT = {
  liffId: '',
  api: ''
};
