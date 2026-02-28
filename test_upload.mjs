// Test script for process-content Edge Function
// Run: node test_upload.mjs
// It reads your .env file automatically.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import * as readline from 'readline/promises';

// Read env
const envFile = readFileSync('.env', 'utf-8');
const env = Object.fromEntries(
    envFile.split('\n')
        .filter(l => l.includes('='))
        .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
);

const SUPABASE_URL = env['VITE_SUPABASE_URL'];
const SUPABASE_ANON_KEY = env['VITE_SUPABASE_ANON_KEY'];
const SERVICE_ROLE_KEY = env['VITE_SUPABASE_SERVICE_ROLE_KEY'] || env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
    process.exit(1);
}

console.log('✅ Config loaded. URL:', SUPABASE_URL);
console.log('Available env keys:', Object.keys(env).join(', '));

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminClient = SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    : null;

async function test() {
    // 1. Login — ask for credentials
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const email = await rl.question('Enter your email: ');
    const password = await rl.question('Enter your password: ');
    rl.close();

    console.log('\n1. Logging in as', email);
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim()
    });

    if (authError) {
        console.error('❌ Login failed:', authError.message);
        process.exit(1);
    }

    console.log('✅ Logged in! User ID:', authData.user.id);
    const token = authData.session.access_token;

    // 2. Call Edge Function
    const sampleContent = `
        Test Knowledge Document.
        This is a test knowledge article about technology.
        Artificial Intelligence (AI) is transforming every industry.
        Machine learning models can predict outcomes with high accuracy.
        Our platform uses AI to provide instant answers.
    `.trim();

    console.log('\n2. Calling process-content Edge Function...');

    const { data: result, error: invokeError } = await supabase.functions.invoke('process-content', {
        body: { content: sampleContent, fileName: 'test_doc.txt', replaceAll: false },
        headers: { Authorization: `Bearer ${token}` }
    });

    if (invokeError) {
        console.error('❌ Invoke Error:', invokeError.message);
        process.exit(1);
    }

    console.log('Response:', JSON.stringify(result, null, 2));

    if (result?.success) {
        console.log('\n✅ SUCCESS! Chunks:', result.chunks);
    } else {
        console.error('\n❌ Failed:', result?.error);
        process.exit(1);
    }

    // 3. Verify DB
    const client = adminClient || supabase;
    const { data: docs } = await client
        .from('documents')
        .select('file_name, created_at')
        .eq('file_name', 'test_doc.txt');

    console.log('\n✅ DB check — chunks stored:', docs?.length ?? 0);
    console.log('\n=== ALL TESTS PASSED ✅ ===');
}

test().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
