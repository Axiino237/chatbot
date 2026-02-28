import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
    const envVars = Object.keys(Deno.env.toObject());
    return new Response(JSON.stringify({ vars: envVars }), {
        headers: { 'Content-Type': 'application/json' }
    })
})
