const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
let currentUser = null;
let allServices = [];
let toastTimer;

function toast(message, error = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3300);
}
async function api(url, options = {}) {
  const opts = { credentials: "same-origin", ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } };
  const response = await fetch(url, opts);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
const dateText = value => value ? new Date(String(value).slice(0,10) + "T00:00:00").toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : "—";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const statusPill = value => `<span class="pill ${String(value).toLowerCase().replace(/\s+/g,"-")}">${esc(value)}</span>`;
const serviceIcons = { Bathroom:"♧", Kitchen:"⌂", "Mini Services":"✧", Appliances:"▣", General:"✳" };

function openModal(content) {
  $("#modal-content").innerHTML = content;
  $("#modal-backdrop").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal() {
  $("#modal-backdrop").hidden = true;
  document.body.style.overflow = "";
}
$("#modal-close").addEventListener("click", closeModal);
$("#modal-backdrop").addEventListener("click", e => { if (e.target.id === "modal-backdrop") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
$("#menu-toggle").addEventListener("click", () => $(".top-nav").classList.toggle("open"));
$("#year").textContent = new Date().getFullYear();

function loginModal() {
  openModal(`<h2 id="modal-title">Welcome back.</h2><p class="modal-intro">Log in to manage your home-care experience.</p>
    <form id="login-form"><div class="field"><label for="login-user">Username</label><input id="login-user" name="username" autocomplete="username" required></div>
    <div class="field"><label for="login-password">Password</label><input id="login-password" name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn btn-primary" type="submit">Log in <span>→</span></button></form>
    <div class="role-note">Admin demo login: <b>admin</b> / <b>admin123</b>. Customers can create an account below.</div>
    <p class="form-switch">New to Britta? <button class="link-button" id="show-register">Create an account</button></p>`);
  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try { const data = await api("/api/login", { method:"POST", body:JSON.stringify(form) }); currentUser = data.user; closeModal(); await routeUser(); toast(`Welcome, ${currentUser.name}!`); }
    catch (err) { toast(err.message, true); }
  });
  $("#show-register").addEventListener("click", registerModal);
}
function registerModal() {
  openModal(`<h2 id="modal-title">Make yourself at home.</h2><p class="modal-intro">Create a customer account to book and track cleaning appointments.</p>
  <form id="register-form"><div class="field"><label>Full name</label><input name="name" required maxlength="100"></div>
  <div class="form-grid"><div class="field"><label>Username</label><input name="username" required autocomplete="username"></div><div class="field"><label>Phone</label><input name="phone" type="tel"></div></div>
  <div class="field"><label>Password (8+ characters)</label><input name="password" type="password" required minlength="8" autocomplete="new-password"></div>
  <div class="field"><label>Home address</label><textarea name="address" required></textarea></div>
  <button class="btn btn-primary" type="submit">Create account <span>→</span></button></form>
  <p class="form-switch">Already have an account? <button class="link-button" id="show-login">Log in</button></p>`);
  $("#register-form").addEventListener("submit", async e => {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try { const data = await api("/api/register", { method:"POST", body:JSON.stringify(form) }); currentUser = data.user; closeModal(); await routeUser(); toast("Your account is ready."); }
    catch (err) { toast(err.message, true); }
  });
  $("#show-login").addEventListener("click", loginModal);
}
async function bookModal(serviceId = "") {
  if (!currentUser) { loginModal(); toast("Log in or create a customer account to book."); return; }
  if (currentUser.role !== "customer") { toast("Bookings are made through a customer account.", true); return; }
  if (!allServices.length) await loadServices();
  const selected = Number(serviceId);
  openModal(`<h2 id="modal-title">Book your clean.</h2><p class="modal-intro">Choose a service and a time that works for you.</p>
  <form id="booking-form"><div class="field"><label>Cleaning service</label><select name="serviceId" required>${allServices.map(s=>`<option value="${s.id}" ${s.id===selected?"selected":""}>${esc(s.name)} — ${money(s.price)}</option>`).join("")}</select></div>
  <div class="form-grid"><div class="field"><label>Date</label><input name="bookingDate" type="date" min="${new Date().toISOString().slice(0,10)}" required></div><div class="field"><label>Preferred time</label><select name="bookingTime" required><option value="">Choose time</option><option>9:00 AM</option><option>11:00 AM</option><option>1:00 PM</option><option>3:00 PM</option><option>5:00 PM</option></select></div></div>
  <div class="field"><label>Cleaning address</label><textarea name="address" required>${esc(currentUser.address || "")}</textarea></div>
  <div class="field"><label>Notes (optional)</label><textarea name="notes" placeholder="Anything our team should know?"></textarea></div>
  <button class="btn btn-primary" type="submit">Request booking <span>→</span></button></form>`);
  $("#booking-form").addEventListener("submit", async e => {
    e.preventDefault();
    try { await api("/api/customer/bookings", { method:"POST", body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))) }); closeModal(); await customerDashboard("bookings"); toast("Booking requested! You can track it in your dashboard."); }
    catch (err) { toast(err.message, true); }
  });
}
function renderServices(filter = "All") {
  const list = allServices.filter(s => filter === "All" || s.category === filter);
  $("#service-grid").innerHTML = list.length ? list.map(s=>`<article class="service-card"><div class="service-symbol">${serviceIcons[s.category] || "✳"}</div><div class="service-category">${esc(s.category)}</div><h3>${esc(s.name)}</h3><p>${esc(s.description || "Thoughtful care for a fresher home.")}</p><div class="service-foot"><span class="price">${money(s.price)} <small>/ visit</small></span><button class="book-mini" data-book-service="${s.id}" aria-label="Book ${esc(s.name)}">Book +</button></div></article>`).join("") : `<div class="loading-card">No services in this category yet.</div>`;
}
async function loadServices() {
  const data = await api("/api/services");
  allServices = data.services;
  renderServices();
}
$("#service-filters").addEventListener("click", e => {
  const button = e.target.closest("[data-category]");
  if (!button) return;
  $$(".filter").forEach(b=>b.classList.toggle("active", b===button));
  renderServices(button.dataset.category);
});
document.addEventListener("click", e => {
  const b = e.target.closest("[data-book-service]");
  if (b) bookModal(b.dataset.bookService);
});
["login-open"].forEach(id=>$("#"+id).addEventListener("click", loginModal));
["book-top","hero-book","why-book","cta-book"].forEach(id=>$("#"+id).addEventListener("click",()=>bookModal()));
$("#app").addEventListener("click", e => {
  const anchor = e.target.closest('a[href^="#"]');
  if (anchor) $(".top-nav").classList.remove("open");
});

async function logout() {
  try { await api("/api/logout", { method:"POST" }); } catch {}
  currentUser = null;
  window.location.reload();
}
function showDashboard() {
  document.querySelectorAll(".hero,.services-section,.how-section,.why-section,.cta-section").forEach(el=>el.style.display="none");
  $("#app").innerHTML = `<section class="dashboard-shell"><aside class="dash-sidebar"><h3>✳ ${esc(currentUser.name)}</h3><div class="dash-nav" id="dash-nav"></div></aside><div class="dash-main" id="dash-main"></div></section>`;
}
function nav(items, active) {
  $("#dash-nav").innerHTML = items.map(([id,label])=>`<button class="${id===active?"active":""}" data-tab="${id}">${label}</button>`).join("") + `<button id="logout-button">↪ Log out</button>`;
  $$("#dash-nav [data-tab]").forEach(b=>b.addEventListener("click",()=>dashboardTab(b.dataset.tab)));
  $("#logout-button").addEventListener("click",logout);
}
function table(headers, rows) {
  if (!rows.length) return `<div class="empty-state">Nothing here yet. New records will appear here.</div>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${c ?? "—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function heading(title, subtitle, action = "") {
  return `<div class="dash-head"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}
function panel(title, content, action = "") {
  return `<section class="panel"><div class="panel-head"><h3>${title}</h3>${action}</div>${content}</section>`;
}
async function routeUser() {
  if (!currentUser) {
    $("#app").innerHTML = document.querySelector("main").innerHTML;
    // Re-bind landing page actions after replacing its content.
    bindLandingActions();
    await loadServices();
    return;
  }
  if (currentUser.role === "admin") return adminDashboard("overview");
  if (currentUser.role === "staff") return staffDashboard();
  return customerDashboard("bookings");
}
function bindLandingActions() {
  $("#service-filters")?.addEventListener("click", e => { const b=e.target.closest("[data-category]"); if(!b)return; $$(".filter").forEach(x=>x.classList.toggle("active",x===b));renderServices(b.dataset.category); });
  $("#app")?.addEventListener("click", e => { const b=e.target.closest("[data-book-service]"); if(b)bookModal(b.dataset.bookService); });
  ["book-top","hero-book","why-book","cta-book"].forEach(id=>$("#"+id)?.addEventListener("click",()=>bookModal()));
}
async function customerDashboard(tab = "bookings") {
  showDashboard();
  nav([["bookings","▦ My bookings"],["new","＋ Book a service"],["bills","▤ My bills"]], tab);
  if (tab === "new") {
    $("#dash-main").innerHTML = heading("Book a service","Choose a service and your preferred appointment.") + `<div class="panel"><div class="empty-state">Choose a service below to get started.</div><div class="service-grid" id="dash-service-grid"></div></div>`;
    $("#dash-service-grid").innerHTML = allServices.map(s=>`<article class="service-card"><div class="service-symbol">${serviceIcons[s.category]||"✳"}</div><div class="service-category">${esc(s.category)}</div><h3>${esc(s.name)}</h3><div class="service-foot"><span class="price">${money(s.price)}</span><button class="book-mini" data-dash-book="${s.id}">Choose</button></div></article>`).join("");
    $$("[data-dash-book]").forEach(b=>b.addEventListener("click",()=>bookModal(b.dataset.dashBook)));
    return;
  }
  if (tab === "bills") {
    const data = await api("/api/customer/bookings");
    const rows = data.bookings.filter(b=>b.bill_id).map(b=>[`#${b.bill_id}`,esc(b.service_name),money(b.amount),dateText(b.booking_date),statusPill(b.bill_status)]);
    $("#dash-main").innerHTML = heading("My bills","Your cleaning service billing history.") + panel("Billing history",table(["Bill","Service","Amount","Booking date","Status"],rows));
    return;
  }
  const data = await api("/api/customer/bookings");
  const rows = data.bookings.map(b=>[`#${b.id}`,esc(b.service_name),dateText(b.booking_date),esc(b.booking_time),statusPill(b.status),b.bill_id?statusPill(b.bill_status):'<span class="muted">Not issued</span>',b.status==="Pending"?`<button class="small-btn danger" data-cancel="${b.id}">Cancel</button>`:"—"]);
  $("#dash-main").innerHTML = heading("My bookings","Hello, "+esc(currentUser.name)+". Here's what's happening with your home.") +
    `<div class="dashboard-banner"><h2>Your home-care, all in one place.</h2><p>Track appointment updates, check your bills, or book your next clean whenever you need it.</p></div>` +
    panel("Appointment history",table(["Booking","Service","Date","Time","Status","Bill","Action"],rows),`<button class="small-btn" id="new-booking">＋ New booking</button>`);
  $("#new-booking").addEventListener("click",()=>customerDashboard("new"));
  $$("[data-cancel]").forEach(b=>b.addEventListener("click",async()=>{try{await api(`/api/customer/bookings/${b.dataset.cancel}/cancel`,{method:"PATCH"});toast("Booking cancelled.");customerDashboard("bookings")}catch(e){toast(e.message,true)}}));
}
async function staffDashboard() {
  showDashboard();
  nav([["jobs","▦ My assigned jobs"]],"jobs");
  const data = await api("/api/staff/jobs");
  const rows = data.jobs.map(j=>[`#${j.id}`,esc(j.service_name),dateText(j.booking_date),esc(j.booking_time),esc(j.customer_name),esc(j.customer_phone),esc(j.address),statusPill(j.status)]);
  $("#dash-main").innerHTML = heading("My assigned jobs","Your upcoming home-care visits, all in one place.") + `<div class="dashboard-banner"><h2>Welcome, ${esc(currentUser.name)}.</h2><p>Check your assigned appointments below. Contact the customer using the details shown if you need clarification.</p></div>` + panel("Job schedule",table(["Booking","Service","Date","Time","Customer","Phone","Address","Status"],rows));
}
async function adminDashboard(tab = "overview") {
  showDashboard();
  const items=[["overview","▦ Overview"],["bookings","◷ Bookings"],["customers","♙ Customers"],["staff","♧ Staff"],["services","✳ Services"],["bills","▤ Bills"]];
  nav(items,tab);
  if(tab==="overview"){
    const d=await api("/api/admin/overview");
    $("#dash-main").innerHTML=heading("Overview","A clear view of your home-cleaning business.")+`<div class="stat-grid"><div class="stat-card"><span>Total customers</span><strong>${d.customers}</strong></div><div class="stat-card"><span>Staff members</span><strong>${d.staff}</strong></div><div class="stat-card"><span>Total bookings</span><strong>${d.bookings}</strong></div><div class="stat-card"><span>Paid revenue</span><strong>${money(d.revenue)}</strong></div></div>`+panel("Quick actions",`<div class="inline-form"><button class="btn btn-primary" id="quick-bookings">Manage bookings →</button><button class="btn btn-quiet" id="quick-staff">Add staff →</button><button class="btn btn-quiet" id="quick-services">Manage services →</button></div>`)+panel("Getting started",`<p class="muted">Use Bookings to confirm requests, assign staff, mark completed visits, and create bills. Staff members can log in to see their own job assignments.</p>`);
    $("#quick-bookings").onclick=()=>adminDashboard("bookings");$("#quick-staff").onclick=()=>adminDashboard("staff");$("#quick-services").onclick=()=>adminDashboard("services");
  } else if(tab==="customers"||tab==="staff"){
    const role=tab==="staff"?"staff":"customer"; const data=await api(`/api/admin/users?role=${role}`);
    const rows=data.users.map(u=>[`#${u.id}`,esc(u.name),esc(u.username),esc(u.phone),esc(u.address),`<button class="small-btn danger" data-delete-user="${u.id}">Delete</button>`]);
    let addForm="";
    if(tab==="staff") addForm=panel("Add a staff member",`<form id="staff-form" class="inline-form"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Username</label><input name="username" required></div><div class="field"><label>Temporary password (8+ chars)</label><input name="password" type="password" minlength="8" required></div><div class="field"><label>Phone</label><input name="phone"></div><div class="field"><label>Address</label><input name="address"></div><button class="btn btn-primary" type="submit">Add staff +</button></form>`);
    $("#dash-main").innerHTML=heading(tab==="staff"?"Staff management":"Customers",tab==="staff"?"Create staff logins and manage your team.":"Customer accounts registered on the website.")+addForm+panel(tab==="staff"?"Team members":"Customer directory",table(["ID","Name","Username","Phone","Address","Action"],rows));
    $("#staff-form")?.addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/admin/staff",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});toast("Staff member added.");adminDashboard("staff")}catch(err){toast(err.message,true)}});
    $$("[data-delete-user]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("Delete this account? Related records may also be removed."))return;try{await api(`/api/admin/users/${b.dataset.deleteUser}`,{method:"DELETE"});toast("Account deleted.");adminDashboard(tab)}catch(e){toast(e.message,true)}}));
  } else if(tab==="services"){
    const data=await api("/api/admin/services");
    const rows=data.services.map(s=>[`#${s.id}`,esc(s.name),esc(s.category),money(s.price),s.active?statusPill("Active"):statusPill("Inactive"),`<div class="table-actions"><button class="small-btn" data-edit-service="${s.id}">Edit</button>${s.active?`<button class="small-btn danger" data-hide-service="${s.id}">Deactivate</button>`:""}</div>`]);
    $("#dash-main").innerHTML=heading("Cleaning services","Update the services and prices customers see.")+
      panel("Add a service",`<form id="service-form" class="inline-form"><div class="field"><label>Service name</label><input name="name" required></div><div class="field"><label>Category</label><select name="category"><option>Bathroom</option><option>Kitchen</option><option>Mini Services</option><option>Appliances</option><option>General</option></select></div><div class="field"><label>Price (₹)</label><input name="price" type="number" min="0" step="1" required></div><div class="field"><label>Description</label><input name="description"></div><button class="btn btn-primary" type="submit">Add service +</button></form>`)+panel("Service catalogue",table(["ID","Service","Category","Price","Status","Action"],rows));
    $("#service-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/admin/services",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});toast("Service added.");await loadServices();adminDashboard("services")}catch(err){toast(err.message,true)}});
    $$("[data-hide-service]").forEach(b=>b.addEventListener("click",async()=>{try{await api(`/api/admin/services/${b.dataset.hideService}`,{method:"DELETE"});toast("Service deactivated.");await loadServices();adminDashboard("services")}catch(e){toast(e.message,true)}}));
    $$("[data-edit-service]").forEach(b=>b.addEventListener("click",()=>{const s=data.services.find(x=>x.id===Number(b.dataset.editService));openModal(`<h2 id="modal-title">Edit service</h2><p class="modal-intro">Update the details and price for this service.</p><form id="edit-service-form"><div class="field"><label>Name</label><input name="name" value="${esc(s.name)}" required></div><div class="field"><label>Category</label><input name="category" value="${esc(s.category)}" required></div><div class="field"><label>Price (₹)</label><input name="price" type="number" min="0" step="1" value="${s.price}" required></div><div class="field"><label>Description</label><textarea name="description">${esc(s.description||"")}</textarea></div><label class="field"><span>Available for booking</span><select name="active"><option value="1" ${s.active?"selected":""}>Active</option><option value="0" ${!s.active?"selected":""}>Inactive</option></select></label><button class="btn btn-primary">Save changes</button></form>`);$("#edit-service-form").addEventListener("submit",async e=>{e.preventDefault();const form=Object.fromEntries(new FormData(e.currentTarget));form.active=form.active==="1";try{await api(`/api/admin/services/${s.id}`,{method:"PATCH",body:JSON.stringify(form)});closeModal();toast("Service updated.");await loadServices();adminDashboard("services")}catch(err){toast(err.message,true)}})}));
  } else if(tab==="bookings"){
    const [d,staffData]=await Promise.all([api("/api/admin/bookings"),api("/api/admin/users?role=staff")]);
    const rows=d.bookings.map(b=>[`#${b.id}`,esc(b.customer_name),esc(b.service_name),dateText(b.booking_date),esc(b.booking_time),money(b.amount),statusPill(b.status),esc(b.assigned_staff||"Unassigned"),`<button class="small-btn" data-booking-details="${b.id}">Manage</button>`]);
    const bookingOptions=d.bookings.filter(b=>b.status!=="Cancelled").map(b=>`<option value="${b.id}">#${b.id} · ${esc(b.customer_name)} — ${esc(b.service_name)}</option>`).join("");
    const staffOptions=staffData.users.map(s=>`<option value="${s.id}">${esc(s.name)} (#${s.id})</option>`).join("");
    $("#dash-main").innerHTML=heading("Bookings & assignments","Confirm requests, coordinate your team, and complete each visit.")+
      panel("Assign staff",`<form id="assign-form" class="inline-form"><div class="field"><label>Booking</label><select name="bookingId" required>${bookingOptions}</select></div><div class="field"><label>Staff member</label><select name="staffId" required>${staffOptions}</select></div><button class="btn btn-primary" type="submit">Assign staff</button></form>`) +
      panel("All appointments",table(["Booking","Customer","Service","Date","Time","Price","Status","Assigned staff","Action"],rows));
    $("#assign-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/admin/assignments",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});toast("Staff assigned.");adminDashboard("bookings")}catch(err){toast(err.message,true)}});
    $$("[data-booking-details]").forEach(btn=>btn.addEventListener("click",()=>{const b=d.bookings.find(x=>x.id===Number(btn.dataset.bookingDetails));openModal(`<h2 id="modal-title">Booking #${b.id}</h2><p class="modal-intro">${esc(b.customer_name)} · ${esc(b.service_name)} · ${dateText(b.booking_date)} at ${esc(b.booking_time)}</p><div class="role-note"><b>Address:</b> ${esc(b.address)}<br><b>Phone:</b> ${esc(b.customer_phone||"Not provided")}<br><b>Notes:</b> ${esc(b.notes||"None")}</div><form id="status-form"><div class="field"><label>Booking status</label><select name="status">${["Pending","Confirmed","In progress","Completed","Cancelled"].map(s=>`<option ${s===b.status?"selected":""}>${s}</option>`).join("")}</select></div><button class="btn btn-primary">Update status</button></form>${b.bill_id?`<div class="role-note">Bill #${b.bill_id} · ${statusPill(b.bill_status)}</div>`:b.status==="Completed"?`<button class="btn btn-primary" id="create-bill" style="margin-top:12px">Create bill</button>`:""}`);
      $("#status-form").addEventListener("submit",async e=>{e.preventDefault();try{await api(`/api/admin/bookings/${b.id}/status`,{method:"PATCH",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});closeModal();toast("Booking status updated.");adminDashboard("bookings")}catch(err){toast(err.message,true)}});
      $("#create-bill")?.addEventListener("click",async()=>{try{await api("/api/admin/bills",{method:"POST",body:JSON.stringify({bookingId:b.id})});closeModal();toast("Bill created.");adminDashboard("bills")}catch(err){toast(err.message,true)}});
    }));
  } else if(tab==="bills"){
    const d=await api("/api/admin/bills");
    const rows=d.bills.map(b=>[`#${b.id}`,`#${b.booking_id}`,esc(b.customer_name),esc(b.service_name),dateText(b.booking_date),money(b.amount),statusPill(b.status),`<button class="small-btn" data-bill-status="${b.id}" data-status="${b.status}">${b.status==="Paid"?"Mark unpaid":"Mark paid"}</button>`]);
    $("#dash-main").innerHTML=heading("Billing","Create bills from completed bookings and track payment status.")+panel("Bills & payment status",table(["Bill","Booking","Customer","Service","Date","Amount","Status","Action"],rows));
    $$("[data-bill-status]").forEach(b=>b.addEventListener("click",async()=>{try{await api(`/api/admin/bills/${b.dataset.billStatus}`,{method:"PATCH",body:JSON.stringify({status:b.dataset.status==="Paid"?"Unpaid":"Paid"})});toast("Bill status updated.");adminDashboard("bills")}catch(e){toast(e.message,true)}}));
  }
}
async function dashboardTab(tab) {
  try {
    if(currentUser.role==="admin") await adminDashboard(tab);
    else if(currentUser.role==="customer") await customerDashboard(tab);
    else await staffDashboard();
  } catch(e) { toast(e.message,true); }
}

async function init() {
  try {
    const data=await api("/api/me");currentUser=data.user;
    if(currentUser){await loadServices();await routeUser();}
    else await loadServices();
  } catch(e) {
    $("#service-grid").innerHTML='<div class="loading-card">Could not connect to the server. Make sure the Node.js server and MySQL are running.</div>';
    toast("Unable to connect to the server.",true);
  }
}
init();
