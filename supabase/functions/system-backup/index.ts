import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Require admin JWT or the automation API key so this can't be triggered
  // anonymously (it is an admin/cron-only operation).
  const authError = await requireAdminOrApiKey(req, corsHeaders)
  if (authError) return authError

  try {
    const { action } = await req.json()

    if (action === 'full_backup') {
      // NOT IMPLEMENTED: a real backup would create a database dump, back up
      // file storage, archive logs, and upload to durable backup storage.
      // Until that exists we must not fabricate a success response.
      console.warn('system-backup invoked but backup is not implemented — returning 501')

      return new Response(
        JSON.stringify({
          success: false,
          status: 'not_implemented',
          message: 'System backup is not yet implemented. No backup was performed.',
        }),
        {
          status: 501,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Backup error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})