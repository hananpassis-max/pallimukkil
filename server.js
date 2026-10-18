require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
let pool;

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: "cleaning.sid",
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 1000 * 60 * 60 * 8 }
}));
app.use(express.static(path.join(__dirname, "public")));

const catalog = [
  { id: "bathroom-1", category: "Bathroom", name: "Intense Bathroom Cleaning (1 Bathroom)", price: 649 },
  { id: "bathroom-2", category: "Bathroom", name: "Intense Bathroom Cleaning (2 Bathrooms)", price: 1199 },
  { id: "bathroom-3", category: "Bathroom", name: "Intense Bathroom Cleaning (3 Bathrooms)", price: 1699 },
  { id: "move-in", category: "Bathroom", name: "Move-in Bathroom Cleaning", price: 749 },
  { id: "kitchen-full", category: "Kitchen", name: "Full Kitchen Cleaning", price: 1899 },
  { id: "chimney", category: "Kitchen", name: "Chimney Cleaning", price: 799 },
  { id: "chimney-stove", category: "Kitchen", name: "Chimney & Stove Combo", price: 999 },
  { id: "fridge", category: "Kitchen", name: "Fridge Cleaning", price: 499 },
  { id: "fan", category: "Mini Services", name: "Ceiling Fan Cleaning", price: 149 },
  { id: "sink", category: "Mini Services", name: "Kitchen Sink Cleaning", price: 149 },
  { id: "gas-stove", category: "Mini Services", name: "Gas Stove Cleaning", price: 299 },
  { id: "appliance-pack", category: "Appliances", name: "Full Appliance Package", price: 1499 },
  { id: "microwave", category: "Appliances", name: "Microwave Cleaning", price: 299 },
  { id: "otg", category: "Appliances", name: "OTG Cleaning", price: 499 }
];

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const run = (sql, params = []) => pool.execute(sql, params);
const one = async (sql, params = []) => (await run(sql, params))[0][0] || null;
const all = async (sql, params = []) => (await run(sql, params))[0];

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Please log in first." });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: "Please log in first." });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: "You do not have permission for this action." });
    next();
  };
}
const publicUser = user => ({ id: user.id, name: user.name, username: user.username, role: user.role });

async function initDb() {
  const cfg = {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true
  };
  const connection = await mysql.createConnection(cfg);
  const dbName = (process.env.DB_NAME || "brittaan").replace(/[^a-zA-Z0-9_]/g, "");
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await connection.end();
  pool = mysql.createPool({ ...cfg, database: dbName, decimalNumbers: true, multipleStatements: true });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      username VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin','staff','customer') NOT NULL DEFAULT 'customer',
      phone VARCHAR(30) DEFAULT '',
      address VARCHAR(255) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS services (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      category VARCHAR(80) NOT NULL DEFAULT 'General',
      description VARCHAR(500) DEFAULT '',
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id INT NOT NULL,
      service_id INT NULL,
      service_name VARCHAR(150) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      booking_date DATE NOT NULL,
      booking_time VARCHAR(30) NOT NULL,
      address VARCHAR(255) NOT NULL,
      notes VARCHAR(500) DEFAULT '',
      status ENUM('Pending','Confirmed','In progress','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES users(id),
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_id INT NOT NULL,
      staff_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_assignment (booking_id, staff_id),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_id INT NOT NULL UNIQUE,
      customer_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      status ENUM('Unpaid','Paid') NOT NULL DEFAULT 'Unpaid',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const admin = await one("SELECT id FROM users WHERE username = ?", ["admin"]);
  if (!admin) {
    const hash = await bcrypt.hash("admin123", 12);
    await run("INSERT INTO users (name, username, password_hash, role, phone, address) VALUES (?, ?, ?, 'admin', '', '')",
      ["Administrator", "admin", hash]);
  }
  const count = await one("SELECT COUNT(*) AS count FROM services");
  if (Number(count.count) === 0) {
    for (const s of catalog) {
      await run("INSERT INTO services (name, category, description, price, active) VALUES (?, ?, ?, ?, 1)",
        [s.name, s.category, "Professional home cleaning by our trained team.", s.price]);
    }
  }
}

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.get("/api/me", (req, res) => res.json({ user: req.session.user || null }));
app.get("/api/services", asyncRoute(async (req, res) => {
  const rows = await all("SELECT id, name, category, description, price FROM services WHERE active=1 ORDER BY category, name");
  res.json({ services: rows });
}));

app.post("/api/register", asyncRoute(async (req, res) => {
  const { name, username, password, phone = "", address = "" } = req.body;
  if (!name?.trim() || !username?.trim() || !password || password.length < 8)
    return res.status(400).json({ error: "Enter your name, username, and a password of at least 8 characters." });
  const hash = await bcrypt.hash(password, 12);
  try {
    const [result] = await run("INSERT INTO users (name, username, password_hash, role, phone, address) VALUES (?, ?, ?, 'customer', ?, ?)",
      [name.trim(), username.trim().toLowerCase(), hash, phone.trim(), address.trim()]);
    req.session.user = { id: result.insertId, name: name.trim(), username: username.trim().toLowerCase(), role: "customer" };
    res.status(201).json({ user: req.session.user });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That username is already registered." });
    throw e;
  }
}));

app.post("/api/login", asyncRoute(async (req, res) => {
  const { username, password } = req.body;
  const user = await one("SELECT * FROM users WHERE username = ?", [String(username || "").trim().toLowerCase()]);
  if (!user || !(await bcrypt.compare(String(password || ""), user.password_hash)))
    return res.status(401).json({ error: "Incorrect username or password." });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start a session." });
    req.session.user = publicUser(user);
    res.json({ user: req.session.user });
  });
}));
app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get("/api/customer/bookings", requireRole("customer"), asyncRoute(async (req, res) => {
  res.json({ bookings: await all(
    `SELECT b.*, s.category, bi.id AS bill_id, bi.status AS bill_status
     FROM bookings b LEFT JOIN services s ON s.id=b.service_id
     LEFT JOIN bills bi ON bi.booking_id=b.id
     WHERE b.customer_id=? ORDER BY b.created_at DESC`, [req.session.user.id]) });
}));
app.post("/api/customer/bookings", requireRole("customer"), asyncRoute(async (req, res) => {
  const { serviceId, bookingDate, bookingTime, address, notes = "" } = req.body;
  if (!serviceId || !bookingDate || !bookingTime || !address?.trim())
    return res.status(400).json({ error: "Choose a service, date, time, and address." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || bookingDate < new Date().toISOString().slice(0, 10))
    return res.status(400).json({ error: "Choose a valid date that is not in the past." });
  const service = await one("SELECT * FROM services WHERE id=? AND active=1", [serviceId]);
  if (!service) return res.status(404).json({ error: "Service not found." });
  const [result] = await run(
    "INSERT INTO bookings (customer_id, service_id, service_name, amount, booking_date, booking_time, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [req.session.user.id, service.id, service.name, service.price, bookingDate, bookingTime, address.trim(), String(notes).slice(0, 500)]);
  res.status(201).json({ id: result.insertId, message: "Booking submitted successfully." });
}));
app.patch("/api/customer/bookings/:id/cancel", requireRole("customer"), asyncRoute(async (req, res) => {
  const [result] = await run("UPDATE bookings SET status='Cancelled' WHERE id=? AND customer_id=? AND status='Pending'",
    [req.params.id, req.session.user.id]);
  if (!result.affectedRows) return res.status(400).json({ error: "Only pending bookings can be cancelled." });
  res.json({ ok: true });
}));

app.get("/api/admin/overview", requireRole("admin"), asyncRoute(async (req, res) => {
  const [customers, staff, bookings, revenue] = await Promise.all([
    one("SELECT COUNT(*) AS n FROM users WHERE role='customer'"),
    one("SELECT COUNT(*) AS n FROM users WHERE role='staff'"),
    one("SELECT COUNT(*) AS n FROM bookings"),
    one("SELECT COALESCE(SUM(amount),0) AS n FROM bills WHERE status='Paid'")
  ]);
  res.json({ customers: customers.n, staff: staff.n, bookings: bookings.n, revenue: revenue.n });
}));

app.get("/api/admin/users", requireRole("admin"), asyncRoute(async (req, res) => {
  const role = ["customer", "staff"].includes(req.query.role) ? req.query.role : "customer";
  res.json({ users: await all("SELECT id, name, username, role, phone, address, created_at FROM users WHERE role=? ORDER BY id DESC", [role]) });
}));
app.post("/api/admin/staff", requireRole("admin"), asyncRoute(async (req, res) => {
  const { name, username, password, phone = "", address = "" } = req.body;
  if (!name?.trim() || !username?.trim() || !password || password.length < 8)
    return res.status(400).json({ error: "Name, username and a password of at least 8 characters are required." });
  try {
    const hash = await bcrypt.hash(password, 12);
    const [r] = await run("INSERT INTO users (name, username, password_hash, role, phone, address) VALUES (?, ?, ?, 'staff', ?, ?)",
      [name.trim(), username.trim().toLowerCase(), hash, phone.trim(), address.trim()]);
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Username already exists." });
    throw e;
  }
}));
app.delete("/api/admin/users/:id", requireRole("admin"), asyncRoute(async (req, res) => {
  const [r] = await run("DELETE FROM users WHERE id=? AND role IN ('customer','staff')", [req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: "User not found." });
  res.json({ ok: true });
}));

app.get("/api/admin/services", requireRole("admin"), asyncRoute(async (req, res) => {
  res.json({ services: await all("SELECT * FROM services ORDER BY id DESC") });
}));
app.post("/api/admin/services", requireRole("admin"), asyncRoute(async (req, res) => {
  const { name, category, description = "", price } = req.body;
  const amount = Number(price);
  if (!name?.trim() || !category?.trim() || !Number.isFinite(amount) || amount < 0)
    return res.status(400).json({ error: "Enter a service name, category, and valid price." });
  const [r] = await run("INSERT INTO services (name, category, description, price) VALUES (?, ?, ?, ?)",
    [name.trim(), category.trim(), String(description).slice(0, 500), amount]);
  res.status(201).json({ id: r.insertId });
}));
app.patch("/api/admin/services/:id", requireRole("admin"), asyncRoute(async (req, res) => {
  const { name, category, description = "", price, active } = req.body;
  const amount = Number(price);
  if (!name?.trim() || !category?.trim() || !Number.isFinite(amount) || amount < 0)
    return res.status(400).json({ error: "Enter a service name, category, and valid price." });
  const [r] = await run("UPDATE services SET name=?, category=?, description=?, price=?, active=? WHERE id=?",
    [name.trim(), category.trim(), String(description).slice(0, 500), amount, active ? 1 : 0, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: "Service not found or unchanged." });
  res.json({ ok: true });
}));
app.delete("/api/admin/services/:id", requireRole("admin"), asyncRoute(async (req, res) => {
  const [r] = await run("UPDATE services SET active=0 WHERE id=?", [req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: "Service not found." });
  res.json({ ok: true });
}));

app.get("/api/admin/bookings", requireRole("admin"), asyncRoute(async (req, res) => {
  res.json({ bookings: await all(
    `SELECT b.*, u.name AS customer_name, u.phone AS customer_phone,
      (SELECT GROUP_CONCAT(st.name SEPARATOR ', ') FROM assignments a JOIN users st ON st.id=a.staff_id WHERE a.booking_id=b.id) AS assigned_staff,
      bi.id AS bill_id, bi.status AS bill_status
     FROM bookings b JOIN users u ON u.id=b.customer_id
     LEFT JOIN bills bi ON bi.booking_id=b.id ORDER BY b.booking_date DESC, b.booking_time` ) });
}));
app.patch("/api/admin/bookings/:id/status", requireRole("admin"), asyncRoute(async (req, res) => {
  const allowed = ["Pending", "Confirmed", "In progress", "Completed", "Cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid booking status." });
  const [r] = await run("UPDATE bookings SET status=? WHERE id=?", [req.body.status, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: "Booking not found or unchanged." });
  res.json({ ok: true });
}));
app.post("/api/admin/assignments", requireRole("admin"), asyncRoute(async (req, res) => {
  const bookingId = Number(req.body.bookingId), staffId = Number(req.body.staffId);
  const booking = await one("SELECT * FROM bookings WHERE id=?", [bookingId]);
  const staff = await one("SELECT id FROM users WHERE id=? AND role='staff'", [staffId]);
  if (!booking || !staff) return res.status(400).json({ error: "Choose a valid booking and staff member." });
  const conflict = await one(
    `SELECT a.id FROM assignments a JOIN bookings b ON b.id=a.booking_id
     WHERE a.staff_id=? AND b.booking_date=? AND b.booking_time=? AND b.status <> 'Cancelled'`,
    [staffId, booking.booking_date, booking.booking_time]);
  if (conflict) return res.status(409).json({ error: "This staff member already has a booking at that date and time." });
  try {
    await run("INSERT INTO assignments (booking_id, staff_id) VALUES (?, ?)", [bookingId, staffId]);
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "This staff member is already assigned." });
    throw e;
  }
}));
app.get("/api/staff/jobs", requireRole("staff"), asyncRoute(async (req, res) => {
  res.json({ jobs: await all(
    `SELECT b.id, b.service_name, b.amount, b.booking_date, b.booking_time, b.address, b.notes, b.status,
      u.name AS customer_name, u.phone AS customer_phone
     FROM assignments a JOIN bookings b ON b.id=a.booking_id JOIN users u ON u.id=b.customer_id
     WHERE a.staff_id=? ORDER BY b.booking_date DESC, b.booking_time`, [req.session.user.id]) });
}));

app.post("/api/admin/bills", requireRole("admin"), asyncRoute(async (req, res) => {
  const bookingId = Number(req.body.bookingId);
  const booking = await one("SELECT id, customer_id, amount, status FROM bookings WHERE id=?", [bookingId]);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  if (booking.status !== "Completed") return res.status(400).json({ error: "Mark the booking completed before creating a bill." });
  try {
    const [r] = await run("INSERT INTO bills (booking_id, customer_id, amount) VALUES (?, ?, ?)",
      [booking.id, booking.customer_id, booking.amount]);
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "A bill already exists for this booking." });
    throw e;
  }
}));
app.get("/api/admin/bills", requireRole("admin"), asyncRoute(async (req, res) => {
  res.json({ bills: await all(
    `SELECT bi.*, b.service_name, b.booking_date, u.name AS customer_name
     FROM bills bi JOIN bookings b ON b.id=bi.booking_id JOIN users u ON u.id=bi.customer_id
     ORDER BY bi.created_at DESC`) });
}));
app.patch("/api/admin/bills/:id", requireRole("admin"), asyncRoute(async (req, res) => {
  if (!["Paid", "Unpaid"].includes(req.body.status)) return res.status(400).json({ error: "Invalid bill status." });
  const [r] = await run("UPDATE bills SET status=? WHERE id=?", [req.body.status, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: "Bill not found or unchanged." });
  res.json({ ok: true });
}));

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Something went wrong on the server. Check the server terminal for details." });
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`House Cleaning website running at http://localhost:${PORT}`));
}).catch(err => {
  console.error("Database startup failed:", err.message);
  process.exit(1);
});