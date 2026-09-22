// خادم متجر العطور — بدون أي مكتبة خارجية، Node فقط
// هذا هو "البائع" الذي يستقبل الطلبات ويحفظها ويردّ على الزبون

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// المنفذ: المنصة (مثل Render) تحدده هي، ونحن نقرأه من البيئة
const PORT = process.env.PORT || 3000;

// رمز المشرف لعرض الطلبات - لا تكتبه هنا، ضعه في Environment Variables
const ADMIN_CODE = (process.env.ADMIN_CODE || 'admin123').trim();

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');

function readOrders() {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// كتالوج المنتجات - بيانات ثابتة، ليست سرًا
const PRODUCTS = [
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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) req.destroy(); // حماية من طلبات ضخمة
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // حماية بسيطة من الخروج خارج مجلد public
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('ممنوع');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404 - الصفحة غير موجودة</h1>');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // إرسال قائمة المنتجات
  if (pathname === '/api/products' && req.method === 'GET') {
    return sendJSON(res, 200, PRODUCTS);
  }

  // استقبال طلب جديد من الزبون
  if (pathname === '/api/orders' && req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendJSON(res, 400, { error: 'بيانات غير صالحة' });
    }

    const { name, phone, city, address, items } = body;

    if (!name || !phone || !city || !address || !Array.isArray(items) || items.length === 0) {
      return sendJSON(res, 400, { error: 'الرجاء إكمال جميع البيانات واختيار منتج واحد على الأقل' });
    }

    // نعيد حساب المجموع من الخادم، ولا نثق بما يرسله المتصفح
    let total = 0;
    const validatedItems = [];
    for (const item of items) {
      const product = PRODUCTS.find(p => p.id === item.id);
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

    const orders = readOrders();
    orders.push(order);
    writeOrders(orders);

    return sendJSON(res, 200, { ok: true, orderId: order.id, total });
  }

  // عرض الطلبات - للمشرف فقط، يحتاج الرمز الصحيح
  if (pathname === '/api/admin/orders' && req.method === 'GET') {
    const code = parsed.query.code || req.headers['x-admin-code'];
    if (code !== ADMIN_CODE) {
      return sendJSON(res, 401, { error: 'رمز الدخول غير صحيح' });
    }
    return sendJSON(res, 200, readOrders());
  }

  if (req.method === 'GET') {
    return serveStatic(req, res, pathname);
  }

  res.writeHead(404);
  res.end('غير موجود');
});

server.listen(PORT, () => {
  console.log(`متجر العطور يعمل على المنفذ ${PORT}`);
});
