// 读取扫码上传的照片，返回给电脑端浏览器显示。
const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'readvocab-sessions';

function text(statusCode, body, headers) {
  return { statusCode, headers: headers || {}, body, isBase64Encoded: true };
}

function getId(event) {
  const q = event.queryStringParameters || {};
  if (q.id && /^[A-Za-z0-9-]{1,64}$/.test(q.id)) return q.id;
  const raw = decodeURIComponent(String(event.path || '').split('?')[0]);
  const segs = raw.split('/').filter(Boolean);
  const last = segs[segs.length - 1];
  if (last && /^[A-Za-z0-9-]{1,64}$/.test(last)) return last;
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return text(405, 'method not allowed');
  const id = getId(event);
  if (!id) return text(400, 'bad id');

  const store = getStore({ name: STORE_NAME });
  const metaText = await store.get('meta:' + id, { type: 'text' });
  if (!metaText) return text(404, 'not found');

  let type = 'image/jpeg';
  try { type = (JSON.parse(metaText).type) || type; } catch (e) {}

  const buf = await store.get('photo:' + id, { type: 'arrayBuffer' });
  if (!buf) return text(404, 'not found');

  return text(200, Buffer.from(buf).toString('base64'), {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  }, true);
};
