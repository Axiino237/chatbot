// Full System Test — reads from .env, tests all components
// Run: node full_test.mjs
import { readFileSync } from 'fs';

// ── Load .env ─────────────────────────────────────────────────
const envText = readFileSync('.env', 'utf-8');
const env = Object.fromEntries(
    envText.split('\n')
        .filter(l => l.includes('='))
        .map(l => {
            const idx = l.indexOf('=');
            return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        })
);
const SUPABASE_URL = env['VITE_SUPABASE_URL'];
const ANON_KEY = env['VITE_SUPABASE_ANON_KEY'];
const HF_TOKEN = env['VITE_HUGGINGFACE_TOKEN'];

const passed = [];
const failed = [];

const ok = (name, msg) => { console.log(`  ✅ ${name}: ${msg}`); passed.push(name); };
const err = (name, msg) => { console.log(`  ❌ ${name}: ${msg}`); failed.push(name); };

async function main() {
    console.log('\n════════════════════════════════════════');
    console.log('  CHATBOT PLUGIN — FULL SYSTEM TEST');
    console.log('════════════════════════════════════════\n');

    // ── TEST 1: ENV vars ──────────────────────────────────────
    console.log('TEST 1: Environment Variables');
    if (SUPABASE_URL?.startsWith('https://')) ok('SUPABASE_URL', SUPABASE_URL);
    else err('SUPABASE_URL', `Missing or invalid: "${SUPABASE_URL}"`);

    if (ANON_KEY?.length > 20) ok('ANON_KEY', `present (${ANON_KEY.length} chars)`);
    else err('ANON_KEY', 'Missing or too short');

    if (HF_TOKEN?.startsWith('hf_')) ok('HF_TOKEN', `present (${HF_TOKEN.length} chars)`);
    else err('HF_TOKEN', `Invalid format: "${HF_TOKEN?.slice(0, 10)}..."`);

    // ── TEST 2: Supabase Reachability ─────────────────────────
    console.log('\nTEST 2: Supabase API Reachability');
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
            headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
        });
        if (res.ok || res.status === 404) ok('Supabase REST', `Reachable (status ${res.status})`);
        else err('Supabase REST', `Status ${res.status}`);
    } catch (e) { err('Supabase REST', e.message); }

    // ── TEST 3: HuggingFace API ───────────────────────────────
    console.log('\nTEST 3: HuggingFace Embedding API');
    try {
        const res = await fetch(
            'https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5',
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputs: 'Hello world test' })
            }
        );
        const data = await res.json();
        if (res.ok && Array.isArray(data) && data.length > 0) {
            ok('HuggingFace API', `Returns vector of ${data.length} dims`);
        } else {
            err('HuggingFace API', `Status ${res.status} | Body: ${JSON.stringify(data).slice(0, 100)}`);
        }
    } catch (e) { err('HuggingFace API', e.message); }

    // ── TEST 4: DB — documents table ─────────────────────────
    console.log('\nTEST 4: Supabase DB Tables');
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/documents?limit=1`, {
            headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
        });
        if (res.status === 200) ok('documents table', 'exists and accessible');
        else if (res.status === 401) ok('documents table', 'exists (RLS blocked anon, correct)');
        else {
            const body = await res.text();
            err('documents table', `Status ${res.status} — ${body.slice(0, 100)}`);
        }
    } catch (e) { err('documents table', e.message); }

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_status?limit=1`, {
            headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
        });
        if (res.status === 200 || res.status === 401) ok('knowledge_status table', 'exists');
        else {
            const body = await res.text();
            err('knowledge_status table', `Status ${res.status} — ${body.slice(0, 100)}`);
        }
    } catch (e) { err('knowledge_status table', e.message); }

    // ── TEST 5: Edge Function reachability ────────────────────
    console.log('\nTEST 5: Edge Function — process-content');
    try {
        // Send request WITHOUT auth to specifically test the function exists
        const res = await fetch(`${SUPABASE_URL}/functions/v1/process-content`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: ANON_KEY,
                Authorization: `Bearer ${ANON_KEY}`
            },
            body: JSON.stringify({ content: 'Test content for the chatbot.', fileName: 'test.txt' })
        });

        const body = await res.json();
        console.log('  Response status:', res.status);
        console.log('  Response body:', JSON.stringify(body, null, 2).split('\n').map(l => '  ' + l).join('\n'));

        if (res.status === 200 && body.success) {
            ok('process-content', `Working! Chunks: ${body.chunks}`);
        } else if (res.status === 200 && body.success === false) {
            // Function ran but returned an error — it's reachable
            err('process-content logic', body.error);
            // But the function itself is reachable
            ok('process-content reachability', 'Function exists and responds');
        } else if (res.status === 404) {
            err('process-content', 'Function not found (not deployed?)');
        } else {
            err('process-content', `Status ${res.status}`);
        }
    } catch (e) { err('process-content', e.message); }

    // ── SUMMARY ───────────────────────────────────────────────
    console.log('\n════════════════════════════════════════');
    console.log('  RESULTS SUMMARY');
    console.log('════════════════════════════════════════');
    console.log(`  ✅ Passed: ${passed.length}  |  ❌ Failed: ${failed.length}`);
    if (passed.length) console.log('  Passed:', passed.join(', '));
    if (failed.length) console.log('  Failed:', failed.join(', '));
    console.log('════════════════════════════════════════\n');
}

main().catch(e => {
    console.error('\n❌ Unexpected error:', e.message);
    process.exit(1);
});
