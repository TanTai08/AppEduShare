import { LEAFLET_JS, LEAFLET_CSS } from './vendor/leafletAssets';
export type Pin = { latitude: number; longitude: number };
export interface MapProps {
  pin: Pin | null;
  editable?: boolean;
  onChange?: (pin: Pin) => void;
}
const TILE_URL =
  process.env.EXPO_PUBLIC_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  process.env.EXPO_PUBLIC_MAP_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export function mapHtml(pin: Pin | null, editable = false) {
  const lat = pin?.latitude ?? 16.0544,
    lon = pin?.longitude ?? 108.2022;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${LEAFLET_CSS}</style><style>html,body,#map{height:100%;margin:0;font-family:Arial}#error{position:absolute;z-index:9999;background:white;padding:12px;display:none}</style></head><body><div id="error">Không tải được bản đồ. Kiểm tra Internet; bạn vẫn có thể nhập tọa độ bên dưới.</div><div id="map"></div><script>${LEAFLET_JS}</script><script>
 if(!window.L){document.getElementById('error').style.display='block';}else{
 const map=L.map('map').setView([${lat},${lon}],${pin ? 15 : 12});
 L.tileLayer(${JSON.stringify(TILE_URL)},{maxZoom:19,attribution:${JSON.stringify(ATTRIBUTION)}}).addTo(map);
 const icon=L.divIcon({className:'pickup-pin',html:'<div style="background:#174D3C;color:#DDF5A1;border:3px solid white;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;box-shadow:0 2px 8px #0004">●</div>',iconSize:[30,30],iconAnchor:[15,15]});
 let marker=${pin ? `L.marker([${lat},${lon}],{icon}).addTo(map)` : 'null'};
 ${editable ? `map.on('click',e=>{const pin={latitude:e.latlng.lat,longitude:e.latlng.lng};if(marker)marker.setLatLng(e.latlng);else marker=L.marker(e.latlng,{icon}).addTo(map);const data={type:'edushare:pin',pin};if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(data));else window.parent.postMessage(data,'*');});` : ''}
 setTimeout(()=>map.invalidateSize(),200);
 }</script></body></html>`;
}
export function validPin(value: unknown): value is Pin {
  const p = value as Pin;
  return (
    !!p &&
    typeof p.latitude === 'number' &&
    Number.isFinite(p.latitude) &&
    Math.abs(p.latitude) <= 90 &&
    typeof p.longitude === 'number' &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.longitude) <= 180
  );
}
