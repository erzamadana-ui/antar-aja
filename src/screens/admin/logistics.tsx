// Admin · Kota, Gudang Mitra (AntarSend antar kota), Rute & Mitra AntarTravel
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Switch } from 'react-native';
import { AdminPage, Table, FilterBar, ReasonPrompt } from '@/components/admin';
import { Card, Row, Input, Button, Chip, Badge, toast } from '@/components/ui';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font } from '@/lib/theme';
import { rupiah, formatDate, formatSchedule, cityName, travelRequestStatusLabel, travelKindLabel } from '@/lib/format';
import type { City, Warehouse, IntercityRate, TravelRoute, TravelPartner, Profile, ApprovalStatus, AdminTravelRequestRow, TravelRequestStatus } from '@/lib/types';

const REQ_STATUSES: TravelRequestStatus[] = ['open', 'offered', 'accepted', 'paid', 'ongoing', 'completed', 'cancelled', 'expired'];
const REQ_COLOR: Record<string, string> = { open: colors.warning, offered: colors.info, accepted: colors.travel, paid: colors.travel, ongoing: colors.primary, completed: colors.success, cancelled: colors.danger, expired: colors.textMuted };
const partnerServices = (p: TravelPartner) => [p.offers_shared !== false && 'Kursi', p.offers_charter && 'Carter', p.offers_daily && 'Harian'].filter(Boolean).join(' · ') || '—';

const emptyWh = { name: '', type: 'small', partner_name: '', address: '', lat: '', lng: '', phone: '', open_hours: '08:00-20:00', city_id: '' };
const emptyRoute = { from_city: '', to_city: '', distance_km: '', duration_h: '', seat_price: '', private_price: '', private_price_large: '', min_pax: '4' };

export default function AdminLogistics() {
  const [tab, setTab] = useState<'warehouse' | 'rates' | 'travel'>('warehouse');
  const [cities, setCities] = useState<City[]>([]);
  const [whs, setWhs] = useState<Warehouse[]>([]);
  const [rates, setRates] = useState<IntercityRate[]>([]);
  const [routes, setRoutes] = useState<TravelRoute[]>([]);
  const [partners, setPartners] = useState<(TravelPartner & { profile: Profile | null })[]>([]);
  const [wh, setWh] = useState({ ...emptyWh });
  const [rt, setRt] = useState({ ...emptyRoute });
  const [newCity, setNewCity] = useState({ name: '', province: '', lat: '', lng: '' });
  const [ask, setAsk] = useState<{ id: string; status: ApprovalStatus; name: string } | null>(null);
  const [reqs, setReqs] = useState<AdminTravelRequestRow[]>([]);
  const [reqStatus, setReqStatus] = useState<string>('all');
  const load = useCallback(async () => {
    const [{ data: c }, { data: w }, { data: r }, { data: tr }, { data: tp }, rq] = await Promise.all([
      supabase.from('cities').select('*').order('name'), supabase.from('warehouses').select('*').order('name'),
      supabase.from('intercity_rates').select('*'), supabase.from('travel_routes').select('*'),
      supabase.from('travel_partners').select('*, profile:profiles(*)').order('created_at', { ascending: false }),
      rpc<AdminTravelRequestRow[]>('admin_travel_requests', { p_status: null }).catch(() => [] as AdminTravelRequestRow[]),
    ]);
    setCities((c as City[]) ?? []); setWhs((w as Warehouse[]) ?? []); setRates((r as IntercityRate[]) ?? []); setRoutes((tr as TravelRoute[]) ?? []); setPartners((tp as never) ?? []); setReqs(rq ?? []);
  }, []);
  const filteredReqs = reqStatus === 'all' ? reqs : reqs.filter((q) => q.status === reqStatus);
  useEffect(() => { load(); }, [load]);

  const saveWh = async () => {
    if (!wh.city_id || wh.name.length < 3) return toast.error('Pilih kota & isi nama gudang');
    const lat = Number(wh.lat), lng = Number(wh.lng);
    const { error } = await supabase.from('warehouses').insert({ city_id: wh.city_id, name: wh.name, type: wh.type, partner_name: wh.partner_name || null, address: wh.address || null, phone: wh.phone || null, open_hours: wh.open_hours || null, location: lat && lng ? `POINT(${lng} ${lat})` : null });
    if (error) return toast.error(error.message);
    toast.success('Gudang mitra ditambahkan'); setWh({ ...emptyWh }); load();
  };
  const toggleWh = async (w: Warehouse) => { await supabase.from('warehouses').update({ active: !w.active }).eq('id', w.id); load(); };
  const saveCity = async () => {
    if (newCity.name.length < 3) return toast.error('Nama kota minimal 3 huruf');
    const lat = Number(newCity.lat), lng = Number(newCity.lng);
    const { error } = await supabase.from('cities').insert({ name: newCity.name, province: newCity.province || null, location: lat && lng ? `POINT(${lng} ${lat})` : null });
    if (error) return toast.error(error.message);
    toast.success('Kota ditambahkan'); setNewCity({ name: '', province: '', lat: '', lng: '' }); load();
  };
  const saveRate = async (r: IntercityRate, patch: Partial<IntercityRate>) => { const { error } = await supabase.from('intercity_rates').update(patch).eq('id', r.id); if (error) toast.error(error.message); else load(); };
  const saveRoute = async () => {
    if (!rt.from_city || !rt.to_city || rt.from_city === rt.to_city) return toast.error('Pilih kota asal & tujuan berbeda');
    if (!Number(rt.seat_price) || !Number(rt.private_price)) return toast.error('Isi harga kursi & private');
    const { error } = await supabase.from('travel_routes').upsert({ from_city: rt.from_city, to_city: rt.to_city, distance_km: Number(rt.distance_km) || 0, duration_h: Number(rt.duration_h) || 0, seat_price: Number(rt.seat_price), private_price: Number(rt.private_price), private_price_large: Number(rt.private_price_large) || null, min_pax: Number(rt.min_pax) || 4, active: true }, { onConflict: 'from_city,to_city' });
    if (error) return toast.error(error.message);
    toast.success('Rute travel disimpan'); setRt({ ...emptyRoute }); load();
  };
  const toggleRoute = async (r: TravelRoute) => { await supabase.from('travel_routes').update({ active: !r.active }).eq('id', r.id); load(); };
  const setPartner = async (id: string, status: ApprovalStatus, reason?: string) => {
    if ((status === 'suspended' || status === 'rejected') && reason === undefined) { setAsk({ id, status, name: partners.find((p) => p.id === id)?.company_name ?? 'mitra' }); return; }
    try { await rpc('admin_set_travel_partner', { p_id: id, p_status: status, p_reason: reason ?? null }); toast.success('Status mitra travel diperbarui'); setAsk(null); load(); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <AdminPage title="Logistik & Travel" subtitle="Kota layanan, gudang mitra AntarSend antar kota, tarif antar kota, rute & mitra AntarTravel" onRefresh={load}>
      <ReasonPrompt visible={!!ask} title={`${ask?.status === 'suspended' ? 'Tangguhkan' : 'Tolak'} ${ask?.name}?`} onCancel={() => setAsk(null)} onSubmit={(r) => setPartner(ask!.id, ask!.status, r)} confirmLabel={ask?.status === 'suspended' ? 'Tangguhkan' : 'Tolak'} />
      <FilterBar value={tab} onChange={(v) => setTab(v as never)} options={[{ key: 'warehouse', label: `Kota & Gudang (${whs.length})` }, { key: 'rates', label: 'Tarif antar kota' }, { key: 'travel', label: `AntarTravel (${routes.length} rute · ${partners.filter((p) => p.status === 'pending').length} pengajuan)` }]} />

      {tab === 'warehouse' && (<>
        <Row gap={16} style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Card style={{ flex: 1, minWidth: 320, gap: 10 }}>
            <Text style={font.label}>Tambah gudang mitra / drop point</Text>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>{cities.map((c) => <Chip key={c.id} label={c.name} active={wh.city_id === c.id} onPress={() => setWh({ ...wh, city_id: c.id })} color={colors.send} />)}</Row>
            <Row gap={8}><Chip label="Gudang besar" active={wh.type === 'big'} onPress={() => setWh({ ...wh, type: 'big' })} color={colors.send} /><Chip label="Gudang kecil (mitra warehouse)" active={wh.type === 'small'} onPress={() => setWh({ ...wh, type: 'small' })} color={colors.send} /></Row>
            <Input placeholder="Nama gudang / drop point" value={wh.name} onChangeText={(v) => setWh({ ...wh, name: v })} />
            <Input placeholder="Nama mitra / pemilik" value={wh.partner_name} onChangeText={(v) => setWh({ ...wh, partner_name: v })} />
            <Input placeholder="Alamat" value={wh.address} onChangeText={(v) => setWh({ ...wh, address: v })} />
            <Row gap={8}><Input placeholder="Lat" value={wh.lat} onChangeText={(v) => setWh({ ...wh, lat: v })} containerStyle={{ flex: 1 }} /><Input placeholder="Lng" value={wh.lng} onChangeText={(v) => setWh({ ...wh, lng: v })} containerStyle={{ flex: 1 }} /><Input placeholder="Jam buka" value={wh.open_hours} onChangeText={(v) => setWh({ ...wh, open_hours: v })} containerStyle={{ flex: 1 }} /></Row>
            <Input placeholder="Telepon" value={wh.phone} onChangeText={(v) => setWh({ ...wh, phone: v })} />
            <Button title="Simpan gudang" color={colors.send} onPress={saveWh} />
          </Card>
          <Card style={{ flex: 1, minWidth: 280, gap: 10 }}>
            <Text style={font.label}>Tambah kota layanan</Text>
            <Input placeholder="Nama kota" value={newCity.name} onChangeText={(v) => setNewCity({ ...newCity, name: v })} />
            <Input placeholder="Provinsi" value={newCity.province} onChangeText={(v) => setNewCity({ ...newCity, province: v })} />
            <Row gap={8}><Input placeholder="Lat pusat kota" value={newCity.lat} onChangeText={(v) => setNewCity({ ...newCity, lat: v })} containerStyle={{ flex: 1 }} /><Input placeholder="Lng" value={newCity.lng} onChangeText={(v) => setNewCity({ ...newCity, lng: v })} containerStyle={{ flex: 1 }} /></Row>
            <Button title="Tambah kota" variant="secondary" onPress={saveCity} />
            <Text style={font.tiny}>Kota dipakai untuk kota asal pesanan (tren trafik), gudang antar kota, dan rute travel. Setelah menambah kota, tambahkan gudang dan tarif antar kota (tab Tarif) serta rute travel (tab AntarTravel).</Text>
          </Card>
        </Row>
        <Table rows={whs as unknown as Record<string, unknown>[]} columns={[
          { key: 'name', label: 'Gudang', width: 240, render: (r) => { const w = r as unknown as Warehouse; return <View><Text style={{ fontWeight: '700' }}>{w.name}</Text><Text style={font.tiny} numberOfLines={2}>{w.address}</Text></View>; } },
          { key: 'city', label: 'Kota', width: 110, render: (r) => <Text style={font.small}>{cityName(cities, String(r.city_id))}</Text> },
          { key: 'type', label: 'Jenis', width: 120, render: (r) => <Badge text={r.type === 'big' ? 'Gudang besar' : 'Gudang kecil'} color={r.type === 'big' ? colors.send : colors.info} /> },
          { key: 'partner', label: 'Mitra', width: 170, render: (r) => { const w = r as unknown as Warehouse; return <Text style={font.small}>{w.partner_name ?? '—'}{'\n'}{w.phone ?? ''}</Text>; } },
          { key: 'open', label: 'Jam', width: 100, render: (r) => <Text style={font.tiny}>{String(r.open_hours ?? '')}</Text> },
          { key: 'active', label: 'Aktif', width: 80, render: (r) => { const w = r as unknown as Warehouse; return <Switch value={w.active} onValueChange={() => toggleWh(w)} trackColor={{ true: colors.success, false: colors.border }} thumbColor="#fff" />; } },
        ]} />
      </>)}

      {tab === 'rates' && (
        <Card padded={false}>
          <View style={{ padding: 14 }}><Text style={font.label}>Tarif antar kota (base + per kg, ETA hari)</Text><Text style={font.tiny}>Ketuk angka untuk mengubah, tersimpan otomatis.</Text></View>
          <Table rows={rates as unknown as Record<string, unknown>[]} columns={[
            { key: 'route', label: 'Rute', width: 220, render: (r) => <Text style={{ fontWeight: '700' }}>{cityName(cities, String(r.from_city))} → {cityName(cities, String(r.to_city))}</Text> },
            { key: 'base_fare', label: 'Tarif dasar', width: 130, render: (r) => <Input value={String(r.base_fare)} keyboardType="number-pad" onChangeText={(v) => saveRate(r as unknown as IntercityRate, { base_fare: Number(v) || 0 })} containerStyle={{ width: 110 }} /> },
            { key: 'per_kg', label: 'Per kg', width: 120, render: (r) => <Input value={String(r.per_kg)} keyboardType="number-pad" onChangeText={(v) => saveRate(r as unknown as IntercityRate, { per_kg: Number(v) || 0 })} containerStyle={{ width: 100 }} /> },
            { key: 'eta_days', label: 'ETA (hari)', width: 100, render: (r) => <Input value={String(r.eta_days)} keyboardType="number-pad" onChangeText={(v) => saveRate(r as unknown as IntercityRate, { eta_days: Number(v) || 1 })} containerStyle={{ width: 70 }} /> },
            { key: 'active', label: 'Aktif', width: 80, render: (r) => <Switch value={!!r.active} onValueChange={(v) => saveRate(r as unknown as IntercityRate, { active: v })} trackColor={{ true: colors.success, false: colors.border }} thumbColor="#fff" /> },
          ]} />
        </Card>
      )}

      {tab === 'travel' && (<>
        <Card style={{ gap: 10 }}>
          <Text style={font.label}>Rute travel (harga per kursi · carter private Innova · carter Hi-Ace · minimum penumpang)</Text>
          <Row gap={8} style={{ flexWrap: 'wrap' }}><Text style={font.tiny}>Dari:</Text>{cities.map((c) => <Chip key={c.id} label={c.name} active={rt.from_city === c.id} onPress={() => setRt({ ...rt, from_city: c.id })} color={colors.travel} />)}</Row>
          <Row gap={8} style={{ flexWrap: 'wrap' }}><Text style={font.tiny}>Ke:</Text>{cities.map((c) => <Chip key={c.id} label={c.name} active={rt.to_city === c.id} onPress={() => setRt({ ...rt, to_city: c.id })} color={colors.travel} />)}</Row>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            <Input placeholder="Jarak km" value={rt.distance_km} onChangeText={(v) => setRt({ ...rt, distance_km: v })} containerStyle={{ width: 100 }} />
            <Input placeholder="Durasi jam" value={rt.duration_h} onChangeText={(v) => setRt({ ...rt, duration_h: v })} containerStyle={{ width: 100 }} />
            <Input placeholder="Harga/kursi" value={rt.seat_price} onChangeText={(v) => setRt({ ...rt, seat_price: v })} containerStyle={{ width: 120 }} keyboardType="number-pad" />
            <Input placeholder="Private Innova" value={rt.private_price} onChangeText={(v) => setRt({ ...rt, private_price: v })} containerStyle={{ width: 130 }} keyboardType="number-pad" />
            <Input placeholder="Private Hi-Ace" value={rt.private_price_large} onChangeText={(v) => setRt({ ...rt, private_price_large: v })} containerStyle={{ width: 130 }} keyboardType="number-pad" />
            <Input placeholder="Min pax" value={rt.min_pax} onChangeText={(v) => setRt({ ...rt, min_pax: v })} containerStyle={{ width: 80 }} keyboardType="number-pad" />
            <Button title="Simpan rute" color={colors.travel} onPress={saveRoute} />
          </Row>
          <Text style={font.tiny}>Acuan 2026: kursi Padang–Pekanbaru Rp120–250rb, carter Hi-Ace ±Rp2,5 jt (citratrans.com, rentalmobilterdekat.com, jasasewamobilpekanbaru.com). Minimum penumpang 4 = asumsi praktik umum; ubah per rute bila perlu.</Text>
        </Card>
        <Table rows={routes as unknown as Record<string, unknown>[]} columns={[
          { key: 'route', label: 'Rute', width: 220, render: (r) => <Text style={{ fontWeight: '700' }}>{cityName(cities, String(r.from_city))} → {cityName(cities, String(r.to_city))}</Text> },
          { key: 'dist', label: 'Jarak / durasi', width: 130, render: (r) => <Text style={font.small}>{String(r.distance_km)} km · {String(r.duration_h)} jam</Text> },
          { key: 'seat_price', label: 'Per kursi', width: 110, render: (r) => <Text style={font.small}>{rupiah(Number(r.seat_price))}</Text> },
          { key: 'private', label: 'Private (Innova / Hi-Ace)', width: 200, render: (r) => <Text style={font.small}>{rupiah(Number(r.private_price))} / {r.private_price_large ? rupiah(Number(r.private_price_large)) : '—'}</Text> },
          { key: 'min_pax', label: 'Min pax', width: 80, render: (r) => <Badge text={String(r.min_pax)} /> },
          { key: 'active', label: 'Aktif', width: 80, render: (r) => <Switch value={!!r.active} onValueChange={() => toggleRoute(r as unknown as TravelRoute)} trackColor={{ true: colors.success, false: colors.border }} thumbColor="#fff" /> },
        ]} />
        <Card padded={false}>
          <View style={{ padding: 14 }}><Text style={font.label}>Mitra travel ({partners.length})</Text></View>
          <Table rows={partners as unknown as Record<string, unknown>[]} columns={[
            { key: 'name', label: 'Mitra', width: 220, render: (r) => { const p = r as unknown as TravelPartner & { profile: Profile | null }; return <View><Text style={{ fontWeight: '700' }}>{p.company_name ?? p.profile?.full_name}</Text><Text style={font.tiny}>{p.profile?.full_name} · {p.profile?.email}</Text></View>; } },
            { key: 'partner_type', label: 'Tipe', width: 100, render: (r) => { const p = r as unknown as TravelPartner; return <Badge text={p.partner_type === 'private' ? 'Sopir pribadi' : 'Agen travel'} color={p.partner_type === 'private' ? colors.info : colors.travel} />; } },
            { key: 'services', label: 'Layanan', width: 150, render: (r) => <Text style={font.small}>{partnerServices(r as unknown as TravelPartner)}</Text> },
            { key: 'daily_rate', label: 'Harga harian', width: 130, render: (r) => { const p = r as unknown as TravelPartner; return <Text style={font.small}>{p.daily_rate ? rupiah(p.daily_rate) : '—'}{p.overtime_rate ? `\n+${rupiah(p.overtime_rate)}/jam lembur` : ''}</Text>; } },
            { key: 'vehicle', label: 'Armada', width: 220, render: (r) => { const p = r as unknown as TravelPartner; return <Text style={font.small}>{p.vehicle_model} ({p.vehicle_year ?? '—'}) · {p.vehicle_plate} · {p.seats} kursi{p.is_electric ? ' (listrik)' : ''}</Text>; } },
            { key: 'stats', label: 'Performa', width: 120, render: (r) => { const p = r as unknown as TravelPartner; return <Text style={font.small}>⭐ {Number(p.rating_avg).toFixed(1)} · {p.total_trips} trip</Text>; } },
            { key: 'status', label: 'Status', width: 150, render: (r) => { const p = r as unknown as TravelPartner; return <View><Badge text={p.status} color={p.status === 'approved' ? colors.success : p.status === 'pending' ? colors.warning : colors.danger} />{p.status_reason && p.status !== 'approved' ? <Text style={font.tiny} numberOfLines={2}>{p.status_reason}</Text> : null}</View>; } },
            { key: 'created_at', label: 'Daftar', width: 110, render: (r) => <Text style={font.tiny}>{formatDate(String(r.created_at), false)}</Text> },
            { key: 'actions', label: 'Aksi', width: 220, render: (r) => { const p = r as unknown as TravelPartner; return (
              <Row gap={6}>
                {p.status !== 'approved' && <Button size="sm" title={p.status === 'suspended' ? 'Aktifkan' : 'Setujui'} color={colors.success} onPress={() => setPartner(p.id, 'approved', 'Diaktifkan oleh admin')} />}
                {p.status === 'pending' && <Button size="sm" title="Tolak" variant="outline" color={colors.danger} onPress={() => setPartner(p.id, 'rejected')} />}
                {p.status === 'approved' && <Button size="sm" title="Tangguhkan" variant="outline" color={colors.danger} onPress={() => setPartner(p.id, 'suspended')} />}
              </Row>); } },
          ]} emptyText="Belum ada mitra travel" />
        </Card>
        <Card padded={false}>
          <View style={{ padding: 14, gap: 8 }}>
            <Text style={font.label}>Permintaan travel (carter & sopir harian) · {reqs.length}</Text>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              <Chip label={`Semua (${reqs.length})`} active={reqStatus === 'all'} onPress={() => setReqStatus('all')} color={colors.travel} />
              {REQ_STATUSES.map((st) => { const n = reqs.filter((q) => q.status === st).length; return <Chip key={st} label={`${travelRequestStatusLabel[st] ?? st} (${n})`} active={reqStatus === st} onPress={() => setReqStatus(st)} color={colors.travel} />; })}
            </Row>
          </View>
          <Table rows={filteredReqs as unknown as Record<string, unknown>[]} emptyText="Belum ada permintaan travel" columns={[
            { key: 'code', label: 'Kode', width: 120, render: (r) => { const q = r as unknown as AdminTravelRequestRow; return <View><Text style={{ fontWeight: '700', color: colors.text }}>{q.code}</Text><Text style={font.tiny}>{formatDate(q.created_at, false)}</Text></View>; } },
            { key: 'kind', label: 'Jenis', width: 110, render: (r) => <Badge text={travelKindLabel[String(r.kind)] ?? String(r.kind)} color={colors.travel} /> },
            { key: 'status', label: 'Status', width: 150, render: (r) => <Badge text={travelRequestStatusLabel[String(r.status)] ?? String(r.status)} color={REQ_COLOR[String(r.status)] ?? colors.textMuted} /> },
            { key: 'customer_name', label: 'Pelanggan', width: 140, render: (r) => <Text style={font.small}>{String(r.customer_name ?? '—')}</Text> },
            { key: 'partner_name', label: 'Mitra', width: 140, render: (r) => <Text style={font.small}>{String(r.partner_name ?? '—')}</Text> },
            { key: 'route', label: 'Jemput → tujuan', width: 240, render: (r) => { const q = r as unknown as AdminTravelRequestRow; return <Text style={font.tiny} numberOfLines={2}>{q.pickup_address} → {q.dropoff_address ?? 'sesuai kebutuhan'}</Text>; } },
            { key: 'depart_at', label: 'Jadwal', width: 150, render: (r) => <Text style={font.tiny}>{formatSchedule(String(r.depart_at))}</Text> },
            { key: 'days', label: 'Hari / pax', width: 90, render: (r) => <Text style={font.small}>{String(r.days)} hari · {String(r.pax)} org</Text> },
            { key: 'price', label: 'Harga', width: 110, render: (r) => <Text style={font.small}>{Number(r.price) ? rupiah(Number(r.price)) : '—'}</Text> },
            { key: 'platform_fee', label: 'Fee platform', width: 110, render: (r) => <Text style={font.small}>{Number(r.platform_fee) ? rupiah(Number(r.platform_fee)) : '—'}</Text> },
            { key: 'payment_status', label: 'Pembayaran', width: 110, render: (r) => <Badge text={r.payment_status === 'paid' ? 'Dibayar' : r.payment_status === 'refunded' ? 'Dikembalikan' : 'Belum bayar'} color={r.payment_status === 'paid' ? colors.success : r.payment_status === 'refunded' ? colors.info : colors.warning} /> },
            { key: 'offers_count', label: 'Penawaran', width: 90, render: (r) => <Badge text={String(r.offers_count ?? 0)} /> },
          ]} />
        </Card>
      </>)}
    </AdminPage>
  );
}

