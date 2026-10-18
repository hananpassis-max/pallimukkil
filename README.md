# House Cleaning Management System — Website

A full-stack JavaScript website using HTML, CSS, JavaScript, Node.js, Express, and MySQL.

## Included
- Responsive public home page and cleaning-service catalogue
- Customer registration/login and appointment booking
- Admin dashboard: customers, staff, services, bookings, assignments, bills
- Staff login and assigned-job view
- MySQL schema created automatically on server start
- Password hashing with bcrypt and role-protected API routes
- Parameterized SQL queries

## Requirements
- Node.js 18+
- MySQL Server running locally

## Setup
1. Extract this ZIP.
2. Open the project folder in a terminal.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env` and set your MySQL password and a strong `SESSION_SECRET`.
5. Make sure the MySQL user in `.env` can create a database, or create the database named `brittaan` yourself.
6. Start the website:
   ```bash
   npm start
   ```
7. Open http://localhost:3000

## First admin login
- Username: `admin`
- Password: `admin123`

Change this demo password before exposing the site to the internet. The initial admin account is created only if it does not already exist.

## Create a staff account
Log in as admin → Staff → Add staff. The staff member can then log in with the username/password you set.

## Important notes
- This is a starter application intended for local development and school projects.
- Configure HTTPS, a persistent session store, backups, rate limiting, and production secrets before public deployment.
- Payment processing is not included; bills are recorded, not charged online.
