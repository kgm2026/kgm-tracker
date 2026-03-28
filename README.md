# KGM Constructions Tracker

A comprehensive construction project management and expense tracking application built with React.

## Features

- **Dashboard** - Financial overview with charts and KPIs
- **Material Purchases** - Track construction materials with categories, suppliers, and payment status
- **Contractors** - Manage contractor agreements, payments, and work status
- **Payment Log** - Record and track all payments
- **Supplier Balances** - View outstanding balances per supplier
- **Budget vs Actual** - Set project budgets and track spending
- **Ledgers** - Detailed ledger view for contractors and suppliers with PDF export
- **Dark/Light Theme** - Toggle between dark and light modes
- **Responsive Design** - Works on desktop, tablet, and mobile devices

## Tech Stack

- React 19
- Vite
- Supabase (Backend)
- Recharts (Charts)
- jsPDF (PDF Export)

## Getting Started

```bash
npm install
npm run dev
```

## Environment Variables

Create a `.env.local` file:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ADMIN_PASSWORD=your_admin_password            # Legacy mode only (client-side; not recommended for production)
VITE_ADMIN_EMAIL=admin@example.com                  # Recommended: enables Supabase Auth admin login (JWT used for RLS)
```

## Admin Login

Admin Login supports two modes:

1. **Recommended (Supabase Auth)**
   - Set `VITE_ADMIN_EMAIL`.
   - Create an admin user in Supabase Auth and configure **RLS policies** so only that user can `INSERT/UPDATE/DELETE` on:
     - `projects`
     - `material_purchases`
     - `contractors`
     - `payment_log`
   - The app signs in via Supabase using the typed password and sends the resulting JWT on REST calls.

2. **Legacy (client-side password)**
   - If `VITE_ADMIN_EMAIL` is not set, the app falls back to comparing the typed password against `VITE_ADMIN_PASSWORD`.
   - This is convenient for quick demos, but the password is embedded in the frontend bundle, so it should not be considered secure for production.

## Project Structure

```
src/
├── components/        # Reusable UI components
│   ├── Dashboard.jsx
│   ├── Materials.jsx
│   ├── Contractors.jsx
│   ├── PaymentLog.jsx
│   ├── SupplierBalances.jsx
│   ├── BudgetVsActual.jsx
│   ├── Ledgers.jsx
│   ├── Shared.jsx
│   └── ErrorBoundary.jsx
├── context/           # React Context providers
│   └── ThemeContext.jsx
├── utils/            # Utility functions and constants
│   └── constants.js
├── App.jsx           # Main application
└── main.jsx          # Entry point
```

## Database Schema

### Tables Required (Supabase)

- `projects` - Project information
- `material_purchases` - Material expense records
- `contractors` - Contractor information
- `payment_log` - All payment transactions

## Recent Improvements

- Added error boundaries for better error handling
- Improved responsive design for mobile devices
- Added accessibility features (ARIA labels, roles)
- Added Supabase-auth admin login mode (JWT / RLS-ready)
- Enhanced loading states and spinners
- Dashboard now uses theme context consistently

## License

Private - KGM Constructions
