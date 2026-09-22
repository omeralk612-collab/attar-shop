// خادم متجر العطور — بدون أي مكتبة خارجية، Node فقط
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const ADMIN_CODE = (process.env.ADMIN_CODE || 'admin123').trim();

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'shop.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    items TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    family TEXT NOT NULL,
    notes TEXT NOT NULL,
    size TEXT NOT NULL,
    description TEXT NOT NULL,
    price INTEGER NOT NULL,
    image TEXT,
    created_at TEXT NOT NULL
  )
`);

/* ============ المنتجات ============ */
function readProducts() {
  return db.prepare('SELECT * FROM products ORDER BY rowid ASC').all();
}
function getProduct(id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}
function insertProduct(p) {
  db.prepare(`
    INSERT INTO products (id, name, family, notes, size, description, price, image, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(p.id, p.name, p.family, p.notes, p.size, p.description, p.price, p.image, p.created_at);
}

// زرع المنتجات الأولية مرة واحدة فقط
if (db.prepare('SELECT COUNT(*) AS c FROM products').get().c === 0) {
  const initial = [
    { id: 'oud-malaki', name: 'عود ملكي', family: 'عودي', notes: 'عود كمبودي، صندل، مسك أبيض', price: 145, size: '50 مل',
      description: 'عود أصيل بدخان دافئ، يفتح بحدّة العود الخام ثم يستقر على قاعدة من المسك والصندل.' },
    { id: 'zahrat-yasmin', name: 'زهرة الياسمين', family: 'زهري', notes: 'ياسمين، ورد طائفي، فانيليا', price: 98, size: '50 مل',
      description: 'باقة زهرية ناعمة، الياسمين يتقدم أولًا ثم يليّن الورد الطائفي حضوره بلمسة فانيليا خفيفة.' },
    { id: 'anbar-sharqi', name: 'عنبر شرقي', family: 'شرقي', notes: 'عنبر، فانيليا، بخور', price: 120, size: '50 مل',
      description: 'دفء العنبر الشرقي ممزوجًا بالبخور، عطر يلازم الجسم ساعات طويلة في هدوء.' },
    { id: 'nada-sabah', name: 'ندى الصباح', family: 'حمضي منعش', notes: 'برغموت، ليمون، نعناع', price: 76, size: '50 مل',
      description: 'انتعاش أول النهار، حمضيات صافية تليها لمسة نعناع خفيفة تبقى قريبة من الجلد.' },
    { id: 'khashab-atiq', name: 'خشب عتيق', family: 'خشبي', notes: 'صندل، أرز، جلد', price: 132, size: '50 مل',
      description: 'خشبيات دافئة بثقل هادئ، الصندل والأرز يبنيان قاعدة ثابتة تليق بالمساء.' },
    { id: 'misk-tahir', name: 'مسك طاهر', family: 'مسكي', notes: 'مسك أبيض، حليب، خيزران', price: 89, size: '50 مل',
      description: 'مسك نظيف قريب من رائحة الجلد، هادئ منذ اللحظة الأولى وحتى أثره الأخير.' }
  ];
  for (const p of initial) {
    insertProduct({ ...p, image: null, created_at: new Date().toISOString() });
  }
}

/* ============ حفظ الصورة (base64 → ملف) ============ */
function saveImage(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i);
  if (!m) throw new Error('صيغة الصورة غير مدعومة (استخدم PNG أو JPG أو WEBP)');
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw new Error('حجم الصورة يتجاوز 3 ميجابايت');
  const filename = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
  return '/uploads/' + filename;
}

function deleteImage(imagePath) {
  if (!imagePath) return;
  const f = path.join(UPLOAD_DIR, path.basename(imagePath));
  if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch {} }
}

/* ============ الطلبات ============ */
function readOrders() {
  const rows = db.prepare('SELECT * FROM orders ORDER BY date DESC').all();
  return rows.map(row => ({ ...row, items: JSON.parse(row.items) }));
}
function insertOrder(order) {
  db.prepare(`
    INSERT INTO orders (id, date, name, phone, city, address, items, total, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(order.id, order.date, order.name, order.phone,
    order.city, order.address, JSON.stringify(order.items), order.total, order.status);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 8e6) req.destroy(); // حتى 8 ميجا (يكفي لصورة base64)
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404 - الصفحة غير موجودة</h1>');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function serveStatic(res, pathname) {
  const filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('ممنوع'); }
  serveFile(res, filePath);
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  /* ============ واجهات عامة ============ */
  if (pathname === '/api/products' && req.method === 'GET') {
    return sendJSON(res, 200, readProducts());
  }

  // خدمة الصور المرفوعة
  if (pathname.startsWith('/uploads/') && req.method === 'GET') {
    const file = decodeURIComponent(pathname.slice('/uploads/'.length));
    if (!file || file.includes('/') || file.includes('..')) {
      res.writeHead(400); return res.end('اسم ملف غير صالح');
    }
    return serveFile(res, path.join(UPLOAD_DIR, file));
  }

  if (pathname === '/api/orders' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); }
    catch { return sendJSON(res, 400, { error: 'بيانات غير صالحة' }); }

    const { name, phone, city, address, items } = body;
    if (!name || !phone || !city || !address || !Array.isArray(items) || items.length === 0) {
      return sendJSON(res, 400, { error: 'الرجاء إكمال جميع البيانات واختيار منتج واحد على الأقل' });
    }

    let total = 0;
    const validatedItems = [];
    for (const item of items) {
      const product = getProduct(item.id);
      if (!product) continue;
      const qty = Math.max(1, Math.min(20, parseInt(item.qty) || 1));
      total += product.price * qty;
      validatedItems.push({ id: product.id, name: product.name, price: product.price, qty });
    }
    if (validatedItems.length === 0) {
      return sendJSON(res, 400, { error: 'المنتجات المختارة غير صالحة' });
    }

    const order = {
      id: 'ORD-' + Date.now(),
      date: new Date().toISOString(),
      name: String(name).slice(0, 100),
      phone: String(phone).slice(0, 30),
      city: String(city).slice(0, 60),
      address: String(address).slice(0, 300),
      items: validatedItems,
      total,
      status: 'قيد المراجعة'
    };
    insertOrder(order);
    return sendJSON(res, 200, { ok: true, orderId: order.id, total });
  }

  /* ============ واجهات المشرف ============ */
  const adminCode = (parsed.query.code || req.headers['x-admin-code'] || '').trim();
  const isAdmin = adminCode === ADMIN_CODE;

  if (pathname === '/api/admin/orders' && req.method === 'GET') {
    if (!isAdmin) return sendJSON(res, 401, { error: 'رمز الدخول غير صحيح' });
    return sendJSON(res, 200, readOrders());
  }

  if (pathname === '/api/admin/products' && req.method === 'POST') {
    if (!isAdmin) return sendJSON(res, 401, { error: 'رمز الدخول غير صحيح' });

    let body;
    try { body = await readBody(req); }
    catch { return sendJSON(res, 400, { error: 'بيانات غير صالحة' }); }

    const { name, family, notes, size, description, price, image } = body;
    if (!name || !family || !notes || !size || !description || !price) {
      return sendJSON(res, 400, { error: 'الرجاء إكمال جميع الحقول' });
    }
    const priceNum = parseInt(price, 10);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      return sendJSON(res, 400, { error: 'السعر غير صالح' });
    }

    let imagePath = null;
    try { imagePath = saveImage(image); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }

    const id = 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const product = {
      id,
      name: String(name).slice(0, 80),
      family: String(family).slice(0, 40),
      notes: String(notes).slice(0, 150),
      size: String(size).slice(0, 30),
      description: String(description).slice(0, 500),
      price: priceNum,
      image: imagePath,
      created_at: new Date().toISOString()
    };
    insertProduct(product);
    return sendJSON(res, 200, { ok: true, product });
  }

  if (pathname.startsWith('/api/admin/products/') && req.method === 'DELETE') {
    if (!isAdmin) return sendJSON(res, 401, { error: 'رمز الدخول غير صحيح' });
    const id = decodeURIComponent(pathname.split('/').pop());
    const p = getProduct(id);
    if (!p) return sendJSON(res, 404, { error: 'المنتج غير موجود' });
    deleteImage(p.image);
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    return sendJSON(res, 200, { ok: true });
  }

  if (req.method === 'GET') return serveStatic(res, pathname);

  res.writeHead(404);
  res.end('غير موجود');
});

server.listen(PORT, () => {
  console.log(`متجر العطور يعمل على المنفذ ${PORT}`);
});
