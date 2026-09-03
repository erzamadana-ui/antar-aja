// Penunjuk tipe; Metro memilih webrtc.web.ts / webrtc.native.ts saat bundling.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const RTCPeerConnection: any = undefined;
export const RTCSessionDescription: any = undefined;
export const RTCIceCandidate: any = undefined;
export const getUserMedia: (c: any) => Promise<any> = async () => { throw new Error('unsupported'); };
export const supported = false;
export function attachRemote(_s: any): () => void { return () => {}; }
export function setSpeaker(_on: boolean) {}
