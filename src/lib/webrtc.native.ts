// WebRTC untuk Android/iOS — react-native-webrtc (perlu build native; tidak jalan di Expo Go).
/* eslint-disable @typescript-eslint/no-explicit-any */
let mod: any = null;
try { mod = require('react-native-webrtc'); } catch { mod = null; }
export const supported = !!mod;
export const RTCPeerConnection: any = mod?.RTCPeerConnection;
export const RTCSessionDescription: any = mod?.RTCSessionDescription;
export const RTCIceCandidate: any = mod?.RTCIceCandidate;
export const getUserMedia = (c: any) => mod.mediaDevices.getUserMedia(c);
export function attachRemote(_stream: any) { return () => {}; }   // audio remote diputar otomatis oleh react-native-webrtc
export function setSpeaker(on: boolean) { try { mod?.InCallManager?.setForceSpeakerphoneOn?.(on); } catch { /* noop */ } }
