// Peta untuk Android/iOS: Leaflet di dalam WebView (tanpa API key, jalan di Expo Go).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { buildMapHtml, type MapProps } from './shared';
import { LEAFLET_JS, LEAFLET_CSS } from './leaflet-bundle';
import { colors } from '@/lib/theme';

export default function MapView(props: MapProps) {
  const { center, zoom = 15, markers = [], polyline, fitTo, onCenterChange, onPress, interactive = true, style, paddingBottom = 0 } = props;
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const html = useMemo(() => buildMapHtml(LEAFLET_JS, LEAFLET_CSS, center, zoom), []); // eslint-disable-line react-hooks/exhaustive-deps
  const lastCenter = useRef(center);

  const state = useMemo(() => ({ markers, polyline, fitTo, interactive, zoom, paddingBottom, center, moveCenter: false }), [markers, polyline, fitTo, interactive, zoom, paddingBottom, center]);

  // Kirim perubahan state ke WebView
  useEffect(() => {
    if (!ready) return;
    const moveCenter = !fitTo && (center.lat !== lastCenter.current.lat || center.lng !== lastCenter.current.lng);
    lastCenter.current = center;
    ref.current?.injectJavaScript(`window.__update && window.__update(${JSON.stringify({ ...state, moveCenter })}); true;`);
  }, [ready, state, center, fitTo]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.type === 'ready') setReady(true);
      else if (m.type === 'moveend') onCenterChange?.({ lat: m.lat, lng: m.lng, zoom: m.zoom });
      else if (m.type === 'click') onPress?.({ lat: m.lat, lng: m.lng });
    } catch { /* abaikan */ }
  };

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={ref}
        source={{ html, baseUrl: 'https://antaraja.local/' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setBuiltInZoomControls={false}
        androidLayerType="hardware"
        allowsInlineMediaPlayback
        style={{ backgroundColor: '#e8ecef', flex: 1 }}
        containerStyle={{ flex: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1, overflow: 'hidden', backgroundColor: colors.border } });
