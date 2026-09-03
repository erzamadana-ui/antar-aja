// Edge Function: notifikasi Midtrans (HTTP notification) → verifikasi signature → payment_settle().
// Juga menerima {simulate: external_id} dari aplikasi HANYA saat MIDTRANS_SERVER_KEY belum diisi (mode simulasi).
// verify_jwt = false karena Midtrans memanggil tanpa JWT; keaslian dicek lewat signature_key (SHA-512 server key).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
async function sha512(s: string) { const d = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(s)); return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join(""); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");

    // ---- Simulasi (hanya jika belum ada server key) ----
    if (body.simulate) {
      if (serverKey) return json({ error: "Simulasi dimatikan: gateway asli aktif" }, 403);
      const auth = req.headers.get("Authorization") ?? "";
      const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await supa.auth.getUser();
      if (!user) return json({ error: "Harus login" }, 401);
      const { data: p } = await admin.from("payments").select("*").eq("external_id", body.simulate).eq("user_id", user.id).single();
      if (!p) return json({ error: "Payment tidak ditemukan" }, 404);
      const { data, error } = await admin.rpc("payment_settle", { p_external_id: p.external_id, p_status: body.status === "cancel" ? "cancel" : "settlement", p_raw: { simulated: true, at: new Date().toISOString() } });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, payment: data });
    }

    // ---- Notifikasi Midtrans asli ----
    if (!serverKey) return json({ error: "Server key belum diatur" }, 400);
    const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = body;
    const expected = await sha512(`${order_id}${status_code}${gross_amount}${serverKey}`);
    if (expected !== signature_key) return json({ error: "Signature tidak valid" }, 403);
    let status = "pending";
    if (transaction_status === "capture") status = fraud_status === "accept" ? "settlement" : "pending";
    else if (transaction_status === "settlement") status = "settlement";
    else if (["cancel", "deny", "expire", "failure"].includes(transaction_status)) status = transaction_status;
    const { data, error } = await admin.rpc("payment_settle", { p_external_id: order_id, p_status: status, p_raw: body });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, status: data?.status });
  } catch (e) { return json({ error: (e as Error).message }, 500); }
});
