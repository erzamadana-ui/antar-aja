// Buat tiket aduan / pertanyaan
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Card, Input, Button, Row, Chip, toast } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { DocUpload } from '@/components/DocUpload';
import { useAuth } from '@/store/auth';
import { useMode } from '@/store/mode';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font } from '@/lib/theme';
import { ticketCategoryLabel, serviceLabel, formatDate } from '@/lib/format';
import type { Order, Ticket, TicketCategory } from '@/lib/types';

const CATS: TicketCategory[] = ['order', 'payment', 'driver', 'merchant', 'account', 'app', 'safety', 'other'];

export default function NewTicket() {
  const router = useRouter();
  const params = useLocalSearchParams<{ order_id?: string; category?: string; subject?: string }>();
  const { session, profile } = useAuth();
  const mode = useMode((s) => s.mode);
  const [cat, setCat] = useState<TicketCategory>((params.category as TicketCategory) ?? 'order');
  const [subject, setSubject] = useState(params.subject ?? '');
  const [desc, setDesc] = useState('');
  const [orderId, setOrderId] = useState<string | null>(params.order_id ?? null);
  const [attachment, setAttachment] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const role = mode === 'admin' ? 'customer' : mode;

  useEffect(() => {
    if (!session) return;
    const col = role === 'driver' ? 'driver_id' : role === 'merchant' ? 'merchant_id' : 'customer_id';
    const q = supabase.from('orders').select('id, code, service, status, created_at, total').order('created_at', { ascending: false }).limit(6);
    (role === 'merchant' ? supabase.from('merchants').select('id').eq('owner_id', session.user.id).maybeSingle().then(({ data }) => (data ? q.eq(col, (data as { id: string }).id) : q.eq('customer_id', session.user.id))) : Promise.resolve(q.eq(col, session.user.id)))
      .then((qq) => qq).then(({ data }) => setOrders((data as unknown as Order[]) ?? []));
  }, [session, role]);

  const submit = async () => {
    if (subject.trim().length < 4) return toast.error('Judul minimal 4 huruf');
    setBusy(true);
    try {
      const t = await rpc<Ticket>('create_ticket', { p: { category: cat, subject, description: desc, order_id: orderId, role, attachments: attachment ? [attachment] : [] } });
      toast.success(`Tiket ${t.code} dibuat`);
      router.replace(`/support/${t.id}` as never);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Screen title="Tiket aduan baru" back footer={<Button title="Kirim ke CS" size="lg" icon="send" loading={busy} onPress={submit} />}>
      <View style={{ gap: 16 }}>
        <Entrance index={0}><Card style={{ gap: 10 }}>
          <Text style={font.label}>Kategori</Text>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>{CATS.map((c) => <Chip key={c} label={ticketCategoryLabel[c]} active={cat === c} onPress={() => setCat(c)} color={c === 'safety' ? colors.danger : colors.primary} />)}</Row>
          {cat === 'safety' && <Text style={[font.tiny, { color: colors.danger }]}>Laporan keamanan diproses dengan prioritas DARURAT. Bila dalam bahaya, gunakan tombol SOS di layar pesanan atau hubungi 112.</Text>}
          <Text style={font.tiny}>Anda melapor sebagai <Text style={{ fontWeight: '700' }}>{role === 'driver' ? 'Driver' : role === 'merchant' ? 'Merchant' : 'Pelanggan'}</Text> · {profile?.full_name}</Text>
        </Card></Entrance>
        <Entrance index={1}><Card style={{ gap: 12 }}>
          <Input label="Judul singkat" placeholder="Contoh: Saldo top up belum masuk" value={subject} onChangeText={setSubject} />
          <Input label="Ceritakan kendalanya" placeholder="Jelaskan kronologi, jumlah, jam kejadian…" value={desc} onChangeText={setDesc} multiline style={{ minHeight: 110, textAlignVertical: 'top' }} />
          <DocUpload label="Lampiran (opsional)" hint="Tangkapan layar / bukti transfer" value={attachment} onChange={setAttachment} bucket="proofs" />
        </Card></Entrance>
        {orders.length > 0 && (
          <Entrance index={2}><Card style={{ gap: 10 }}>
            <Text style={font.label}>Terkait pesanan (opsional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="Tidak ada" active={!orderId} onPress={() => setOrderId(null)} />
              {orders.map((o) => <Chip key={o.id} label={`${serviceLabel[o.service]} · ${o.code.slice(-5)} · ${formatDate(o.created_at, false)}`} active={orderId === o.id} onPress={() => setOrderId(o.id)} />)}
            </ScrollView>
          </Card></Entrance>
        )}
      </View>
    </Screen>
  );
}
