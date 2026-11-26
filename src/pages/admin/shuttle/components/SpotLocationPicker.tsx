import { useEffect, useRef, useState } from 'react';
import { spotPosition } from '../model/spotPosition';

export const SpotLocationPicker = ({ lat, lng, onPick }: { lat: string; lng: string; onPick: (lat: number, lng: number) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onPickRef = useRef(onPick);
  const positionRef = useRef({ lat, lng });
  const [error, setError] = useState('');
  const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID as string | undefined;
  onPickRef.current = onPick;
  positionRef.current = { lat, lng };

  useEffect(() => {
    if (!clientId) { setError('웹 지도 Client ID 설정이 필요합니다.'); return; }
    let cancelled = false;
    let script: HTMLScriptElement | null = null;
    let ownedMap: any = null;
    let ownedMarker: any = null;
    const listeners: any[] = [];
    const initialize = () => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const naver = (window as any).naver;
      if (!naver?.maps) { setError('네이버 지도 모듈을 불러오지 못했습니다.'); return; }
      const position = spotPosition(positionRef.current.lat, positionRef.current.lng);
      const center = new naver.maps.LatLng(position?.lat ?? 37.5666103, position?.lng ?? 126.9783882);
      ownedMap = new naver.maps.Map(containerRef.current, { center, zoom: position ? 18 : 14 });
      ownedMarker = new naver.maps.Marker({ map: ownedMap, position: center, visible: Boolean(position), draggable: true });
      mapRef.current = ownedMap; markerRef.current = ownedMarker;
      const pick = (event: any) => {
        if (cancelled || mapRef.current !== ownedMap) return;
        const picked = spotPosition(String(event.coord.lat()), String(event.coord.lng()));
        if (!picked) return;
        ownedMarker.setVisible(true); ownedMarker.setPosition(event.coord);
        onPickRef.current(picked.lat, picked.lng);
      };
      listeners.push(naver.maps.Event.addListener(ownedMap, 'click', pick));
      listeners.push(naver.maps.Event.addListener(ownedMarker, 'dragend', pick));
      setError('');
    };
    const scriptError = () => { if (!cancelled) setError('네이버 지도 스크립트 로드에 실패했습니다.'); };
    if ((window as any).naver?.maps) initialize();
    else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-ipasscare-naver-map]');
      script = existing || document.createElement('script');
      if (!existing) {
        script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
        script.async = true; script.dataset.ipasscareNaverMap = 'true';
      }
      script.addEventListener('load', initialize, { once: true });
      script.addEventListener('error', scriptError, { once: true });
      if (!existing) document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      script?.removeEventListener('load', initialize);
      script?.removeEventListener('error', scriptError);
      const naver = (window as any).naver;
      if (naver?.maps?.Event) listeners.forEach(listener => naver.maps.Event.removeListener(listener));
      ownedMarker?.setMap(null);
      if (mapRef.current === ownedMap) mapRef.current = null;
      if (markerRef.current === ownedMarker) markerRef.current = null;
      // Shared SDK script is intentionally retained for other map instances.
    };
  }, [clientId]);

  useEffect(() => {
    const naver = (window as any).naver;
    if (!mapRef.current || !markerRef.current || !naver?.maps) return;
    const next = spotPosition(lat, lng);
    if (!next) { markerRef.current.setVisible(false); return; }
    const position = new naver.maps.LatLng(next.lat, next.lng);
    markerRef.current.setVisible(true); markerRef.current.setPosition(position);
    mapRef.current.setCenter(position);
  }, [lat, lng]);

  return <div><div className="mb-2 flex items-center justify-between"><span className="text-xs font-black text-slate-600">지도에서 상세 위치 지정</span><span className="text-[11px] font-bold text-blue-600">지도 클릭 또는 마커 이동</span></div><div className="relative h-72 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><div ref={containerRef} className="h-full w-full"/>{error && <div className="absolute inset-0 flex items-center justify-center bg-slate-50 p-5 text-center text-xs font-bold text-slate-500">{error}</div>}</div><p className="mt-2 text-[11px] font-bold text-slate-400">주소 검색 후 실제 승·하차 지점을 지도에서 눌러 정문, 후문 등 세부 좌표를 맞춰 주세요.</p></div>;
};
