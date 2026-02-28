import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Buffer } from "node:buffer"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { record } = await req.json()
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) throw new Error('Missing Authorization header')

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        // 1. Verify user identity using the user's own token
        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
        })

        const { data: { user }, error: authError } = await userClient.auth.getUser()

        if (authError || !user) {
            console.error('Auth Error Details:', authError)
            throw new Error(`Invalid or expired session: ${authError?.message || 'User not found'}`)
        }

        const userId = user.id
        console.log('Verified User ID:', userId)

        // 2. Use Service Role client for DB/Storage operations (bypassing RLS for system task)
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 1. Get file from Storage
        console.log('Downloading file:', record.name)
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('pdf')
            .download(record.name)

        if (downloadError) {
            console.error('Storage Download Error:', downloadError)
            throw new Error(`Storage Download Error: ${downloadError.message}`)
        }

        // 2. Extract Text from PDF
        console.log('Extracting text from PDF bytes...')
        let text = ""
        try {
            const pdfBytes = await fileData.arrayBuffer()
            const buffer = Buffer.from(pdfBytes)

            const pdf = (await import("https://esm.sh/pdf-parse@1.1.1")).default
            const extractionResult = await pdf(buffer)

            if (!extractionResult || typeof extractionResult.text !== 'string') {
                throw new Error("pdf-parse returned invalid text result.")
            }

            text = extractionResult.text.replace(/\s+/g, ' ').trim()
            console.log('Successfully extracted text, length:', text.length)

            if (!text || text.length === 0) {
                throw new Error("PDF seems empty or contains no readable text. It might be an image-based PDF.")
            }

            // Heuristic to detect gibberish/unmapped font encoding
            // If the text contains more than 30% replacement characters or weird symbols, it's likely unreadable.
            const replacementChars = (text.match(/\ufffd/g) || []).length;
            if (replacementChars > text.length * 0.1) {
                throw new Error("PDF text encoding is unreadable. Please ensure the PDF uses standard fonts or try an OCR tool.");
            }

            // Check if there are almost no normal letters/numbers
            const normalChars = (text.match(/[\p{L}\p{N}]/gu) || []).length;
            if (normalChars < text.length * 0.2 && text.length > 50) {
                throw new Error("PDF extraction resulted in mostly unrecognized characters. The document might be using a custom font without unicode mapping.");
            }

        } catch (extractError: any) {
            console.error('PDF Extraction Error:', extractError)
            throw new Error(`Failed to extract readable text from PDF: ${extractError.message}`)
        }

        // 3. Chunk and Embed
        const chunks = chunkText(text, 500, 50)
        console.log('Generating embeddings for', chunks.length, 'chunks')

        if (chunks.length > 200) {
            throw new Error(`Document is too large (${chunks.length} chunks). Please upload a smaller document.`)
        }

        const insertPromises = chunks.map(async (chunk, index) => {
            try {
                const embedding = await generateEmbedding(chunk)
                const { error: insertError } = await supabase.from('documents').insert({
                    user_id: userId,
                    file_name: record.name,
                    content: chunk,
                    embedding: embedding
                })
                if (insertError) throw insertError
            } catch (e: any) {
                console.error(`Error processing chunk ${index}:`, e)
                throw new Error(`Failed to process section ${index + 1}: ${e.message}`)
            }
        })

        // Process in batches to avoid hitting rate limits or timeouts
        for (let i = 0; i < insertPromises.length; i += 2) {
            console.log(`Processing batch ${Math.floor(i / 2) + 1} of ${Math.ceil(insertPromises.length / 2)}...`)
            const batch = insertPromises.slice(i, i + 2)
            await Promise.all(batch)
        }

        // 4. Update status
        console.log('Updating knowledge status...')
        const { error: upsertError } = await supabase.from('knowledge_status').upsert({
            user_id: userId,
            is_uploaded: true,
            updated_at: new Date().toISOString()
        })
        if (upsertError) {
            console.error('Knowledge Status Upsert Error:', upsertError)
            throw new Error(`Status Update Error: ${upsertError.message}`)
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200
        })
    } catch (err: any) {
        console.error('Final Edge Function Error:', err)
        // We return 200 even on error so the frontend supabase client doesn't swallow the JSON body
        return new Response(JSON.stringify({
            success: false,
            error: err.message,
            details: err.stack || 'No stack trace available'
        }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        })
    }
})

function chunkText(text: string, size: number, overlap: number) {
    // Simple chunking logic
    const chunks = []
    for (let i = 0; i < text.length; i += (size - overlap)) {
        chunks.push(text.substring(i, i + size))
    }
    return chunks
}

async function generateEmbedding(text: string) {
    const hfToken = Deno.env.get('HUGGINGFACE_TOKEN')?.trim()
    if (!hfToken) {
        throw new Error('HUGGINGFACE_TOKEN is not set in Supabase Secrets')
    }

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
        const errorText = await response.text()
        throw new Error(`HuggingFace API Error (${response.status}): ${errorText.slice(0, 100)}`)
    }

    try {
        return await response.json()
    } catch (e) {
        throw new Error('HuggingFace returned invalid JSON response')
    }
}
