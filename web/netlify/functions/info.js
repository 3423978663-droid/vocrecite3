// Netlify Function：能力信息。
// 在线版已支持「手机扫码上传」（照片暂存到 Netlify Blobs，24 小时后自动清理）。
exports.handler = async (event) => {
  const host = event && event.headers && event.headers.host;
  const origin = process.env.URL || (host ? 'https://' + host : '');
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      origin,
      features: { qrUpload: true, onlineDict: true },
    }),
  };
};
