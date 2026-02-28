# AI SaaS Chatbot Plugin

Production-ready AI chatbot with PDF-based RAG using Supabase and Groq.

## 🚀 Quick Start

### 1. Database Setup
Run [database.sql](database.sql) in your Supabase SQL Editor. This sets up:
- `documents` and `knowledge_status` tables.
- `pgvector` for storage.
- Storage bucket `pdf`.
- Row Level Security (RLS) for user isolation.

### 2. Edge Functions Deployment (Windows)
Inside the project folder, use `npx` to avoid global installation issues:
```bash
# 1. Login to Supabase
npx supabase login

# 2. Link your project
npx supabase link --project-ref yrrxicyznduhvgwjtarv

# 3. Deploy functions
npx supabase functions deploy chat
npx supabase functions deploy process-pdf
```

### 3. Environment Secrets
The Edge Functions need API keys to work. Run these once:
```bash
npx supabase secrets set GROQ_API_KEY=your_key_here
npx supabase secrets set HUGGINGFACE_TOKEN=your_token_here
```

### 4. Final Check & Verification
1. **Verify Live URL**:
   Open `https://yrrxicyznduhvgwjtarv.supabase.co/functions/v1/chat` in your browser.
   - ✅ **Method Not Allowed**: Function is live!
   - ❌ **404 Not Found**: Deployment required.

2. **Test Directly**:
   Run this to confirm Groq + RAG are linked:
   ```bash
   npx supabase functions invoke chat --body '{"query":"hello"}'
   ```

3. **Check Secrets**:
   ```bash
   npx supabase secrets list
   ```

### 5. Frontend Setup
```bash
npm install
# Create .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

## 🛠 Features
- **Modern UI**: React + Framer Motion + Lucide.
- **RAG Architecture**: Smart chunking (500 tokens) and hybrid search.
- **Security**: User-isolated documents via JWT + RLS.
- **Embeddable**: One-line script ([widget.js](widget.js)) for any website.
