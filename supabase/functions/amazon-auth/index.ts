import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CLIENT_ID = "amzn1.application-oa2-client.0a99108302814533924041f9061e4955";
const CLIENT_SECRET = "amzn1.oa2-cs.v1.befbf6ac9d995939de3ad7f7215b083e937489ca5bdce55ba92937de86be9b5e";
const REDIRECT_URI = "https://dist-gns3rzxc6-mohamd1.vercel.app/auth";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  
  const { code } = await req.json();
  
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    }),
  });
  
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
