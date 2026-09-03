import type { LatLng } from '@/lib/types';
import type { ViewStyle } from 'react-native';

export type MarkerKind = 'pickup' | 'dropoff' | 'me' | 'motor' | 'car' | 'merchant' | 'driver';

export interface MapMarker { id: string; lat: number; lng: number; kind: MarkerKind; label?: string; heading?: number | null }

export interface MapProps {
  center: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  polyline?: [number, number][] | null;
  fitTo?: LatLng[] | null;           // jika diisi, peta menyesuaikan agar semua titik terlihat
  onCenterChange?: (c: LatLng & { zoom: number }) => void;
  onPress?: (p: LatLng) => void;
  interactive?: boolean;
  style?: ViewStyle;
  paddingBottom?: number;            // ruang untuk sheet di bawah agar fitBounds tidak tertutup
}

// Tile gratis tanpa API key. Ganti ke MapTiler/Google jika trafik sudah besar.
export const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

export const MARKER_COLORS: Record<MarkerKind, string> = {
  pickup: '#0E7C7B', dropoff: '#E5484D', me: '#2F80ED', motor: '#00A86B', car: '#2F80ED', merchant: '#EB5757', driver: '#00A86B',
};

/** Sumber JS pembuat ikon marker. Disimpan sebagai STRING karena Hermes (native) tidak
 *  menyimpan source function (toString() -> "[bytecode]"), sementara kode ini harus
 *  disuntikkan apa adanya ke WebView. Di web dievaluasi sekali lewat new Function. */
export const MARKER_JS_BODY = `
  var C = { pickup: '#0E7C7B', dropoff: '#E5484D', me: '#2F80ED', motor: '#00A86B', car: '#2F80ED', merchant: '#EB5757', driver: '#00A86B' };
  var c = C[kind] || '#0E7C7B';
  var esc = function (t) { return String(t).replace(/[&<>"']/g, function (ch) { return ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'; }); };
  var lbl = label ? '<div style="position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:2px;background:#fff;color:#0B1F2A;font:600 11px system-ui,sans-serif;padding:2px 6px;border-radius:6px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.25)">' + esc(label) + '</div>' : '';
  if (kind === 'pickup') {
    return { html: '<div style="position:relative;width:22px;height:22px"><div style="width:22px;height:22px;border-radius:50%;background:' + c + ';border:4px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>' + lbl + '</div>', size: [22, 22], anchor: [11, 11] };
  }
  if (kind === 'me') {
    return { html: '<div style="position:relative;width:20px;height:20px"><div style="position:absolute;left:-8px;top:-8px;right:-8px;bottom:-8px;border-radius:50%;background:' + c + ';opacity:.2"></div><div style="width:20px;height:20px;border-radius:50%;background:' + c + ';border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div></div>', size: [20, 20], anchor: [10, 10] };
  }
  if (kind === 'dropoff' || kind === 'merchant') {
    var glyph = kind === 'merchant'
      ? '<path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z" fill="#fff"/>'
      : '<circle cx="12" cy="12" r="4" fill="#fff"/>';
    return { html: '<div style="position:relative;width:34px;height:44px"><svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 0C7.6 0 0 7.6 0 17c0 12 17 27 17 27s17-15 17-27C34 7.6 26.4 0 17 0z" fill="' + c + '"/><g transform="translate(5,5)">' + glyph + '</g></svg>' + lbl + '</div>', size: [34, 44], anchor: [17, 44] };
  }
  var rot = typeof heading === 'number' && !isNaN(heading) ? heading : 0;
  var vehicle = kind === 'car'
    ? '<path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" fill="#fff"/>'
    : '<path d="M19.44 9.03L15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.65-1.97-4.77-4.56-4.97zM7.82 15C7.4 16.15 6.28 17 5 17c-1.63 0-3-1.37-3-3s1.37-3 3-3c1.28 0 2.4.85 2.82 2H5v2h2.82zM19 17c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" fill="#fff"/>';
  return {
    html: '<div style="position:relative;width:36px;height:36px"><div style="width:36px;height:36px;border-radius:50%;background:' + c + ';border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;transform:rotate(' + rot + 'deg)"><svg width="22" height="22" viewBox="0 0 24 24">' + vehicle + '</svg></div>' + lbl + '</div>',
    size: [36, 36], anchor: [18, 18]
  };
`;

export type MarkerSpec = { html: string; size: [number, number]; anchor: [number, number] };
export type MarkerHtmlFn = (kind: MarkerKind, heading?: number | null, label?: string) => MarkerSpec;

/** HTML lengkap untuk WebView (native). */
export function buildMapHtml(leafletJs: string, leafletCss: string, center: LatLng, zoom: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${leafletCss}
html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#e8ecef;overflow:hidden}
.leaflet-div-icon{background:transparent;border:0}
.leaflet-control-attribution{font-size:9px;opacity:.75}
</style></head><body><div id="map"></div>
<script>${leafletJs}</script>
<script>
(function(){
  var TILE='${TILE_URL}';
  var map=L.map('map',{zoomControl:false,attributionControl:true,tap:false}).setView([${center.lat},${center.lng}],${zoom});
  L.tileLayer(TILE,{maxZoom:19,subdomains:'abcd',attribution:'${TILE_ATTR.replace(/'/g, "\\'")}'}).addTo(map);
  var markers={},line=null,programmatic=false;
  var markerHtml=function(kind,heading,label){${MARKER_JS_BODY}};
  function post(m){ if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify(m));} }
  window.__update=function(st){
    try{
      if(st.interactive===false){map.dragging.disable();map.touchZoom.disable();map.doubleClickZoom.disable();map.scrollWheelZoom.disable();}else{map.dragging.enable();map.touchZoom.enable();map.doubleClickZoom.enable();map.scrollWheelZoom.enable();}
      var seen={};
      (st.markers||[]).forEach(function(m){
        seen[m.id]=true;
        var spec=markerHtml(m.kind,m.heading,m.label);
        var icon=L.divIcon({html:spec.html,className:'',iconSize:spec.size,iconAnchor:spec.anchor});
        if(markers[m.id]){markers[m.id].setLatLng([m.lat,m.lng]);markers[m.id].setIcon(icon);}
        else{markers[m.id]=L.marker([m.lat,m.lng],{icon:icon,interactive:false}).addTo(map);}
      });
      Object.keys(markers).forEach(function(k){ if(!seen[k]){map.removeLayer(markers[k]);delete markers[k];} });
      if(line){map.removeLayer(line);line=null;}
      if(st.polyline&&st.polyline.length>1){line=L.polyline(st.polyline,{color:'#0E7C7B',weight:5,opacity:.9,lineJoin:'round'}).addTo(map);}
      programmatic=true;
      if(st.fitTo&&st.fitTo.length>0){
        var b=L.latLngBounds(st.fitTo.map(function(p){return [p.lat,p.lng];}));
        if(st.fitTo.length===1){map.setView(b.getCenter(),st.zoom||16);} else {map.fitBounds(b,{paddingTopLeft:[40,80],paddingBottomRight:[40,(st.paddingBottom||0)+40],maxZoom:17});}
      } else if(st.center&&st.moveCenter){ map.setView([st.center.lat,st.center.lng],st.zoom||map.getZoom()); }
      setTimeout(function(){programmatic=false;},300);
    }catch(e){post({type:'error',message:String(e)});}
  };
  map.on('moveend',function(){ if(programmatic)return; var c=map.getCenter(); post({type:'moveend',lat:c.lat,lng:c.lng,zoom:map.getZoom()}); });
  map.on('click',function(e){ post({type:'click',lat:e.latlng.lat,lng:e.latlng.lng}); });
  setTimeout(function(){ map.invalidateSize(); post({type:'ready'}); },50);
})();
</script></body></html>`;
}
