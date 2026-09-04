// Edge Function: buat transaksi Midtrans Snap (top up / bayar) — atau mode simulasi bila MIDTRANS_SERVER_KEY belum diisi.
// Secrets: MIDTRANS_SERVER_KEY (sandbox: SB-Mid-server-xxx), MIDTRANS_IS_PRODUCTION ("true"/"false")
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const METHODS: Record<string, string[]> = { gopay: ["gopay"], shopeepay: ["shopeepay"], qris: ["other_qris"], bank_transfer: ["bank_transfer"], ovo: ["other_qris"], dana: ["other_qris"], any: [] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Harus login" }, 401);
    const { amount, method = "any", purpose = "topup", order_id = null } = await req.json();
    const amt = Math.round(Number(amount));
    if (!amt || amt < 10000 || amt > 10000000) return json({ error: "Nominal Rp10.000 – Rp10.000.000" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: prof } = await admin.from("profiles").select("full_name, email, phone").eq("id", user.id).single();
    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
    const externalId = `AAPAY-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const provider = serverKey ? "midtrans" : "simulated";

    const { data: pay, error } = await admin.from("payments").insert({ user_id: user.id, order_id, purpose, amount: amt, method, provider, external_id: externalId }).select("*").single();
    if (error) return json({ error: error.message }, 500);

    if (!serverKey) {
      return json({ payment: pay, simulated: true, message: "Mode simulasi: isi secret MIDTRANS_SERVER_KEY untuk transaksi asli." });
    }

    const isProd = (Deno.env.get("MIDTRANS_IS_PRODUCTION") ?? "false") === "true";
    const base = isProd ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
    const body = {
      transaction_details: { order_id: externalId, gross_amount: amt },
      item_details: [{ id: purpose, price: amt, quantity: 1, name: purpose === "topup" ? "Top up AntarPay" : "Pembayaran pesanan AntarKita" }],
      customer_details: { first_name: prof?.full_name ?? "Pengguna", email: prof?.email ?? user.email, phone: prof?.phone ?? undefined },
      enabled_payments: METHODS[method]?.length ? METHODS[method] : undefined,
      expiry: { unit: "minutes", duration: 30 },
    };
    const res = await fetch(`${base}/snap/v1/transactions`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Basic " + btoa(serverKey + ":") }, body: JSON.stringify(body),
    });
    const snap = await res.json();
    if (!res.ok || !snap.token) { await admin.from("payments").update({ status: "failure", raw: snap }).eq("id", pay.id); return json({ error: snap.error_messages?.join(", ") ?? "Midtrans menolak transaksi" }, 502); }
    const { data: updated } = await admin.from("payments").update({ snap_token: snap.token, redirect_url: snap.redirect_url, raw: snap }).eq("id", pay.id).select("*").single();
    return json({ payment: updated, simulated: false, snap_token: snap.token, redirect_url: snap.redirect_url, client_key: Deno.env.get("MIDTRANS_CLIENT_KEY") ?? null, is_production: isProd });
  } catch (e) { return json({ error: (e as Error).message }, 500); }
});
