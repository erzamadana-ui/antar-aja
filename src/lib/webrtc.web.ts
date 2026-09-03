// WebRTC untuk web — API bawaan browser.
export const RTCPeerConnection = globalThis.RTCPeerConnection;
export const RTCSessionDescription = globalThis.RTCSessionDescription;
export const RTCIceCandidate = globalThis.RTCIceCandidate;
export const getUserMedia = (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c);
export const supported = typeof globalThis.RTCPeerConnection !== 'undefined';
export function attachRemote(stream: MediaStream) {
  const el = document.createElement('audio'); el.autoplay = true; el.srcObject = stream; el.style.display = 'none'; document.body.appendChild(el);
  return () => { el.srcObject = null; el.remove(); };
}
export function setSpeaker(_on: boolean) { /* web: speaker default */ }
