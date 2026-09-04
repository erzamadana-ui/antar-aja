// AntarTravel — hook pencarian rute/jadwal, booking saya, jadwal mitra
import { useCallback, useEffect, useState } from 'react';
import { supabase, rpc } from '@/lib/supabase';
import type { City, TravelBooking, TravelPartner, TravelSearch, TravelTrip, TravelRoute } from '@/lib/types';

export function useCities() {
  const [cities, setCities] = useState<City[]>([]);
  useEffect(() => { supabase.from('cities').select('*').eq('active', true).order('name').then(({ data }) => setCities((data as City[]) ?? [])); }, []);
  return cities;
}
export function useTravelSearch(from?: string | null, to?: string | null, date?: string | null) {
  const [result, setResult] = useState<TravelSearch | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!from || !to || from === to) { setResult(null); return; }
    setLoading(true);
    try { setResult(await rpc<TravelSearch>('travel_search', { p_from: from, p_to: to, p_date: date ?? null })); } catch { setResult(null); }
    setLoading(false);
  }, [from, to, date]);
  useEffect(() => { reload(); }, [reload]);
  return { result, loading, reload };
}
export function useMyTravelBookings(uid?: string | null) {
  const [bookings, setBookings] = useState<(TravelBooking & { trip: TravelTrip & { route: TravelRoute; partner: TravelPartner } })[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from('travel_bookings').select('*, trip:travel_trips(*, route:travel_routes(*), partner:travel_partners(*))').eq('customer_id', uid).order('created_at', { ascending: false }).limit(30);
    setBookings((data as never) ?? []); setLoading(false);
  }, [uid]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (!uid) return;
    const ch = supabase.channel(`tb:${uid}`).on('postgres_changes', { event: '*', schema: 'public', table: 'travel_bookings', filter: `customer_id=eq.${uid}` }, reload).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, reload]);
  return { bookings, loading, reload };
}
export function usePartnerTrips(partnerId?: string | null) {
  const [trips, setTrips] = useState<(TravelTrip & { route: TravelRoute })[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!partnerId) return;
    const { data } = await supabase.from('travel_trips').select('*, route:travel_routes(*)').eq('partner_id', partnerId).order('depart_at', { ascending: false }).limit(40);
    setTrips((data as never) ?? []); setLoading(false);
  }, [partnerId]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (!partnerId) return;
    const ch = supabase.channel(`tt:${partnerId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'travel_bookings' }, reload).on('postgres_changes', { event: '*', schema: 'public', table: 'travel_trips', filter: `partner_id=eq.${partnerId}` }, reload).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [partnerId, reload]);
  return { trips, loading, reload };
}
