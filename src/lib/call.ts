// Panggilan suara dalam aplikasi (WebRTC) — nomor HP tidak pernah dibagikan (UU PDP).
// Sinyal lewat Supabase Realtime broadcast:
//   call:<userId>      → 'ring' (undangan), 'accept', 'decline', 'busy', 'end'
//   callsig:<callId>   → 'offer', 'answer', 'ice', 'end'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { Platform } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useAuth } from '@/store/auth';
import * as rtc from './webrtc';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';
export interface CallPeer { id: string; name: string; avatar?: string | null; role?: string }
interface CallState {
  phase: CallPhase; callId: string | null; orderId: string | null; peer: CallPeer | null; incomingFrom: CallPeer | null;
  muted: boolean; speaker: boolean; startedAt: number | null; error: string | null; endReason: string | null;
  listen: () => void;                 // dengarkan panggilan masuk (sekali, di root)
  startCall: (peer: CallPeer, orderId?: string | null) => Promise<string | null>;
  accept: () => Promise<void>;
  decline: () => void;
  hangup: (reason?: string) => void;
  toggleMute: () => void; toggleSpeaker: () => void;
  reset: () => void;
}

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' },
  ...(process.env.EXPO_PUBLIC_TURN_URL ? [{ urls: process.env.EXPO_PUBLIC_TURN_URL, username: process.env.EXPO_PUBLIC_TURN_USER, credential: process.env.EXPO_PUBLIC_TURN_PASS }] : [])];

let inbox: RealtimeChannel | null = null;   // call:<me>
let sig: RealtimeChannel | null = null;     // callsig:<callId>
let pc: any = null; let local: any = null; let detachRemote: (() => void) | null = null;
let ringTimer: ReturnType<typeof setTimeout> | null = null;
let pendingIce: any[] = [];

const me = () => { const a = useAuth.getState(); return { id: a.session?.user.id ?? '', name: a.profile?.full_name ?? 'Pengguna', avatar: a.profile?.avatar_url ?? null, role: a.profile?.role }; };
const sendTo = async (userId: string, event: string, payload: Record<string, unknown>) => {
  const ch = supabase.channel(`call:${userId}`);
  await new Promise<void>((res) => ch.subscribe((st) => { if (st === 'SUBSCRIBED') res(); }));
  await ch.send({ type: 'broadcast', event, payload });
  setTimeout(() => supabase.removeChannel(ch), 500);
};

async function openSignal(callId: string, onMsg: (ev: string, p: any) => void) {
  if (sig) supabase.removeChannel(sig);
  sig = supabase.channel(`callsig:${callId}`);
  ['offer', 'answer', 'ice', 'end'].forEach((ev) => sig!.on('broadcast', { event: ev }, ({ payload }) => onMsg(ev, payload)));
  await new Promise<void>((res) => sig!.subscribe((st) => { if (st === 'SUBSCRIBED') res(); }));
}
const sigSend = (event: string, payload: Record<string, unknown>) => sig?.send({ type: 'broadcast', event, payload: { ...payload, from: me().id } });

async function setupPeer(set: (p: Partial<CallState>) => void, get: () => CallState) {
  if (!rtc.supported) throw new Error(Platform.OS === 'web' ? 'Browser tidak mendukung panggilan suara' : 'Panggilan suara butuh APK build (tidak tersedia di Expo Go)');
  local = await rtc.getUserMedia({ audio: true, video: false });
  pc = new rtc.RTCPeerConnection({ iceServers: ICE });
  local.getTracks().forEach((t: any) => pc.addTrack(t, local));
  pc.onicecandidate = (e: any) => { if (e.candidate) sigSend('ice', { candidate: e.candidate }); };
  pc.ontrack = (e: any) => { const stream = e.streams?.[0]; if (stream) { detachRemote?.(); detachRemote = rtc.attachRemote(stream); } };
  pc.onconnectionstatechange = () => {
    const st = pc?.connectionState;
    if (st === 'connected') set({ phase: 'active', startedAt: get().startedAt ?? Date.now() });
    if (st === 'failed' || st === 'disconnected' || st === 'closed') { if (get().phase !== 'ended') get().hangup(st === 'failed' ? 'Koneksi gagal' : 'Terputus'); }
  };
}
function teardown() {
  try { pc?.close(); } catch { /* noop */ }
  try { local?.getTracks?.().forEach((t: any) => t.stop()); } catch { /* noop */ }
  detachRemote?.(); detachRemote = null; pc = null; local = null; pendingIce = [];
  if (sig) { supabase.removeChannel(sig); sig = null; }
  if (ringTimer) { clearTimeout(ringTimer); ringTimer = null; }
}
async function flushIce() { for (const c of pendingIce) { try { await pc.addIceCandidate(new rtc.RTCIceCandidate(c)); } catch { /* noop */ } } pendingIce = []; }

export const useCall = create<CallState>((set, get) => ({
  phase: 'idle', callId: null, orderId: null, peer: null, incomingFrom: null, muted: false, speaker: Platform.OS !== 'web', startedAt: null, error: null, endReason: null,

  listen: () => {
    const uid = me().id; if (!uid || inbox) return;
    inbox = supabase.channel(`call:${uid}`);
    inbox.on('broadcast', { event: 'ring' }, ({ payload }) => {
      if (get().phase !== 'idle') { sendTo(payload.from.id, 'busy', { callId: payload.callId }); return; }
      set({ phase: 'incoming', callId: payload.callId, orderId: payload.orderId ?? null, incomingFrom: payload.from, peer: payload.from, error: null, endReason: null });
      ringTimer = setTimeout(() => { if (get().phase === 'incoming') { set({ phase: 'ended', endReason: 'Tidak terjawab' }); supabase.from('call_logs').update({ status: 'missed', ended_at: new Date().toISOString() }).eq('id', payload.callId).then(() => {}); } }, 40000);
    });
    inbox.on('broadcast', { event: 'accept' }, async ({ payload }) => {
      if (get().phase !== 'outgoing' || payload.callId !== get().callId) return;
      set({ phase: 'connecting' });
      try {
        await setupPeer(set, get);
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        sigSend('offer', { sdp: pc.localDescription });
      } catch (e) { get().hangup((e as Error).message); }
    });
    inbox.on('broadcast', { event: 'decline' }, ({ payload }) => { if (payload.callId === get().callId) { teardown(); set({ phase: 'ended', endReason: 'Ditolak' }); } });
    inbox.on('broadcast', { event: 'busy' }, ({ payload }) => { if (payload.callId === get().callId) { teardown(); set({ phase: 'ended', endReason: 'Sedang sibuk' }); } });
    inbox.on('broadcast', { event: 'end' }, ({ payload }) => { if (payload.callId === get().callId && get().phase !== 'idle') { teardown(); set({ phase: 'ended', endReason: get().phase === 'incoming' ? 'Panggilan dibatalkan' : 'Panggilan berakhir' }); } });
    inbox.subscribe();
  },

  startCall: async (peer, orderId = null) => {
    if (get().phase !== 'idle') return null;
    const m = me(); if (!m.id) return null;
    const { data, error } = await supabase.from('call_logs').insert({ order_id: orderId, caller_id: m.id, callee_id: peer.id, status: 'ringing' }).select('id').single();
    if (error || !data) { set({ phase: 'ended', endReason: error?.message ?? 'Gagal memulai' }); return null; }
    const callId = data.id as string;
    set({ phase: 'outgoing', callId, orderId, peer, incomingFrom: null, error: null, endReason: null, muted: false, startedAt: null });
    await openSignal(callId, async (ev, p) => {
      if (p?.from === m.id) return;
      if (ev === 'answer' && pc) { await pc.setRemoteDescription(new rtc.RTCSessionDescription(p.sdp)); await flushIce(); }
      else if (ev === 'ice') { if (pc?.remoteDescription) { try { await pc.addIceCandidate(new rtc.RTCIceCandidate(p.candidate)); } catch { /* noop */ } } else pendingIce.push(p.candidate); }
      else if (ev === 'end') { teardown(); set({ phase: 'ended', endReason: 'Panggilan berakhir' }); }
    });
    await sendTo(peer.id, 'ring', { callId, orderId, from: m });
    ringTimer = setTimeout(() => { if (get().phase === 'outgoing') get().hangup('Tidak dijawab'); }, 45000);
    return callId;
  },

  accept: async () => {
    const { callId, incomingFrom } = get(); if (!callId || !incomingFrom) return;
    if (ringTimer) { clearTimeout(ringTimer); ringTimer = null; }
    set({ phase: 'connecting', startedAt: null });
    try {
      await setupPeer(set, get);
      await openSignal(callId, async (ev, p) => {
        if (p?.from === me().id) return;
        if (ev === 'offer' && pc) {
          await pc.setRemoteDescription(new rtc.RTCSessionDescription(p.sdp));
          await flushIce();
          const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
          sigSend('answer', { sdp: pc.localDescription });
        } else if (ev === 'ice') { if (pc?.remoteDescription) { try { await pc.addIceCandidate(new rtc.RTCIceCandidate(p.candidate)); } catch { /* noop */ } } else pendingIce.push(p.candidate); }
        else if (ev === 'end') { teardown(); set({ phase: 'ended', endReason: 'Panggilan berakhir' }); }
      });
      await sendTo(incomingFrom.id, 'accept', { callId });
      supabase.from('call_logs').update({ status: 'answered', answered_at: new Date().toISOString() }).eq('id', callId).then(() => {});
      rtc.setSpeaker(get().speaker);
    } catch (e) { get().hangup((e as Error).message); }
  },

  decline: () => {
    const { callId, incomingFrom } = get();
    if (callId && incomingFrom) { sendTo(incomingFrom.id, 'decline', { callId }); supabase.from('call_logs').update({ status: 'declined', ended_at: new Date().toISOString() }).eq('id', callId).then(() => {}); }
    teardown(); set({ phase: 'ended', endReason: 'Ditolak' });
  },

  hangup: (reason) => {
    const { callId, peer, phase } = get();
    if (callId) {
      sigSend('end', {});
      if (peer && (phase === 'outgoing' || phase === 'incoming')) sendTo(peer.id, 'end', { callId });
      supabase.from('call_logs').update({ status: phase === 'active' || phase === 'connecting' ? 'ended' : 'missed', ended_at: new Date().toISOString() }).eq('id', callId).then(() => {});
    }
    teardown(); set({ phase: 'ended', endReason: reason ?? 'Panggilan berakhir' });
  },

  toggleMute: () => { const m = !get().muted; local?.getAudioTracks?.().forEach((t: any) => { t.enabled = !m; }); set({ muted: m }); },
  toggleSpeaker: () => { const sp = !get().speaker; rtc.setSpeaker(sp); set({ speaker: sp }); },
  reset: () => { teardown(); set({ phase: 'idle', callId: null, orderId: null, peer: null, incomingFrom: null, muted: false, startedAt: null, error: null, endReason: null }); },
}));

export const callSupported = rtc.supported;
