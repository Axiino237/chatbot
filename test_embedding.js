// CHATBOT QUALITY TEST - Embedding Verification
// Run: node test_embedding.js
import { readFileSync } from 'fs';

// -- Load env --
const env = Object.fromEntries(
    readFileSync('.env', 'utf-8').split('\n')
        .filter(l => l.includes('=')).map(l => {
            const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        })
);

const hfToken = env['VITE_HUGGINGFACE_TOKEN'];
if (!hfToken) {
    console.error("Missing VITE_HUGGINGFACE_TOKEN in .env");
    process.exit(1);
}

async function testEmbedding(text) {
    console.log("Testing text:", text);
    const response = await fetch(
        "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5",
        {
            headers: {
                Authorization: `Bearer ${hfToken}`,
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({ inputs: text }),
        }
    )

    if (!response.ok) {
        throw new Error(`HF Error: ${response.status} ${await response.text()}`)
    }

    const data = await response.json();
    console.log("Type of response:", typeof data);
    console.log("Is Array?", Array.isArray(data));
    if (Array.isArray(data)) {
        console.log("Length:", data.length);
        console.log("First element:", data[0]);
    } else {
        console.log("Data:", JSON.stringify(data, null, 2).slice(0, 200));
    }
}

testEmbedding("Hello world").catch(console.error);
