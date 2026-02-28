import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── DEBUG LOGGER ─────────────────────────────────────────────
const log = {
    info: (...args: any[]) => console.log('[INFO] ', ...args),
    debug: (...args: any[]) => console.log('[DEBUG]', ...args),
    warn: (...args: any[]) => console.warn('[WARN] ', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    step: (n: number, msg: string) => console.log(`\n─── STEP ${n}: ${msg} ───`)
}

serve(async (req) => {
    log.debug('Incoming request:', req.method, req.url)

    if (req.method === 'OPTIONS') {
        log.debug('CORS preflight — responding OK')
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // ── STEP 1: Parse request body ─────────────────────────
        log.step(1, 'Parse request body')
        let body: any
        try {
            body = await req.json()
        } catch (e) {
            log.error('Failed to parse JSON body:', e)
            throw new Error('Invalid JSON body')
        }

        const { content, fileName, replaceAll } = body
        log.debug('content length:', content?.length ?? 'N/A')
        log.debug('fileName:', fileName)
        log.debug('replaceAll:', replaceAll)

        if (!content || typeof content !== 'string' || content.trim().length < 5) {
            log.error('Content validation failed. type:', typeof content, 'length:', content?.length)
            throw new Error('Missing or invalid content (must be a non-empty string)')
        }

        // ── STEP 2: Auth header ────────────────────────────────
        log.step(2, 'Check Authorization header')
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            log.error('No Authorization header present')
            throw new Error('Missing Authorization header')
        }
        log.debug('Auth header present. Prefix:', authHeader.substring(0, 15) + '...')

        // ── STEP 3: Env vars ───────────────────────────────────
        log.step(3, 'Load environment variables')
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        const hfToken = Deno.env.get('HUGGINGFACE_TOKEN')

        log.debug('SUPABASE_URL:', supabaseUrl ? '✅ set' : '❌ MISSING')
        log.debug('SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ set' : '❌ MISSING')
        log.debug('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅ set' : '❌ MISSING')
        log.debug('HUGGINGFACE_TOKEN:', hfToken ? '✅ set' : '❌ MISSING')

        if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) throw new Error('Missing Supabase env vars')
        if (!hfToken) throw new Error('Missing HUGGINGFACE_TOKEN env var')

        // ── STEP 4: Auth — verify user ─────────────────────────
        log.step(4, 'Verify user JWT')
        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
        })
        const { data: { user }, error: authError } = await userClient.auth.getUser()

        if (authError || !user) {
            log.error('Auth failed:', authError?.message ?? 'User not found')
            throw new Error(`Auth failed: ${authError?.message ?? 'User not returned'}`)
        }
        const userId = user.id
        log.info('Authenticated user:', userId, '|', user.email)

        // ── STEP 5: Service client ─────────────────────────────
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // ── STEP 6: Delete old docs ────────────────────────────
        log.step(6, replaceAll ? 'Delete ALL docs for user' : `Delete docs by fileName: ${fileName}`)
        const name = (fileName || 'uploaded_content').trim()
        if (replaceAll) {
            const { error } = await supabase.from('documents').delete().eq('user_id', userId)
            if (error) log.warn('Delete-all error:', error.message)
            else log.debug('Deleted all docs for user')
        } else {
            const { error } = await supabase.from('documents').delete()
                .eq('user_id', userId).eq('file_name', name)
            if (error) log.warn('Delete-by-name error:', error.message)
            else log.debug('Deleted existing docs with name:', name)
        }

        // ── STEP 7: Chunk text ─────────────────────────────────
        log.step(7, 'Chunk text')
        const chunks = chunkText(content.trim(), 500, 50)
        log.info(`Chunked into ${chunks.length} pieces (content ${content.length} chars)`)

        if (chunks.length > 500) {
            throw new Error(`Too many chunks (${chunks.length}). Max is 500. Please shorten the document.`)
        }

        // ── STEP 8: Embed + Insert ─────────────────────────────
        log.step(8, 'Generate embeddings and insert into DB')
        let successCount = 0
        for (let i = 0; i < chunks.length; i += 2) {
            const batch = chunks.slice(i, i + 2)
            log.debug(`Batch ${Math.floor(i / 2) + 1}/${Math.ceil(chunks.length / 2)} — ${batch.length} chunks`)

            await Promise.all(batch.map(async (chunk, bi) => {
                const chunkIdx = i + bi
                try {
                    log.debug(`  Embedding chunk #${chunkIdx} (${chunk.length} chars)`)
                    const embedding = await generateEmbedding(chunk, hfToken)
                    log.debug(`  Embedding #${chunkIdx} → vector[${embedding.length}]`)

                    const { error } = await supabase.from('documents').insert({
                        user_id: userId,
                        file_name: name,
                        content: chunk,
                        embedding
                    })
                    if (error) {
                        log.error(`  DB insert #${chunkIdx} failed:`, error.message)
                        throw new Error(`DB insert failed: ${error.message}`)
                    }
                    successCount++
                    log.debug(`  ✅ Chunk #${chunkIdx} stored`)
                } catch (e: any) {
                    log.error(`  ❌ Chunk #${chunkIdx} error:`, e.message)
                    throw e
                }
            }))
        }

        log.info(`All chunks stored: ${successCount}/${chunks.length}`)

        // ── STEP 9: Update knowledge_status ───────────────────
        log.step(9, 'Update knowledge_status')
        const { error: statusError } = await supabase.from('knowledge_status').upsert({
            user_id: userId,
            is_uploaded: true,
            updated_at: new Date().toISOString()
        })
        if (statusError) log.warn('knowledge_status upsert failed:', statusError.message)
        else log.debug('knowledge_status updated ✅')

        log.info('✅ process-content completed successfully')
        return new Response(JSON.stringify({ success: true, chunks: chunks.length }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200
        })

    } catch (err: any) {
        log.error('─────────────────────────────')
        log.error('FATAL ERROR:', err.message)
        log.error('Stack:', err.stack)
        log.error('─────────────────────────────')
        return new Response(JSON.stringify({
            success: false,
            error: err.message,
            details: err.stack
        }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        })
    }
})

// ── HELPERS ───────────────────────────────────────────────────

function chunkText(text: string, size: number, overlap: number): string[] {
    const chunks: string[] = []
    for (let i = 0; i < text.length; i += (size - overlap)) {
        chunks.push(text.substring(i, i + size))
        if (chunks.length >= 500) break
    }
    return chunks
}

async function generateEmbedding(text: string, hfToken: string): Promise<number[]> {
    log.debug('  HuggingFace API call for text:', text.substring(0, 60) + '...')
    const response = await fetch(
        "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${hfToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ inputs: text }),
        }
    )

    log.debug('  HuggingFace response status:', response.status)
    if (!response.ok) {
        const errBody = await response.text()
        log.error('  HuggingFace error body:', errBody.slice(0, 300))
        throw new Error(`HuggingFace API Error (${response.status}): ${errBody.slice(0, 150)}`)
    }

    const result = await response.json()
    if (!Array.isArray(result)) {
        log.error('  Unexpected HuggingFace response format:', typeof result, JSON.stringify(result).slice(0, 100))
        throw new Error(`Unexpected embedding format: ${typeof result}`)
    }

    return result
}
