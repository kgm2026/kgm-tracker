# KGM Homes Tracker

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
VITE_ADMIN_EMAIL=admin@example.com
```

## Login Setup

This app now assumes a simple single-user login flow:

1. Set `VITE_ADMIN_EMAIL` to the one email address you want to use.
2. Create that user in Supabase Auth.
3. Disable public signups in Supabase Auth so only your account can access the app.
4. Apply the latest SQL migrations so table/storage access requires authentication.
5. For edge functions, set `ADMIN_EMAIL` in Supabase function env vars if you want the AI endpoints to enforce the same email server-side.

After that, the UI starts on a sign-in screen and the app only uses authenticated Supabase requests.

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

## Security Notes

- The frontend uses the Supabase anon key, but data access is expected to be protected by RLS.
- File uploads now require an authenticated session.
- AI edge functions should be deployed with:
  - `GOOGLE_API_KEY` or `GEMINI_API_KEY` for `gemma-4-31b-it`
  - `MIMO_API_KEY` optional fallback
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `ADMIN_EMAIL` optional but recommended for single-user enforcement

## Vercel

This is a standard Vite app, so Vercel should use:

- Build command: `npm run build`
- Output directory: `dist`

Set these environment variables in Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ADMIN_EMAIL`

## License

Private - KGM Homes
